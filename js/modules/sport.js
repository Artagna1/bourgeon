/*
 * Bourgeon — module SPORT : affichage.
 * Les calculs sont dans sport-logic.js.
 *
 * Onglet PLANNING : la semaine type (un texte par jour, chacun avec son
 * bouton « Enregistrer »).
 * Onglet COURSE (VMA) : la VMA, les chronos prévus (Riegel), les allures
 * par zone d'effort, les fréquences cardiaques (saisies à la main) et le
 * tableau des temps de passage.
 * Onglet RECORDS : des blocs libres (« Course », « Poids du corps »…), chacun
 * avec ses exercices, leur meilleur résultat et la date du record.
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon, D = B.dates, SL = B.sportLogic;
  var JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  var els = null;

  function data() { return B.store.get(); }

  function render(container, tabId, ctx) {
    var mobile = !!(ctx && ctx.mobile);
    els = { root: h('div', { class: 'sport' + (mobile ? ' mobile' : '') }), days: [], mobile: mobile };
    container.appendChild(els.root);
    if (tabId === 'vma') {
      if (mobile) ctx.corner.appendChild(B.ui.cornerButton('flask', 'Test VMA', function () { editVma(true); }));
      renderVma();
    } else if (tabId === 'records') {
      if (mobile) ctx.corner.appendChild(B.ui.cornerButton('plus', 'Nouveau bloc', function () { editBlock(null); }));
      else ctx.actions.appendChild(h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { editBlock(null); } }, icon('plus'), 'Bloc'));
      renderRecords();
    } else {
      renderPlanning();
    }
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
    if (els.mobile) { renderVmaMobile(vma); return; }

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

    els.root.appendChild(renderHr());

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

  /* Mobile : VMA en grand, prédictions en 2×2, zones en liste, temps de passage repliés. */
  function renderVmaMobile(vma) {
    els.root.appendChild(h('section', { class: 'card sport-mvma' },
      h('div', { class: 'sport-mvma-main' },
        h('h2', { class: 'section-label' }, 'Ma VMA'),
        h('div', { class: 'sport-vma-value' },
          h('span', { class: 'sport-vma-number num' }, SL.formatKmh(vma)),
          h('span', { class: 'sport-vma-unit' }, 'km/h'))),
      h('button', { type: 'button', class: 'sport-mvma-edit', onclick: function () { editVma(false); } },
        h('span', { class: 'gem-btn', 'aria-hidden': 'true' }, icon('pencil-simple', null, 'ph-bold')),
        h('span', null, 'Modifier'))
    ));

    els.root.appendChild(h('div', { class: 'sport-mpreds' }, SL.predictions(vma).map(function (p) {
      return h('div', { class: 'sport-mpred', title: SL.formatKmh(p.speed) + ' km/h' },
        h('span', { class: 'sport-pred-label' }, p.label),
        h('span', { class: 'sport-pred-time num' }, p.text));
    })));

    els.root.appendChild(h('section', { class: 'sport-mzones' },
      h('h2', { class: 'section-label' }, 'Allure par zone'),
      SL.zones(vma).map(function (z, i) {
        return h('div', { class: 'sport-mzone', title: z.usage + ' · ' + z.speedText + ' km/h' },
          h('span', { class: 'zone-dot z' + i, 'aria-hidden': 'true' }),
          h('span', { class: 'sport-mzone-name' }, z.name),
          h('span', { class: 'sport-mzone-range num' }, z.range),
          h('span', { class: 'sport-mzone-pace num z' + i, title: z.paceText }, z.paceText.replace('/km', '')));
      })));

    els.root.appendChild(renderHr());

    els.root.appendChild(h('details', { class: 'sport-mpass' },
      h('summary', null, h('span', null, 'Temps de passage'), icon('caret-right', 'sport-mpass-caret', 'ph-bold')),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table sport-grid' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Distance'),
          SL.PERCENTS.map(function (p) { return h('th', { scope: 'col', class: 'num' + (p === 100 ? ' ref' : '') }, p + ' %'); }))),
        h('tbody', null, SL.paceTable(vma).map(function (row) {
          return h('tr', null,
            h('th', { scope: 'row', class: 'num' }, row.label),
            row.times.map(function (t, i) { return h('td', { class: 'num' + (SL.PERCENTS[i] === 100 ? ' ref' : '') }, t); }));
        }))
      ))));
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

  /* ---------- Fréquences cardiaques (onglet COURSE) ---------- */

  /* Bureau : un tableau ; mobile : une liste. Toucher une zone pour la modifier. */
  function renderHr() {
    var zones = data().sport.hrZones;
    var body;
    if (zones.length === 0) {
      body = h('p', { class: 'muted small' }, 'Note ici tes zones de fréquence cardiaque : FC, vitesse, allure et usage de chacune.');
    } else if (els.mobile) {
      body = h('ul', { class: 'hr-list' }, zones.map(function (z) {
        var detail = [z.speed, z.pace].filter(Boolean).join(' · ');
        return h('li', null, h('button', { type: 'button', class: 'hr-row', title: 'Modifier', onclick: function () { editHrZone(z.id); } },
          h('span', { class: 'hr-name' }, z.name),
          h('span', { class: 'hr-bpm num' }, z.hr),
          detail ? h('span', { class: 'hr-detail num' }, detail) : null,
          z.usage ? h('span', { class: 'hr-usage' }, z.usage) : null));
      }));
    } else {
      body = h('div', { class: 'table-scroll' }, h('table', { class: 'table hr-table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Zone'), h('th', { scope: 'col' }, 'FC'),
          h('th', { scope: 'col' }, 'Vitesse'), h('th', { scope: 'col' }, 'Allure'), h('th', { scope: 'col' }, 'Usage'))),
        h('tbody', null, zones.map(function (z) {
          function open() { editHrZone(z.id); }
          return h('tr', { onclick: open },
            h('th', { scope: 'row' }, h('button', { type: 'button', class: 'hr-edit', title: 'Modifier',
              onclick: function (e) { e.stopPropagation(); open(); } }, z.name)),
            h('td', { class: 'num hr-bpm' }, z.hr),
            h('td', { class: 'num' }, z.speed),
            h('td', { class: 'num sport-pace' }, z.pace),
            h('td', { class: 'muted sport-usage' }, z.usage));
        }))));
    }
    return h('section', { class: 'card hr-card' },
      h('div', { class: 'card-head' },
        h('h2', { class: 'section-label' }, icon('heartbeat'), 'Fréquences cardiaques'),
        h('button', { type: 'button', class: 'btn', onclick: function () { editHrZone(null); } }, icon('plus'), 'Zone')),
      body);
  }

  /* Fenêtre « Nouvelle zone » / « Modifier la zone » (ordre, suppression). Seul le nom est obligatoire. */
  function editHrZone(zoneId) {
    var zone = zoneId ? SL.findHrZone(data(), zoneId) : null;
    function field(key, label, placeholder, max) {
      return h('input', { class: 'input', type: 'text', maxlength: String(max), value: zone ? zone[key] : '',
        placeholder: placeholder, 'aria-label': label });
    }
    function labelled(text, input) { return h('label', { class: 'rec-field' }, h('span', { class: 'section-label' }, text), input); }
    var inputs = {
      name: field('name', 'Nom de la zone', 'Ex. Endurance fondamentale (EF)', 100),
      hr: field('hr', 'Fréquence cardiaque', 'Ex. 130–150 bpm', 50),
      speed: field('speed', 'Vitesse', 'Ex. 8,5–9,8 km/h', 50),
      pace: field('pace', 'Allure', 'Ex. 6\'10–7\'00/km', 50),
      usage: field('usage', 'Usage', 'Ex. ~80 % des séances', 100)
    };
    var error = B.ui.formError();
    var list = data().sport.hrZones, pos = zone ? list.indexOf(zone) : -1;
    var dlg;
    function redraw() { if (els) { B.ui.clear(els.root); renderVma(); } }
    function move(dir) {
      B.store.update(function (d) { SL.moveHrZone(d, zone.id, dir); });
      dlg.finish('');
      redraw();
    }
    var content = h('form', {
      novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        var fields = {};
        Object.keys(inputs).forEach(function (k) { fields[k] = inputs[k].value; });
        var r = B.store.update(function (d) { return zone ? SL.updateHrZone(d, zone.id, fields) : SL.addHrZone(d, fields); });
        if (!r.ok) { B.ui.setError(error, r.error); return; }
        dlg.finish('ok');
      }
    },
      h('h2', { class: 'modal-title' }, zone ? 'Modifier la zone' : 'Nouvelle zone'),
      labelled('Zone', inputs.name),
      h('div', { class: 'rec-field-row' }, labelled('FC', inputs.hr), labelled('Vitesse', inputs.speed)),
      h('div', { class: 'rec-field-row' }, labelled('Allure', inputs.pace), labelled('Usage', inputs.usage)),
      error,
      h('div', { class: 'modal-actions' },
        zone ? h('button', { type: 'button', class: 'btn btn-danger rec-delete', onclick: function () {
          dlg.finish('');
          B.ui.confirm({
            title: 'Supprimer la zone « ' + zone.name + ' » ?', message: 'Ses valeurs seront supprimées.',
            confirmLabel: 'Supprimer', danger: true
          }).then(function (ok) {
            if (ok) B.store.update(function (d) { SL.deleteHrZone(d, zone.id); });
            redraw();
          });
        } }, 'Supprimer') : null,
        pos > 0 ? h('button', { type: 'button', class: 'icon-action', title: 'Monter', 'aria-label': 'Monter la zone',
          onclick: function () { move(-1); } }, icon('arrow-up')) : null,
        zone && pos < list.length - 1 ? h('button', { type: 'button', class: 'icon-action', title: 'Descendre', 'aria-label': 'Descendre la zone',
          onclick: function () { move(1); } }, icon('arrow-down')) : null,
        h('button', { type: 'button', class: 'btn', onclick: function () { dlg.finish(''); } }, 'Annuler'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Enregistrer'))
    );
    dlg = B.ui.openDialog(content, function (value) { if (value === 'ok') redraw(); });
    inputs[zone ? 'hr' : 'name'].focus();
  }

  /* ---------- Onglet RECORDS ---------- */

  function renderRecords() {
    var board = SL.recordBoard(data());
    if (board.length === 0) {
      els.root.appendChild(h('div', { class: 'card empty-state' },
        icon('trophy', 'empty-icon'),
        h('p', { class: 'empty-title' }, 'Aucun record pour le moment'),
        h('p', { class: 'muted' }, 'Crée un bloc (ex. « Course », « Poids du corps »), puis ajoute-y tes exercices et tes meilleurs résultats.'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { editBlock(null); } }, icon('plus'), 'Créer un bloc')));
      return;
    }
    els.root.appendChild(h('div', { class: 'rec-grid' }, board.map(function (g) {
      var b = g.block;
      return h('section', { class: 'card rec-block' },
        h('div', { class: 'rec-block-head' },
          h('h2', { class: 'rec-block-name' }, b.name),
          h('button', { type: 'button', class: 'icon-action', title: 'Modifier le bloc', 'aria-label': 'Modifier le bloc ' + b.name,
            onclick: function () { editBlock(b.id); } }, icon('pencil-simple'))),
        g.records.length === 0
          ? h('p', { class: 'muted small' }, 'Aucun exercice dans ce bloc.')
          : h('ul', { class: 'rec-list' }, g.records.map(function (r) {
            return h('li', null, h('button', {
              type: 'button', class: 'rec-row', title: 'Modifier', onclick: function () { editRecord(b.id, r.id); }
            },
              h('span', { class: 'rec-name' }, r.name),
              h('span', { class: 'rec-value num' }, r.value),
              h('span', { class: 'rec-date num' }, D.formatShort(r.date))));
          })),
        h('button', { type: 'button', class: 'btn rec-add', onclick: function () { editRecord(b.id, null); } }, icon('plus'), 'Exercice'));
    })));
  }

  function redrawRecords() {
    if (!els) return;
    B.ui.clear(els.root);
    renderRecords();
  }

  /* Fenêtre « Nouveau bloc » / « Modifier le bloc » (avec suppression). */
  function editBlock(blockId) {
    var block = blockId ? SL.findBlock(data(), blockId) : null;
    var input = h('input', { class: 'input', type: 'text', maxlength: '100', value: block ? block.name : '',
      placeholder: 'Ex. Course, Poids du corps, Muscu…', 'aria-label': 'Nom du bloc' });
    var error = B.ui.formError();
    var dlg;
    var content = h('form', {
      novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        var r = B.store.update(function (d) { return block ? SL.renameBlock(d, block.id, input.value) : SL.addBlock(d, input.value); });
        if (!r.ok) { B.ui.setError(error, r.error); input.focus(); return; }
        dlg.finish('ok');
      }
    },
      h('h2', { class: 'modal-title' }, block ? 'Modifier le bloc' : 'Nouveau bloc'),
      h('label', { class: 'rec-field' }, h('span', { class: 'section-label' }, 'Nom du bloc'), input),
      error,
      h('div', { class: 'modal-actions' },
        block ? h('button', { type: 'button', class: 'btn btn-danger rec-delete', onclick: function () {
          var n = data().sport.records.filter(function (r) { return r.blockId === block.id; }).length;
          dlg.finish('');
          B.ui.confirm({
            title: 'Supprimer le bloc « ' + block.name + ' » ?',
            message: n ? 'Ses ' + B.ui.plural(n, 'exercice sera supprimé', 'exercices seront supprimés') + ' avec lui.' : 'Il ne contient aucun exercice.',
            confirmLabel: 'Supprimer', danger: true
          }).then(function (ok) {
            if (ok) B.store.update(function (d) { SL.deleteBlock(d, block.id); });
            redrawRecords();
          });
        } }, 'Supprimer') : null,
        h('button', { type: 'button', class: 'btn', onclick: function () { dlg.finish(''); } }, 'Annuler'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, block ? 'Enregistrer' : 'Créer'))
    );
    dlg = B.ui.openDialog(content, function (value) { if (value === 'ok') redrawRecords(); });
    input.focus();
    if (block) input.select();
  }

  /*
   * Fenêtre d'un exercice : nom, résultat et date (aujourd'hui par défaut).
   * Pour un exercice existant : historique des anciens résultats et suppression.
   */
  function editRecord(blockId, recordId) {
    var block = SL.findBlock(data(), blockId);
    var rec = recordId ? SL.findRecord(data(), recordId) : null;
    var nameInput = h('input', { class: 'input', type: 'text', maxlength: '100', value: rec ? rec.name : '',
      placeholder: 'Ex. Test 3000 m, Max pompes…', 'aria-label': 'Nom de l\'exercice' });
    var valueInput = h('input', { class: 'input', type: 'text', maxlength: '50', value: rec ? rec.value : '',
      placeholder: 'Ex. 11:42, 70, 100 kg…', 'aria-label': 'Résultat' });
    var dateInput = h('input', { class: 'input', type: 'date', value: rec ? rec.date : D.today(),
      min: B.validate.MIN_DATE, max: D.today(), 'aria-label': 'Date du record' });
    var error = B.ui.formError();

    // Nouveau résultat : la date passe à aujourd'hui ; même résultat : date du record gardée.
    if (rec) {
      valueInput.addEventListener('input', function () {
        dateInput.value = valueInput.value.trim() === rec.value ? rec.date : D.today();
      });
    }

    var history = rec ? SL.recordHistory(rec) : [];
    var dlg;
    var content = h('form', {
      novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        var fields = { name: nameInput.value, value: valueInput.value, date: dateInput.value };
        var r = B.store.update(function (d) { return rec ? SL.updateRecord(d, rec.id, fields) : SL.addRecord(d, blockId, fields); });
        if (!r.ok) { B.ui.setError(error, r.error); return; }
        dlg.finish('ok');
      }
    },
      h('h2', { class: 'modal-title' }, rec ? 'Modifier le record' : 'Nouvel exercice'),
      h('p', { class: 'modal-text' }, 'Bloc « ' + block.name + ' »'),
      h('label', { class: 'rec-field' }, h('span', { class: 'section-label' }, 'Exercice'), nameInput),
      h('div', { class: 'rec-field-row' },
        h('label', { class: 'rec-field' }, h('span', { class: 'section-label' }, 'Résultat'), valueInput),
        h('label', { class: 'rec-field' }, h('span', { class: 'section-label' }, 'Date'), dateInput)),
      error,
      history.length ? h('details', { class: 'rec-history' },
        h('summary', null, 'Anciens records (' + history.length + ')'),
        h('ul', null, history.map(function (x) {
          return h('li', null, h('span', { class: 'num' }, x.value), h('span', { class: 'muted num' }, D.formatShort(x.date)));
        }))) : null,
      h('div', { class: 'modal-actions' },
        rec ? h('button', { type: 'button', class: 'btn btn-danger rec-delete', onclick: function () {
          dlg.finish('');
          B.ui.confirm({
            title: 'Supprimer « ' + rec.name + ' » ?',
            message: 'Le record et son historique seront supprimés.',
            confirmLabel: 'Supprimer', danger: true
          }).then(function (ok) {
            if (ok) B.store.update(function (d) { SL.deleteRecord(d, rec.id); });
            redrawRecords();
          });
        } }, 'Supprimer') : null,
        h('button', { type: 'button', class: 'btn', onclick: function () { dlg.finish(''); } }, 'Annuler'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Enregistrer'))
    );
    dlg = B.ui.openDialog(content, function (value) { if (value === 'ok') redrawRecords(); });
    (rec ? valueInput : nameInput).focus();
    if (rec) valueInput.select();
  }


  function leave() {
    saveDrafts();
    els = null;
  }

  B.modules = B.modules || {};
  B.modules.sport = { render: render, leave: leave, flush: saveDrafts };
})(window.Bourgeon = window.Bourgeon || {});
