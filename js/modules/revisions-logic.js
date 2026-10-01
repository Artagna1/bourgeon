/*
 * Bourgeon — module RÉVISIONS : règles de calcul (sans affichage).
 *
 * Répétition espacée : un CONCEPT se révise à des PALIERS (ex. J+1, J+7,
 * J+30, J+90). Le dernier palier est l'ENTRETIEN, répété indéfiniment.
 *
 * Données (data.revisions) :
 *   settings  = { defaultSteps: [1, 7, 30, 90], dayStartHour: 0 }
 *   stepTypes = [{ id, name, steps }]                 rythmes nommés
 *   subjects  = [{ id, name, frozenAt, stepTypeId }]  matières
 *   chapters  = [{ id, subjectId, name, frozenAt }]
 *   concepts  = [{ id, chapterId, name, addedAt, validations: [dates],
 *                  lastMaintenance, frozenAt }]
 *     validations[i] = date RÉELLE où le palier i a été coché.
 *     lastMaintenance = date de la dernière révision d'entretien (null tant
 *     que le concept n'est pas en entretien).
 *
 * « Aujourd'hui » est toujours la journée logique du module (réglage
 * « Nouvelle journée à partir de »), fournie par l'appelant.
 */
(function (B) {
  'use strict';

  var D = B.dates;

  function rev(data) { return data.revisions; }
  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
  function sameName(a, b) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }

  /* ---------- Réglages ---------- */

  /*
   * « 1, 7,30,90 » -> [1, 7, 30, 90]. Doublons retirés, liste triée.
   * Renvoie { ok, steps } ou { ok: false, error }.
   */
  function parseSteps(raw) {
    var parts = String(raw == null ? '' : raw).split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ''; });
    if (parts.length === 0) return { ok: false, error: 'Il faut au moins un palier.' };
    var bad = parts.some(function (s) { return !/^\d+$/.test(s) || parseInt(s, 10) <= 0; });
    if (bad) return { ok: false, error: 'Les paliers doivent être des nombres de jours strictement positifs.' };
    var steps = [];
    parts.forEach(function (s) { var n = parseInt(s, 10); if (steps.indexOf(n) < 0) steps.push(n); });
    steps.sort(function (a, b) { return a - b; });
    return { ok: true, steps: steps };
  }

  function formatSteps(steps) { return steps.join(','); }

  function setDefaultSteps(data, raw) {
    var r = parseSteps(raw);
    if (r.ok) rev(data).settings.defaultSteps = r.steps;
    return r;
  }

  function setDayStartHour(data, hour) {
    var n = parseInt(hour, 10);
    if (n >= 0 && n <= 11) rev(data).settings.dayStartHour = n;
  }

  /* Journée logique du module Révisions. */
  function today(data, now) {
    return D.logicalToday(rev(data).settings.dayStartHour, now);
  }

  /* ---------- Types de paliers (rythmes nommés) ---------- */

  function addStepType(data, rawName, rawSteps) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom de type de palier.');
    if (!name.ok) return name;
    if (rev(data).stepTypes.some(function (t) { return sameName(t.name, name.value); })) {
      return { ok: false, error: 'Un type de palier porte déjà ce nom.' };
    }
    var steps = parseSteps(rawSteps);
    if (!steps.ok) return steps;
    var type = { id: B.store.newId(), name: name.value, steps: steps.steps };
    rev(data).stepTypes.push(type);
    return { ok: true, type: type };
  }

  function updateStepType(data, id, rawName, rawSteps) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom de type de palier.');
    if (!name.ok) return name;
    if (rev(data).stepTypes.some(function (t) { return t.id !== id && sameName(t.name, name.value); })) {
      return { ok: false, error: 'Un type de palier porte déjà ce nom.' };
    }
    var steps = parseSteps(rawSteps);
    if (!steps.ok) return steps;
    var type = byId(rev(data).stepTypes, id);
    type.name = name.value;
    type.steps = steps.steps;
    return { ok: true };
  }

  /* Supprimer un type renvoie les matières qui l'utilisaient sur le rythme par défaut. */
  function deleteStepType(data, id) {
    rev(data).stepTypes = rev(data).stepTypes.filter(function (t) { return t.id !== id; });
    rev(data).subjects.forEach(function (s) { if (s.stepTypeId === id) s.stepTypeId = null; });
  }

  /* Paliers utilisés par une matière. */
  function stepsForSubject(data, subject) {
    var type = subject.stepTypeId && byId(rev(data).stepTypes, subject.stepTypeId);
    return type ? type.steps : rev(data).settings.defaultSteps;
  }

  function setSubjectStepType(data, subjectId, stepTypeId) {
    byId(rev(data).subjects, subjectId).stepTypeId = stepTypeId || null;
  }

  /* ---------- Arborescence : matières, chapitres, concepts ---------- */

  function addSubject(data, rawName) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom de matière.');
    if (!name.ok) return name;
    if (rev(data).subjects.some(function (s) { return sameName(s.name, name.value); })) {
      return { ok: false, error: 'Une matière porte déjà ce nom.' };
    }
    var subject = { id: B.store.newId(), name: name.value, frozenAt: null, stepTypeId: null };
    rev(data).subjects.push(subject);
    return { ok: true, subject: subject };
  }

  function addChapter(data, subjectId, rawName) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom de chapitre.');
    if (!name.ok) return name;
    var chapter = { id: B.store.newId(), subjectId: subjectId, name: name.value, frozenAt: null };
    rev(data).chapters.push(chapter);
    return { ok: true, chapter: chapter };
  }

  function addConcept(data, chapterId, rawName, day) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom de concept.');
    if (!name.ok) return name;
    var concept = {
      id: B.store.newId(), chapterId: chapterId, name: name.value, addedAt: day,
      validations: [], lastMaintenance: null, frozenAt: null
    };
    rev(data).concepts.push(concept);
    return { ok: true, concept: concept };
  }

  /* Renommer : kind = 'subject' | 'chapter' | 'concept'. */
  function rename(data, kind, id, rawName) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom.');
    if (!name.ok) return name;
    var list = listOf(data, kind);
    if (kind === 'subject' && list.some(function (s) { return s.id !== id && sameName(s.name, name.value); })) {
      return { ok: false, error: 'Une matière porte déjà ce nom.' };
    }
    byId(list, id).name = name.value;
    return { ok: true };
  }

  function listOf(data, kind) {
    return kind === 'subject' ? rev(data).subjects : kind === 'chapter' ? rev(data).chapters : rev(data).concepts;
  }

  function find(data, kind, id) { return byId(listOf(data, kind), id); }

  /* Geler / dégeler (réversible à tout moment). */
  function toggleFreeze(data, kind, id, day) {
    var item = find(data, kind, id);
    item.frozenAt = item.frozenAt ? null : day;
    return !!item.frozenAt;
  }

  /* Suppressions en cascade (les sessions Focus, elles, sont conservées). */
  function deleteConcept(data, id) {
    rev(data).concepts = rev(data).concepts.filter(function (c) { return c.id !== id; });
  }
  function deleteChapter(data, id) {
    rev(data).chapters = rev(data).chapters.filter(function (c) { return c.id !== id; });
    rev(data).concepts = rev(data).concepts.filter(function (c) { return c.chapterId !== id; });
  }
  function deleteSubject(data, id) {
    rev(data).chapters.filter(function (c) { return c.subjectId === id; })
      .forEach(function (c) { deleteChapter(data, c.id); });
    rev(data).subjects = rev(data).subjects.filter(function (s) { return s.id !== id; });
  }

  function chaptersOf(data, subjectId) {
    return rev(data).chapters.filter(function (c) { return c.subjectId === subjectId; });
  }
  function conceptsOf(data, chapterId) {
    return rev(data).concepts.filter(function (c) { return c.chapterId === chapterId; });
  }

  /* Matière d'un concept (via son chapitre). */
  function subjectOfConcept(data, concept) {
    var chapter = byId(rev(data).chapters, concept.chapterId);
    return { chapter: chapter, subject: chapter && byId(rev(data).subjects, chapter.subjectId) };
  }

  /* Un concept est gelé s'il l'est lui-même, ou son chapitre, ou sa matière. */
  function isFrozen(data, concept) {
    var parents = subjectOfConcept(data, concept);
    return !!(concept.frozenAt || (parents.chapter && parents.chapter.frozenAt) || (parents.subject && parents.subject.frozenAt));
  }

  /* ---------- Le cœur : état d'un concept ---------- */

  /*
   * Calcule l'état d'un concept pour une liste de paliers et un jour donné.
   *   index    : palier en cours (le dernier en entretien)
   *   due      : échéance du palier en cours
   *   isDue    : échéance aujourd'hui ou avant (=> apparaît dans « Aujourd'hui »)
   *   late     : échéance strictement passée
   *   lateDays : jours de retard
   *   cells    : état de chaque case : 'done' | 'late' | 'todo' | 'locked'
   *              (+ date de validation, et canUndo pour la case annulable)
   *
   * Règles :
   *   - 1er palier dû à : date d'ajout + premier palier ;
   *   - palier suivant dû (écart entre les deux paliers) jours après la date
   *     RÉELLE de validation du précédent ;
   *   - entretien : dû (dernier palier) jours après la dernière révision
   *     d'entretien. Un concept en entretien y reste, même si l'on change de
   *     rythme ; s'il a validé au moins autant de paliers que le rythme en
   *     compte, il est aussi en entretien.
   */
  function conceptState(concept, steps, day) {
    var k = steps.length, V = concept.validations, v = V.length;
    var inMaintenance = !!concept.lastMaintenance || v >= k;
    var s = { k: k, validated: v, inMaintenance: inMaintenance, cells: [] };

    if (inMaintenance) {
      var anchor = concept.lastMaintenance || V[v - 1];
      s.index = k - 1;
      s.due = D.addDays(anchor, steps[k - 1]);
    } else {
      s.index = v;
      s.due = v === 0 ? D.addDays(concept.addedAt, steps[0]) : D.addDays(V[v - 1], steps[v] - steps[v - 1]);
    }
    s.label = 'J+' + steps[s.index];
    s.isDue = s.due <= day;
    s.late = s.due < day;
    s.lateDays = Math.max(0, D.diffDays(s.due, day));

    for (var j = 0; j < k; j++) {
      var cell = { state: 'locked', date: V[j] || null, canUndo: false };
      if (inMaintenance) {
        if (j < k - 1) cell.state = 'done';
        else if (s.isDue) cell.state = s.late ? 'late' : 'todo';
        else { cell.state = 'done'; cell.date = concept.lastMaintenance || V[v - 1]; }
      } else if (j < v) cell.state = 'done';
      else if (j === v) cell.state = s.late ? 'late' : 'todo';
      s.cells.push(cell);
    }

    // Seul le DERNIER palier validé peut être décoché. En entretien, une case
    // cochée ne se décoche plus — sauf juste après l'entrée en entretien
    // (aucune révision d'entretien faite depuis), pour corriger une erreur.
    if (!inMaintenance && v > 0) s.cells[v - 1].canUndo = true;
    if (inMaintenance && v === k && concept.lastMaintenance === V[v - 1] && !s.isDue) s.cells[k - 1].canUndo = true;
    return s;
  }

  function stateOf(data, concept, day) {
    var subject = subjectOfConcept(data, concept).subject;
    return conceptState(concept, stepsForSubject(data, subject), day);
  }

  /*
   * Coche le palier en cours (on peut le faire avant son échéance ; la suite
   * s'ancre alors sur ce jour). En entretien, seulement quand il est dû.
   */
  function validate(data, conceptId, day) {
    var c = byId(rev(data).concepts, conceptId);
    var s = stateOf(data, c, day);
    if (s.inMaintenance) {
      if (!s.isDue) return false;
      c.lastMaintenance = day;
      return true;
    }
    c.validations.push(day);
    if (c.validations.length >= s.k) c.lastMaintenance = day;   // entrée en entretien
    return true;
  }

  /* Décoche le dernier palier validé : il redevient actif avec son ancienne échéance. */
  function undo(data, conceptId, day) {
    var c = byId(rev(data).concepts, conceptId);
    var s = stateOf(data, c, day);
    var last = s.cells.filter(function (cell) { return cell.canUndo; })[0];
    if (!last) return false;
    if (s.inMaintenance) c.lastMaintenance = null;
    c.validations.pop();
    return true;
  }

  /* ---------- Onglet AUJOURD'HUI ---------- */

  /*
   * Concepts dont le palier en cours est dû aujourd'hui ou en retard, hors
   * éléments gelés, du plus ancien au plus récent.
   */
  function todayList(data, day) {
    var order = {};
    rev(data).subjects.forEach(function (x, i) { order['s' + x.id] = i; });
    rev(data).chapters.forEach(function (x, i) { order['c' + x.id] = i; });

    var items = [];
    rev(data).concepts.forEach(function (c, i) {
      if (isFrozen(data, c)) return;
      var parents = subjectOfConcept(data, c);
      if (!parents.subject) return;
      var s = stateOf(data, c, day);
      if (!s.isDue) return;
      items.push({ concept: c, subject: parents.subject, chapter: parents.chapter, state: s,
        sort: [s.due, order['s' + parents.subject.id], order['c' + parents.chapter.id], i] });
    });
    items.sort(function (a, b) {
      for (var i = 0; i < a.sort.length; i++) {
        if (a.sort[i] < b.sort[i]) return -1;
        if (a.sort[i] > b.sort[i]) return 1;
      }
      return 0;
    });
    return items;
  }

  /*
   * Taille du titre selon le retard : la montée est rapide dès le premier
   * jour, puis plafonne au 4e jour.
   */
  function lateStyle(lateDays) {
    var table = [
      { size: 13, weight: 400 },
      { size: 17, weight: 600 },
      { size: 19, weight: 600 },
      { size: 21, weight: 700 },
      { size: 22, weight: 700 }
    ];
    return table[Math.min(Math.max(lateDays, 0), 4)];
  }

  B.revisionsLogic = {
    parseSteps: parseSteps, formatSteps: formatSteps, setDefaultSteps: setDefaultSteps,
    setDayStartHour: setDayStartHour, today: today,
    addStepType: addStepType, updateStepType: updateStepType, deleteStepType: deleteStepType,
    stepsForSubject: stepsForSubject, setSubjectStepType: setSubjectStepType,
    addSubject: addSubject, addChapter: addChapter, addConcept: addConcept, rename: rename, find: find,
    toggleFreeze: toggleFreeze, deleteConcept: deleteConcept, deleteChapter: deleteChapter, deleteSubject: deleteSubject,
    chaptersOf: chaptersOf, conceptsOf: conceptsOf, subjectOfConcept: subjectOfConcept, isFrozen: isFrozen,
    conceptState: conceptState, stateOf: stateOf, validate: validate, undo: undo,
    todayList: todayList, lateStyle: lateStyle
  };
})(window.Bourgeon = window.Bourgeon || {});
