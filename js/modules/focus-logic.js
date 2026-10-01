/*
 * Bourgeon — module FOCUS : règles de calcul (sans affichage).
 *
 * Le temps est toujours calculé à partir d'horodatages (heure de début,
 * heure actuelle, total des pauses), jamais en comptant des « tics » : il
 * reste juste même si l'ordinateur ralentit ou si la page est rechargée.
 * Le temps de pause n'est JAMAIS compté.
 *
 * Données (data.focus) :
 *   active   = session en cours (ou null), pour la reprendre après rechargement :
 *              { subjectId, chapterId, mode, startedAt (ms), pausedAt (ms|null),
 *                pausedTotal (ms), plannedSec, workSec, breakSec }
 *   sessions = sessions terminées :
 *              { id, subjectId, chapterId, mode, startedAt, endedAt, day,
 *                duration (s, hors pauses), plannedSec, completed, workCycles }
 *   settings = { alerts: true }  (son + notification en fin de phase)
 *   lastConfig = derniers réglages utilisés (pour préremplir le formulaire)
 */
(function (B) {
  'use strict';

  var D = B.dates;

  var MODES = { chrono: 'Chrono', sablier: 'Sablier', pomodoro: 'Pomodoro' };

  /* ---------- Configuration ---------- */

  function intIn(raw, min, max, emptyValue) {
    var s = String(raw == null ? '' : raw).trim();
    if (s === '' && emptyValue !== undefined) return emptyValue;
    if (!/^\d+$/.test(s)) return null;
    var n = parseInt(s, 10);
    return n >= min && n <= max ? n : null;
  }

  /*
   * Vérifie les réglages du formulaire.
   *   cfg = { target: 'subject'|'chapter', subjectId, chapterId, mode,
   *           hours, minutes, work, brk }
   * Renvoie { ok, config } ou { ok: false, error }.
   */
  function validateConfig(cfg) {
    var subjectId = cfg.subjectId || null;
    var chapterId = null;
    if (cfg.target === 'chapter') {
      if (!subjectId) return { ok: false, error: 'Merci de choisir une matière.' };
      if (!cfg.chapterId) return { ok: false, error: 'Merci de choisir un chapitre.' };
      chapterId = cfg.chapterId;
    }
    var config = { subjectId: subjectId, chapterId: chapterId, mode: cfg.mode, plannedSec: null, workSec: null, breakSec: null };
    var bad = { ok: false, error: 'Merci de vérifier les durées saisies.' };

    if (cfg.mode === 'sablier') {
      var hh = intIn(cfg.hours, 0, 23, 0), mm = intIn(cfg.minutes, 0, 59, 0);
      if (hh === null || mm === null || hh * 60 + mm === 0) return bad;
      config.plannedSec = (hh * 60 + mm) * 60;
    } else if (cfg.mode === 'pomodoro') {
      var w = intIn(cfg.work, 1, 300), p = intIn(cfg.brk, 1, 300);
      if (w === null || p === null) return bad;
      config.workSec = w * 60;
      config.breakSec = p * 60;
    } else if (cfg.mode !== 'chrono') {
      return bad;
    }
    return { ok: true, config: config };
  }

  /* ---------- Session en cours ---------- */

  function startSession(config, now) {
    return {
      subjectId: config.subjectId, chapterId: config.chapterId, mode: config.mode,
      startedAt: now, pausedAt: null, pausedTotal: 0,
      plannedSec: config.plannedSec, workSec: config.workSec, breakSec: config.breakSec
    };
  }

  function pause(a, now) { if (!a.pausedAt) a.pausedAt = now; }

  function resume(a, now) {
    if (!a.pausedAt) return;
    a.pausedTotal += now - a.pausedAt;
    a.pausedAt = null;
  }

  /* Temps effectif écoulé (secondes), pauses exclues. */
  function elapsedSec(a, now) {
    var paused = a.pausedTotal + (a.pausedAt ? now - a.pausedAt : 0);
    return Math.max(0, Math.floor((now - a.startedAt - paused) / 1000));
  }

  /*
   * Pomodoro : Travail → Pause → Travail… à l'infini (pas de pause longue).
   * Renvoie la phase en cours, le temps restant dans la phase, le numéro de
   * cycle, le temps de TRAVAIL compté et le nombre de phases de travail
   * terminées.
   */
  function pomodoro(a, now) {
    var e = elapsedSec(a, now);
    var cycle = a.workSec + a.breakSec;
    var index = Math.floor(e / cycle);
    var pos = e - index * cycle;
    var inWork = pos < a.workSec;
    return {
      phase: inWork ? 'work' : 'break',
      phaseLength: inWork ? a.workSec : a.breakSec,
      remaining: inWork ? a.workSec - pos : cycle - pos,
      cycle: index + 1,
      workDone: index * a.workSec + Math.min(pos, a.workSec),
      workCycles: index + (inWork ? 0 : 1)
    };
  }

  /* Ce qu'affiche le cadran : temps, progression (0 → 1), phase. */
  function display(a, now) {
    var e = elapsedSec(a, now);
    if (a.mode === 'sablier') {
      return { seconds: Math.max(0, a.plannedSec - e), progress: Math.min(1, e / a.plannedSec), finished: e >= a.plannedSec };
    }
    if (a.mode === 'pomodoro') {
      var p = pomodoro(a, now);
      return { seconds: p.remaining, progress: 1 - p.remaining / p.phaseLength, phase: p.phase, cycle: p.cycle, pomodoro: p };
    }
    return { seconds: e, progress: null };
  }

  /*
   * Termine la session et renvoie ce qui est enregistré.
   *   - Chrono : arrêt manuel = fin normale → « Terminée ».
   *   - Sablier : « Terminée » s'il est allé au bout, sinon « Interrompue »
   *     avec le temps réellement passé (seul cas d'« Interrompue »).
   *   - Pomodoro : seul le temps de travail compte ; arrêt manuel = « Terminée ».
   */
  function stopSession(a, now) {
    if (a.pausedAt) resume(a, now);
    var e = elapsedSec(a, now);
    var s = {
      id: B.store.newId(), subjectId: a.subjectId, chapterId: a.chapterId, mode: a.mode,
      startedAt: a.startedAt, endedAt: now, day: D.toStr(new Date(a.startedAt)),
      duration: e, plannedSec: a.plannedSec, completed: true, workCycles: null
    };
    if (a.mode === 'sablier') {
      s.completed = e >= a.plannedSec;
      s.duration = Math.min(e, a.plannedSec);
      if (s.completed) s.endedAt = now - (e - a.plannedSec) * 1000;   // heure réelle de fin
    } else if (a.mode === 'pomodoro') {
      var p = pomodoro(a, now);
      s.duration = p.workDone;
      s.workCycles = p.workCycles;
    }
    return s;
  }

  /*
   * Matière / chapitre supprimés entre-temps : la session est quand même
   * enregistrée, rattachée à la matière si seul le chapitre a disparu, sinon
   * « Sans matière ».
   */
  function attachToExisting(data, s) {
    var subject = s.subjectId && data.revisions.subjects.filter(function (x) { return x.id === s.subjectId; })[0];
    var chapter = s.chapterId && data.revisions.chapters.filter(function (x) { return x.id === s.chapterId; })[0];
    if (!subject) { s.subjectId = null; s.chapterId = null; }
    else if (!chapter) s.chapterId = null;
    return s;
  }

  /* ---------- Libellés ---------- */

  function subjectName(data, id) {
    var x = id && data.revisions.subjects.filter(function (s) { return s.id === id; })[0];
    return x ? x.name : null;
  }
  function chapterName(data, id) {
    var x = id && data.revisions.chapters.filter(function (c) { return c.id === id; })[0];
    return x ? x.name : null;
  }

  /* « Maths · Intégrales », « Maths », « Sans matière » (+ supprimés pendant une session). */
  function targetLabel(data, subjectId, chapterId, live) {
    if (!subjectId) return 'Sans matière';
    var sn = subjectName(data, subjectId);
    if (!sn) return live ? 'Matière supprimée' : 'Sans matière';
    if (!chapterId) return sn;
    var cn = chapterName(data, chapterId);
    if (cn) return sn + ' · ' + cn;
    return live ? sn + ' · Chapitre supprimé' : sn;
  }

  /* 90 -> "01:30", 3725 -> "1:02:05" (cadran) */
  function formatTimer(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? h + ':' + D.pad(m) + ':' + D.pad(s) : D.pad(m) + ':' + D.pad(s);
  }

  /* ---------- Historique ---------- */

  /* Premier jour de la période : semaine (depuis lundi), mois, année, ou tout. */
  function periodStart(period, today) {
    if (period === 'week') return D.startOfWeek(today);
    if (period === 'month') return today.slice(0, 8) + '01';
    if (period === 'year') return today.slice(0, 5) + '01-01';
    return '0000-00-00';
  }

  /*
   * Récap par matière sur la période : total par matière (sessions sans
   * matière ou dont la matière a été supprimée → « Sans matière »), du plus
   * au moins travaillé. ratio = part de la barre (la plus travaillée = 1).
   */
  function recapBySubject(data, period, today) {
    var from = periodStart(period, today);
    var totals = {};
    data.focus.sessions.forEach(function (s) {
      if (s.day < from || s.day > today) return;
      var name = subjectName(data, s.subjectId);
      var key = name ? s.subjectId : '';
      if (!totals[key]) totals[key] = { subjectId: name ? s.subjectId : null, name: name || 'Sans matière', seconds: 0 };
      totals[key].seconds += s.duration;
    });
    var rows = Object.keys(totals).map(function (k) { return totals[k]; })
      .filter(function (r) { return r.seconds > 0; })
      .sort(function (a, b) { return b.seconds - a.seconds || a.name.localeCompare(b.name); });
    var max = rows.length ? rows[0].seconds : 0;
    rows.forEach(function (r) { r.ratio = max ? r.seconds / max : 0; });
    return rows;
  }

  /*
   * Carte de chaleur des 8 dernières semaines : 8 colonnes (de la plus
   * ancienne à la semaine en cours) × 7 lignes (lundi → dimanche).
   * Intensité maximale à 2 h et au-delà. Jours futurs : null.
   */
  function heatmap(data, today) {
    var perDay = {};
    data.focus.sessions.forEach(function (s) { perDay[s.day] = (perDay[s.day] || 0) + s.duration; });
    var firstMonday = D.addDays(D.startOfWeek(today), -7 * 7);
    var weeks = [];
    for (var w = 0; w < 8; w++) {
      var days = [];
      for (var d = 0; d < 7; d++) {
        var date = D.addDays(firstMonday, w * 7 + d);
        if (date > today) { days.push(null); continue; }
        var sec = perDay[date] || 0;
        days.push({
          date: date, seconds: sec, intensity: Math.min(1, sec / 7200),
          label: D.formatShort(date) + ' — ' + (sec > 0 ? D.formatDuration(sec) : 'aucune session')
        });
      }
      weeks.push(days);
    }
    return weeks;
  }

  /* Les n dernières sessions, de la plus récente à la plus ancienne. */
  function recentSessions(data, n) {
    return data.focus.sessions.slice()
      .sort(function (a, b) { return b.startedAt - a.startedAt; })
      .slice(0, n);
  }

  /* « 03/03 14:30 » */
  function formatStart(ms) {
    var d = new Date(ms);
    return D.pad(d.getDate()) + '/' + D.pad(d.getMonth() + 1) + ' ' + D.pad(d.getHours()) + ':' + D.pad(d.getMinutes());
  }

  B.focusLogic = {
    MODES: MODES, validateConfig: validateConfig, startSession: startSession, pause: pause, resume: resume,
    elapsedSec: elapsedSec, pomodoro: pomodoro, display: display, stopSession: stopSession,
    attachToExisting: attachToExisting, targetLabel: targetLabel, formatTimer: formatTimer,
    periodStart: periodStart, recapBySubject: recapBySubject, heatmap: heatmap,
    recentSessions: recentSessions, formatStart: formatStart
  };
})(window.Bourgeon = window.Bourgeon || {});
