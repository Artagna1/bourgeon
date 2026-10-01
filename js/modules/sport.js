/*
 * Bourgeon — module SPORT : affichage.
 * Les calculs sont dans sport-logic.js.
 *
 * Onglet PLANNING : la semaine type (un texte par jour, chacun avec son
 * bouton « Enregistrer »).
 * Onglet COURSE (VMA) : la VMA, les chronos prévus (Riegel), les allures
 * par zone d'effort et le tableau des temps de passage.
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon, D = B.dates, SL = B.sportLogic;
  var JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  var els = null;

  function data() { return B.store.get(); }

  function render(container, tabId) {
    els = { root: h('div', { class: 'sport' }), days: [] };
    container.appendChild(els.root);
    if (tabId === 'vma') renderVma(); else renderPlanning();
  }

  /* ---------- Onglet PLANNING ---------- */

  function renderPlanning() {
    var today = D.weekdayIndex(D.today());
    var grid = h('div', { class: 'sport-week' });
    JOURS.forEach(function (name, i) {
      var text = h('textarea', {
        class: 'input sport-text', rows: '4', 'aria-label': 'Programme du ' + name.toLowerCase(),
        placeholder: i === today ? 'Ex. Footing 45 min EF' : '', value: data().sport.planning[i] || ''
      });
      var saved = h('span', { class: 'saved-flash', role: 'status' });
      var day = { index: i, text: text, loaded: text.value };
      function save() {
        B.store.update(function (d) { SL.setPlanningDay(d, i, text.value); });
        text.value = data().sport.planning[i];
        day.loaded = text.value;
        B.ui.flashSaved(saved);
      }
      els.days.push(day);
      grid.appendChild(h('section', { class: 'card sport-day' + (i === today ? ' today' : '') },
        h('div', { class: 'sport-day-head' },
          h('h2', { class: 'sport-day-name' }, name),
          i === today ? h('span', { class: 'badge accent' }, 'Aujourd\'hui') : null),
        text,
        h('div', { class: 'sport-day-foot' }, saved, h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, 'Enregistrer'))
      ));
    });
    els.root.appendChild(h('p', { class: 'muted small sport-intro' }, 'Ta semaine d\'entraînement type : elle se répète chaque semaine.'));
    els.root.appendChild(grid);
  }

  /*
   * Brouillons non enregistrés : conservés en quittant la section ou la page.
   * Seuls les jours modifiés à l'écran sont enregistrés.
   */
  function saveDrafts() {
    if (!els || !els.days.length) return;
    var changed = els.days.filter(function (d) { return d.text.value !== d.loaded; });
    if (!changed.length) return;
    B.store.update(function (dd) {
      changed.forEach(function (d) { SL.setPlanningDay(dd, d.index, d.text.value); d.loaded = d.text.value; });
    });
  }

  /* ---------- Onglet COURSE (VMA) ---------- */

  function renderVma() {
    var vma = data().sport.vma;

    // VMA + prédictions
    var preds = SL.predictions(vma);
    els.root.appendChild(h('div', { class: 'sport-top' },
      h('section', { class: 'card sport-vma' },
        h('h2', { class: 'section-label' }, 'Ta VMA'),
        h('div', { class: 'sport-vma-value' },
          h('span', { class: 'sport-vma-number num' }, SL.formatKmh(vma)),
          h('span', { class: 'sport-vma-unit' }, 'km/h')),
        h('div', { class: 'sport-vma-actions' },
          h('button', { type: 'button', class: 'btn', onclick: function () { editVma(false); } }, icon('pencil-simple'), 'Modifier'),
          h('button', { type: 'button', class: 'btn', onclick: function () { editVma(true); } }, icon('flask'), 'Test VMA'))
      ),
      h('section', { class: 'card sport-preds' },
        h('div', { class: 'card-head' },
          h('h2', { class: 'section-label' }, 'Prédiction de chronos'),
          h('span', { class: 'card-hint' }, 'Riegel · 10 km à 90 % de la VMA')),
        h('div', { class: 'sport-pred-grid' }, preds.map(function (p) {
          return h('div', { class: 'sport-pred' },
            h('span', { class: 'sport-pred-label' }, p.label),
            h('span', { class: 'sport-pred-time num' }, p.text),
            h('span', { class: 'sport-pred-speed num' }, SL.formatKmh(p.speed) + ' km/h'));
        }))
      )
    ));

    // Zones d'effort
    els.root.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', { class: 'section-label' }, 'Allures par zone d\'effort'),
        h('span', { class: 'card-hint' }, 'calculées au milieu de chaque fourchette')),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table sport-zones' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Zone'), h('th', { scope: 'col' }, '% VMA'),
          h('th', { scope: 'col' }, 'Vitesse'), h('th', { scope: 'col' }, 'Allure'), h('th', { scope: 'col' }, 'Usage'))),
        h('tbody', null, SL.zones(vma).map(function (z, i) {
          return h('tr', null,
            h('th', { scope: 'row' }, h('span', { class: 'zone-dot z' + i }), z.name),
            h('td', { class: 'num muted' }, z.range),
            h('td', { class: 'num' }, z.speedText + ' km/h'),
            h('td', { class: 'num sport-pace' }, z.paceText),
            h('td', { class: 'muted sport-usage' }, z.usage));
        }))
      ))
    ));

    // Tableau des temps de passage
    els.root.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', { class: 'section-label' }, 'Temps de passage (% VMA)'),
        h('span', { class: 'card-hint' }, 'pour préparer le fractionné')),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table sport-grid' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Distance'),
          SL.PERCENTS.map(function (p) { return h('th', { scope: 'col', class: 'num' + (p === 100 ? ' ref' : '') }, p + ' %'); }))),
        h('tbody', null, SL.paceTable(vma).map(function (row) {
          return h('tr', null,
            h('th', { scope: 'row', class: 'num' }, row.label),
            row.times.map(function (t, i) { return h('td', { class: 'num' + (SL.PERCENTS[i] === 100 ? ' ref' : '') }, t); }));
        }))
      ))
    ));
  }

  /* Fenêtre de saisie de la VMA (« Modifier » et « Test VMA »). */
  function editVma(isTest) {
    var input = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: SL.formatKmh(data().sport.vma), 'aria-label': 'VMA en km/h' });
    var error = B.ui.formError();
    var dlg;
    var content = h('form', {
      novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        var r = B.store.update(function (d) { return SL.setVma(d, input.value); });
        if (!r.ok) { B.ui.setError(error, r.error); input.focus(); return; }
        dlg.finish('ok');
      }
    },
      h('h2', { class: 'modal-title' }, isTest ? 'Test VMA' : 'Modifier la VMA'),
      isTest ? h('p', { class: 'modal-text' }, 'Saisis le résultat d\'un test fait par ailleurs (demi-Cooper, VAMEVAL, test sur piste…).') : null,
      h('label', { class: 'sport-vma-label' }, h('span', { class: 'section-label' }, 'VMA (km/h)'), input),
      error,
      h('div', { class: 'modal-actions' },
        h('button', { type: 'button', class: 'btn', onclick: function () { dlg.finish(''); } }, 'Annuler'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Enregistrer'))
    );
    dlg = B.ui.openDialog(content, function (value) {
      if (value === 'ok' && els) { B.ui.clear(els.root); renderVma(); }
    });
    input.focus();
    input.select();
  }

  function leave() {
    saveDrafts();
    els = null;
  }

  B.modules = B.modules || {};
  B.modules.sport = { render: render, leave: leave, flush: saveDrafts };
})(window.Bourgeon = window.Bourgeon || {});
