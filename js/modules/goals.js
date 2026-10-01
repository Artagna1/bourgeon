/*
 * Bourgeon — module OBJECTIFS.
 *
 * Des objectifs à moyen terme avec une échéance et un statut. La liste est
 * triée par échéance (la plus proche en premier). Le décompte des jours
 * n'apparaît que pour les objectifs « En cours ».
 *
 * Données : data.goals.items = [{ id, name, deadline, status, createdAt, note }]
 * status : 'active' (En cours) | 'done' (Atteint) | 'abandoned' (Abandonné)
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon, D = B.dates;

  var STATUSES = [
    { id: 'active', label: 'En cours' },
    { id: 'done', label: 'Atteint' },
    { id: 'abandoned', label: 'Abandonné' }
  ];

  /* ================= Règles (sans affichage, testées) ================= */

  /* Ajoute un objectif « En cours ». Renvoie { ok } ou { ok: false, error }. */
  function addGoal(data, rawName, deadline, today) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom d\'objectif.');
    if (!name.ok) return name;
    var date = B.validate.date(deadline);
    if (!date.ok) return date;
    var goal = {
      id: B.store.newId(), name: name.value, deadline: date.value,
      status: 'active', createdAt: today, note: ''
    };
    data.goals.items.push(goal);
    return { ok: true, goal: goal };
  }

  /* Objectifs triés par échéance, puis par ordre de création. */
  function sortedGoals(data) {
    return data.goals.items.slice().sort(function (a, b) {
      if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
  }

  /*
   * Ligne d'échéance.
   *   { date: "Échéance : 15/06/2026", countdown: "104 jours restants", overdue: false }
   * countdown est vide si l'objectif n'est pas « En cours ».
   */
  function deadlineInfo(goal, today) {
    var info = { date: 'Échéance : ' + D.formatShort(goal.deadline), countdown: '', overdue: false };
    if (goal.status !== 'active') return info;
    var n = D.diffDays(today, goal.deadline);
    if (n > 0) info.countdown = B.ui.plural(n, 'jour restant', 'jours restants');
    else if (n === 0) info.countdown = 'échéance aujourd\'hui';
    else {
      info.countdown = 'échéance dépassée depuis ' + B.ui.plural(-n, 'jour', 'jours');
      info.overdue = true;
    }
    return info;
  }

  function findGoal(data, id) {
    return data.goals.items.filter(function (g) { return g.id === id; })[0];
  }

  function setStatus(data, id, status) {
    var g = findGoal(data, id);
    if (g) g.status = status;
  }

  function setNote(data, id, raw) {
    var g = findGoal(data, id);
    if (g) g.note = String(raw == null ? '' : raw).trim();
  }

  function removeGoal(data, id) {
    data.goals.items = data.goals.items.filter(function (g) { return g.id !== id; });
  }

  /* ================= Affichage ================= */

  var els = null;

  function render(container, tabId, ctx) {
    els = {
      stats: h('div', { class: 'goals-stats', 'aria-live': 'polite' }),
      name: h('input', {
        class: 'input goals-name', type: 'text', maxlength: '100',
        placeholder: 'Nom de la quête…', 'aria-label': 'Nom de l\'objectif'
      }),
      date: h('input', {
        class: 'input goals-date', type: 'date', value: D.today(),
        min: B.validate.MIN_DATE, max: B.validate.MAX_DATE, 'aria-label': 'Échéance'
      }),
      error: B.ui.formError(),
      list: h('div', { class: 'goals-list' })
    };
    ctx.actions.appendChild(els.stats);

    var form = h('form', { class: 'goals-form', novalidate: true, onsubmit: onAdd },
      h('div', { class: 'goals-form-row' },
        els.name,
        els.date,
        h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus', null, 'ph-bold'), 'Ajouter')
      ),
      els.error
    );

    container.appendChild(h('div', { class: 'goals' }, form, B.ui.ornament(), els.list));
    drawList();
  }

  function onAdd(e) {
    e.preventDefault();
    var result = addGoal(B.store.get(), els.name.value, els.date.value, D.today());
    if (!result.ok) {
      B.ui.setError(els.error, result.error);
      return;
    }
    B.store.save();
    B.ui.setError(els.error, '');
    els.name.value = '';
    els.date.value = D.today();
    drawList();
    els.name.focus();
  }

  /* « 4 en cours · 1 atteint · 1 abandonné » dans l'en-tête */
  function drawStats(goals) {
    var count = { active: 0, done: 0, abandoned: 0 };
    goals.forEach(function (g) { count[g.status] = (count[g.status] || 0) + 1; });
    B.ui.clear(els.stats);
    B.ui.append(els.stats, [
      h('span', { class: 'stat-active' }, h('strong', { class: 'num' }, String(count.active)), ' en cours'),
      h('span', { class: 'stat-done' }, h('strong', { class: 'num' }, String(count.done)), count.done >= 2 ? ' atteints' : ' atteint'),
      h('span', { class: 'stat-abandoned' }, h('strong', { class: 'num' }, String(count.abandoned)), count.abandoned >= 2 ? ' abandonnés' : ' abandonné')
    ]);
  }

  function drawList(focusSelector) {
    var goals = sortedGoals(B.store.get());
    var today = D.today();
    drawStats(goals);
    B.ui.clear(els.list);

    if (goals.length === 0) {
      els.list.appendChild(h('p', { class: 'muted goals-empty' }, 'Aucun objectif pour le moment.'));
      return;
    }
    goals.forEach(function (g) { els.list.appendChild(goalCard(g, today)); });

    if (focusSelector) {
      var target = els.list.querySelector(focusSelector);
      if (target) target.focus();
    }
  }

  function goalCard(g, today) {
    var info = deadlineInfo(g, today);
    var state = info.overdue ? 'overdue' : g.status;

    var note = h('input', {
      class: 'goal-note', type: 'text', value: g.note,
      placeholder: 'Ajouter une note…', 'aria-label': 'Note pour ' + g.name
    });
    // La note est enregistrée en quittant le champ (Entrée ou clic ailleurs).
    note.addEventListener('keydown', function (e) { if (e.key === 'Enter') note.blur(); });
    note.addEventListener('blur', function () {
      B.store.update(function (data) { setNote(data, g.id, note.value); });
      note.value = findGoal(B.store.get(), g.id).note;
    });

    // Statut : une pastille qui s'ouvre comme une liste (En cours / Atteint / Abandonné)
    var status = h('select', {
      class: 'goal-status status-' + g.status, 'aria-label': 'Statut de ' + g.name, 'data-status-select': g.id,
      onchange: function () {
        B.store.update(function (data) { setStatus(data, g.id, status.value); });
        drawList('[data-status-select="' + g.id + '"]');
      }
    }, STATUSES.map(function (s) { return h('option', { value: s.id, selected: s.id === g.status }, s.label); }));

    return h('article', { class: 'card goal goal-' + state, 'data-goal': g.id },
      h('div', { class: 'goal-head' },
        h('span', { class: 'goal-gem', 'aria-hidden': 'true' }),
        h('h3', { class: 'goal-name' }, g.name),
        status,
        h('button', {
          type: 'button', class: 'icon-action danger goal-delete', title: 'Supprimer', 'aria-label': 'Supprimer « ' + g.name + ' »',
          onclick: function () {
            B.store.update(function (data) { removeGoal(data, g.id); });
            drawList();
          }
        }, icon('x'))
      ),
      h('p', { class: 'goal-deadline' },
        info.overdue ? icon('warning-diamond', 'goal-warning', 'ph-fill') : icon('calendar-blank'),
        h('span', { class: 'num' }, D.formatShort(g.deadline)),
        info.countdown ? h('span', { class: 'goal-countdown' }, ' · ' + info.countdown) : null
      ),
      h('div', { class: 'goal-foot' }, note)
    );
  }

  function leave() {
    // Le champ de note en cours d'édition est enregistré par son événement blur.
    if (els && document.activeElement && els.list.contains(document.activeElement)) document.activeElement.blur();
    els = null;
  }

  B.modules = B.modules || {};
  B.modules.goals = {
    render: render,
    leave: leave,
    flush: function () {
      if (els && document.activeElement && els.list.contains(document.activeElement)) document.activeElement.blur();
    },
    logic: {
      addGoal: addGoal, sortedGoals: sortedGoals, deadlineInfo: deadlineInfo,
      setStatus: setStatus, setNote: setNote, removeGoal: removeGoal
    }
  };
})(window.Bourgeon = window.Bourgeon || {});
