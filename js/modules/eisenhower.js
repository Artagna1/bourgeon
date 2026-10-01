/*
 * Bourgeon — module EISENHOWER : affichage.
 * Les règles sont dans eisenhower-logic.js.
 *
 * Une grille 2 × 2 (les quadrants) et une colonne « Non triées ». On déplace
 * les tâches par glisser-déposer (souris) ou avec le menu « Déplacer vers… »
 * (toucher, clavier), qui permet aussi de monter / descendre une tâche.
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon, EL = B.eisenhowerLogic;

  var hideDone = false;   // non mémorisé : les tâches faites réapparaissent au redémarrage
  var els = null;
  var dragId = null;
  var editingId = null;
  var marker = null;      // trait qui montre où la tâche sera lâchée

  function data() { return B.store.get(); }

  function render(container, tabId, ctx) {
    editingId = null;
    els = {
      root: h('div', { class: 'eis' }),
      toggle: h('button', { type: 'button', class: 'btn', onclick: function () { hideDone = !hideDone; draw(); } })
    };
    ctx.actions.appendChild(els.toggle);
    container.appendChild(els.root);
    marker = h('div', { class: 'eis-marker', 'aria-hidden': 'true' });
    draw();
  }

  function visibleTasks(zone) {
    return EL.tasksIn(data(), zone).filter(function (t) { return !hideDone || !t.done; });
  }

  /* Redessine tout ; focusSelector permet de garder le focus clavier. */
  function draw(focusSelector) {
    if (!els) return;
    B.ui.clear(els.toggle);
    B.ui.append(els.toggle, hideDone ? [icon('eye'), 'Afficher terminées'] : [icon('eye-slash'), 'Masquer terminées']);

    B.ui.clear(els.root);
    els.root.appendChild(h('div', { class: 'eis-matrix' }, [1, 2, 3, 4].map(zoneBlock)));
    els.root.appendChild(zoneBlock(0));

    if (focusSelector) {
      var target = els.root.querySelector(focusSelector);
      if (target) target.focus();
    }
  }

  function zoneBlock(zoneId) {
    var zone = EL.ZONES[zoneId];
    var list = visibleTasks(zoneId);
    var visibleIds = list.map(function (t) { return t.id; });
    var listEl = h('div', { class: 'eis-list', 'data-zone': zoneId },
      list.length ? list.map(function (t) { return taskCard(t, zoneId, visibleIds); })
        : h('p', { class: 'eis-empty' }, 'Aucune tâche ici.'));

    var section = h('section', { class: 'eis-zone ' + zone.tone, 'data-zone': zoneId, 'aria-label': zone.title },
      h('header', { class: 'eis-head' },
        zoneId === 0 ? icon('tray', 'eis-num') : h('span', { class: 'eis-num num' }, String(zoneId)),
        h('div', { class: 'eis-titles' },
          h('h2', { class: 'eis-title' }, zone.title),
          h('span', { class: 'eis-action' }, zoneId === 0 ? zone.action : '→ ' + zone.action)),
        h('span', { class: 'eis-count num', title: 'Tâches affichées' }, String(list.length))
      ),
      listEl,
      zoneId === 0 ? addForm() : null
    );
    enableDrop(section, listEl, zoneId);
    return section;
  }

  /* ---------- Carte de tâche ---------- */

  function taskCard(t, zoneId, visibleIds) {
    if (t.id === editingId) return editCard(t);

    var card = h('article', { class: 'eis-task' + (t.done ? ' done' : ''), 'data-id': t.id, draggable: 'true' },
      h('button', {
        type: 'button', class: 'eis-check', 'aria-pressed': t.done ? 'true' : 'false',
        'aria-label': (t.done ? 'Marquer non faite : ' : 'Marquer faite : ') + t.text,
        title: t.done ? 'Marquer non faite' : 'Marquer faite',
        onclick: function () {
          B.store.update(function (d) { EL.toggleDone(d, t.id); });
          draw('[data-id="' + t.id + '"] .eis-check');
        }
      }, t.done ? icon('check', null, 'ph-bold') : null),
      h('div', { class: 'eis-body' },
        h('p', { class: 'eis-text' }, t.text),
        t.deadline ? h('p', { class: 'eis-deadline' }, icon('calendar-blank'), t.deadline) : null
      ),
      h('div', { class: 'eis-tools' },
        h('button', {
          type: 'button', class: 'icon-action', title: 'Déplacer vers…', 'aria-label': 'Déplacer « ' + t.text + ' » vers…',
          'aria-haspopup': 'menu', onclick: function (e) { openMoveMenu(e.currentTarget, t, zoneId, visibleIds); }
        }, icon('arrows-down-up')),
        h('button', {
          type: 'button', class: 'eis-edit', onclick: function () { editingId = t.id; draw('[data-edit="' + t.id + '"] input'); }
        }, 'Éditer'),
        h('button', {
          type: 'button', class: 'icon-action danger', title: 'Supprimer', 'aria-label': 'Supprimer « ' + t.text + ' »',
          onclick: function () {
            B.store.update(function (d) { EL.deleteTask(d, t.id); });
            draw();
          }
        }, icon('x'))
      )
    );

    card.addEventListener('dragstart', function (e) {
      dragId = t.id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', t.id); } catch (err) { /* ancien navigateur */ }
      setTimeout(function () { card.classList.add('dragging'); }, 0);
    });
    card.addEventListener('dragend', function () {
      dragId = null;
      card.classList.remove('dragging');
      marker.remove();
      Array.prototype.forEach.call(els.root.querySelectorAll('.drop-target'), function (z) { z.classList.remove('drop-target'); });
    });
    return card;
  }

  /* Édition dans la carte : ✓ pour valider, ✕ pour annuler (Entrée / Échap). */
  function editCard(t) {
    var text = h('input', { class: 'input', type: 'text', value: t.text, maxlength: '100', 'aria-label': 'Description' });
    var deadline = h('input', { class: 'input', type: 'text', value: t.deadline, maxlength: '60', placeholder: 'Deadline', 'aria-label': 'Deadline' });
    var error = B.ui.formError();
    function cancel() { editingId = null; draw('[data-id="' + t.id + '"] .eis-edit'); }
    return h('form', {
      class: 'eis-task editing', 'data-edit': t.id, novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        var r = B.store.update(function (d) { return EL.editTask(d, t.id, text.value, deadline.value); });
        if (!r.ok) { B.ui.setError(error, r.error); return; }
        editingId = null;
        draw('[data-id="' + t.id + '"] .eis-edit');
      },
      onkeydown: function (e) { if (e.key === 'Escape') { e.preventDefault(); cancel(); } }
    },
      h('div', { class: 'eis-edit-fields' }, text, deadline),
      h('div', { class: 'eis-edit-actions' },
        h('button', { type: 'submit', class: 'btn btn-primary btn-icon', title: 'Valider', 'aria-label': 'Valider' }, icon('check', null, 'ph-bold')),
        h('button', { type: 'button', class: 'btn btn-icon', title: 'Annuler', 'aria-label': 'Annuler', onclick: cancel }, icon('x'))),
      error
    );
  }

  /* ---------- Menu « Déplacer vers… » ---------- */

  function openMoveMenu(button, t, zoneId, visibleIds) {
    closeMenus();
    var up = EL.neighbourTarget(visibleIds, t.id, -1);
    var down = EL.neighbourTarget(visibleIds, t.id, 1);
    function item(label, enabled, action, extraClass) {
      return h('button', {
        type: 'button', role: 'menuitem', class: 'eis-menu-item' + (extraClass ? ' ' + extraClass : ''), disabled: !enabled,
        onclick: function () { closeMenus(); action(); }
      }, label);
    }
    function move(zone, beforeId) {
      B.store.update(function (d) { EL.moveTask(d, t.id, zone, beforeId); });
      draw('[data-id="' + t.id + '"] .icon-action');
    }
    var menu = h('div', { class: 'eis-menu', role: 'menu', 'aria-label': 'Déplacer vers' },
      h('span', { class: 'eis-menu-label' }, 'Déplacer vers'),
      EL.ZONES.map(function (z) {
        return item((z.id === 0 ? '' : z.id + '. ') + (z.id === 0 ? z.title : z.action), z.id !== zoneId,
          function () { move(z.id, null); }, z.tone);
      }),
      h('span', { class: 'eis-menu-sep' }),
      item('↑ Monter', !!up, function () { move(zoneId, up.beforeId); }),
      item('↓ Descendre', !!down, function () { move(zoneId, down.beforeId); })
    );
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeMenus(); button.focus(); }
    });
    button.parentNode.appendChild(menu);
    var first = menu.querySelector('.eis-menu-item:not([disabled])');
    if (first) first.focus();
    setTimeout(function () { document.addEventListener('click', outsideClick); }, 0);
  }

  function outsideClick(e) {
    if (!e.target.closest('.eis-menu')) closeMenus();
  }

  function closeMenus() {
    document.removeEventListener('click', outsideClick);
    if (els) Array.prototype.forEach.call(els.root.querySelectorAll('.eis-menu'), function (m) { m.remove(); });
  }

  /* ---------- Glisser-déposer ---------- */

  function enableDrop(section, listEl, zoneId) {
    section.addEventListener('dragover', function (e) {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      section.classList.add('drop-target');
      var before = cardAfter(listEl, e.clientY);
      if (before) listEl.insertBefore(marker, before);
      else listEl.appendChild(marker);
    });
    section.addEventListener('dragleave', function (e) {
      if (!section.contains(e.relatedTarget)) {
        section.classList.remove('drop-target');
        if (marker.parentNode === listEl) marker.remove();
      }
    });
    section.addEventListener('drop', function (e) {
      if (!dragId) return;
      e.preventDefault();
      var before = cardAfter(listEl, e.clientY);
      var id = dragId;
      B.store.update(function (d) { EL.moveTask(d, id, zoneId, before ? before.getAttribute('data-id') : null); });
      dragId = null;
      draw();
    });
  }

  /* Carte avant laquelle lâcher : la première dont le milieu est sous le pointeur. */
  function cardAfter(listEl, y) {
    var cards = Array.prototype.filter.call(listEl.querySelectorAll('.eis-task[data-id]'), function (c) {
      return c.getAttribute('data-id') !== dragId;
    });
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return cards[i];
    }
    return null;
  }

  /* ---------- Ajout (uniquement dans « Non triées ») ---------- */

  function addForm() {
    var text = h('input', { class: 'input', type: 'text', maxlength: '100', placeholder: 'Nouvelle tâche…', 'aria-label': 'Nouvelle tâche' });
    var deadline = h('input', { class: 'input eis-deadline-input', type: 'text', maxlength: '60', placeholder: 'Deadline', 'aria-label': 'Deadline (facultative)' });
    var error = B.ui.formError();
    return h('form', {
      class: 'eis-add', novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        var r = B.store.update(function (d) { return EL.addTask(d, text.value, deadline.value); });
        if (!r.ok) { B.ui.setError(error, r.error); return; }
        draw('.eis-add input');
      }
    },
      h('div', { class: 'eis-add-row' }, text, deadline,
        h('button', { type: 'submit', class: 'btn btn-primary btn-icon', title: 'Ajouter', 'aria-label': 'Ajouter la tâche' }, icon('plus', null, 'ph-bold'))),
      error
    );
  }

  function leave() {
    closeMenus();
    els = null;
    dragId = null;
    editingId = null;
  }

  B.modules = B.modules || {};
  B.modules.eisenhower = { render: render, leave: leave };
})(window.Bourgeon = window.Bourgeon || {});
