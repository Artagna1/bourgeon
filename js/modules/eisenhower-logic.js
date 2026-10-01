/*
 * Bourgeon — module EISENHOWER : règles (sans affichage).
 *
 * Principe : on capture vite, on trie ensuite. Une tâche naît dans la zone
 * « Non triées » (zone 0), puis on la déplace vers un quadrant (1 à 4).
 * Chaque zone garde son propre ordre (rang 0, 1, 2…), recalculé à chaque
 * déplacement. La « deadline » est un texte libre (« vendredi », « avant
 * l'exam »…) : elle n'est ni triée ni vérifiée.
 *
 * Données : data.eisenhower.tasks = [{ id, text, deadline, done, zone, rank }]
 */
(function (B) {
  'use strict';

  /* name = action recommandée (titre affiché), hint = sous-titre, title = croisement urgence / importance. */
  var ZONES = [
    { id: 0, name: 'Non triées', hint: 'Glisser vers un quadrant', title: 'Non triées', tone: 'inbox' },
    { id: 1, name: 'Faire', hint: 'Tout de suite', title: 'Urgent · Important', tone: 'q1' },
    { id: 2, name: 'Planifier', hint: 'Bloquer un créneau', title: 'Important · Pas urgent', tone: 'q2' },
    { id: 3, name: 'Déléguer', hint: 'Ou expédier vite', title: 'Urgent · Pas important', tone: 'q3' },
    { id: 4, name: 'Abandonner', hint: 'Ou plus tard', title: 'Pas urgent · Pas important', tone: 'q4' }
  ];

  function tasks(data) { return data.eisenhower.tasks; }
  function find(data, id) { return tasks(data).filter(function (t) { return t.id === id; })[0]; }

  /* Tâches d'une zone, dans leur ordre. */
  function tasksIn(data, zone) {
    return tasks(data).filter(function (t) { return t.zone === zone; })
      .sort(function (a, b) { return a.rank - b.rank; });
  }

  /* Renumérote une zone 0, 1, 2… dans l'ordre donné. */
  function renumber(list) { list.forEach(function (t, i) { t.rank = i; }); }

  function cleanDeadline(raw) { return String(raw == null ? '' : raw).trim().slice(0, 60); }

  /* Nouvelle tâche, toujours dans « Non triées », à la fin. */
  function addTask(data, rawText, rawDeadline) {
    var text = B.validate.name(rawText, 'Merci d\'indiquer une tâche.');
    if (!text.ok) return text;
    var task = {
      id: B.store.newId(), text: text.value, deadline: cleanDeadline(rawDeadline),
      done: false, zone: 0, rank: tasksIn(data, 0).length
    };
    tasks(data).push(task);
    return { ok: true, task: task };
  }

  /*
   * Déplace une tâche dans une zone, juste avant la tâche beforeId (ou à la
   * fin si beforeId est vide). Fonctionne aussi dans la même zone
   * (réordonner).
   */
  function moveTask(data, id, zone, beforeId) {
    var task = find(data, id);
    if (!task || id === beforeId) return false;
    var from = task.zone;
    var source = tasksIn(data, from).filter(function (t) { return t.id !== id; });
    renumber(source);
    var target = from === zone ? source : tasksIn(data, zone);
    var index = beforeId ? target.map(function (t) { return t.id; }).indexOf(beforeId) : -1;
    if (index < 0) index = target.length;
    target.splice(index, 0, task);
    task.zone = zone;
    renumber(target);
    return true;
  }

  function toggleDone(data, id) {
    var t = find(data, id);
    t.done = !t.done;
    return t.done;
  }

  function editTask(data, id, rawText, rawDeadline) {
    var text = B.validate.name(rawText, 'Merci d\'indiquer une tâche.');
    if (!text.ok) return text;
    var t = find(data, id);
    t.text = text.value;
    t.deadline = cleanDeadline(rawDeadline);
    return { ok: true };
  }

  function deleteTask(data, id) {
    var t = find(data, id);
    if (!t) return;
    data.eisenhower.tasks = tasks(data).filter(function (x) { return x.id !== id; });
    renumber(tasksIn(data, t.zone));
  }

  /*
   * Pour « Monter » / « Descendre » : la tâche visible avant laquelle se
   * placer. visibleIds = ordre affiché de la zone (tâches masquées exclues).
   */
  function neighbourTarget(visibleIds, id, direction) {
    var i = visibleIds.indexOf(id);
    if (direction < 0) return i > 0 ? { beforeId: visibleIds[i - 1] } : null;
    if (i < 0 || i >= visibleIds.length - 1) return null;
    return { beforeId: visibleIds[i + 2] || null };
  }

  B.eisenhowerLogic = {
    ZONES: ZONES, tasksIn: tasksIn, addTask: addTask, moveTask: moveTask,
    toggleDone: toggleDone, editTask: editTask, deleteTask: deleteTask, find: find,
    neighbourTarget: neighbourTarget
  };
})(window.Bourgeon = window.Bourgeon || {});
