/*
 * Bourgeon — module HABITUDES : affichage.
 * Les règles de calcul sont dans habits-logic.js.
 *
 * Onglet MOIS : grille de suivi (nom, cible, fait, reste, %, une case par
 * jour), complétion du mois, classement, aperçu mensuel, récap hebdomadaire.
 * Onglet GLOBAL : bilan depuis toujours, habitudes archivées comprises.
 *
 * Pour que la saisie reste fluide, cocher une case ou changer une cible ne
 * redessine pas la grille : on met à jour la ligne concernée et les panneaux.
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon, D = B.dates, L = B.habitsLogic;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  var month = null;   // mois affiché "AAAA-MM"
  var els = null;     // éléments de l'écran
  var rows = {};      // habitId -> éléments de sa ligne

  function data() { return B.store.get(); }

  function render(container, tabId, ctx) {
    rows = {};
    if (tabId === 'global') renderGlobal(container);
    else renderMonth(container, ctx);
  }

  /* ======================================================================
     Onglet MOIS
     ====================================================================== */

  function renderMonth(container, ctx) {
    month = D.currentMonth();

    els = {
      prev: h('button', {
        type: 'button', class: 'btn btn-icon', 'aria-label': 'Mois précédent', title: 'Mois précédent',
        onclick: function () { goToMonth(D.addMonths(month, -1)); }
      }, icon('caret-left')),
      monthLabel: h('span', { class: 'habits-month-label', 'aria-live': 'polite' }),
      next: h('button', {
        type: 'button', class: 'btn btn-icon', 'aria-label': 'Mois suivant', title: 'Mois suivant',
        onclick: function () { goToMonth(D.addMonths(month, 1)); }
      }, icon('caret-right')),
      todayBtn: h('button', { type: 'button', class: 'btn', onclick: function () { goToMonth(D.currentMonth()); } }, 'Aujourd\'hui'),

      grid: h('div', { class: 'hgrid', role: 'table', 'aria-label': 'Suivi des habitudes' }),
      newName: h('input', {
        class: 'input', type: 'text', maxlength: '100',
        placeholder: 'Nouvelle habitude…', 'aria-label': 'Nouvelle habitude'
      }),
      error: B.ui.formError(),

      ring: h('div', { class: 'ring' }),
      ringText: h('div', { class: 'ring-legend' }),
      ranking: h('div', { class: 'ranking' }),
      curve: h('div', { class: 'curve' }),
      weeks: h('div', { class: 'weeks' })
    };

    ctx.actions.appendChild(els.prev);
    ctx.actions.appendChild(els.monthLabel);
    ctx.actions.appendChild(els.next);
    ctx.actions.appendChild(els.todayBtn);

    var addForm = h('form', { class: 'habits-add', novalidate: true, onsubmit: onAdd },
      els.newName,
      h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus'), 'Ajouter')
    );

    container.appendChild(h('div', { class: 'habits-month' },
      h('section', { class: 'card habits-grid-card' },
        h('div', { class: 'hgrid-scroll' }, els.grid),
        addForm,
        els.error
      ),
      h('aside', { class: 'habits-side' },
        h('section', { class: 'card' },
          h('h2', { class: 'section-label' }, 'Complétion du mois'),
          h('div', { class: 'ring-row' }, els.ring, els.ringText)
        ),
        h('section', { class: 'card habits-ranking-card' },
          h('h2', { class: 'section-label' }, 'Classement'),
          els.ranking,
          h('div', { class: 'level-legend' },
            h('span', null, h('i', { class: 'dot lvl-bg-success' }), '≥ 80 %'),
            h('span', null, h('i', { class: 'dot lvl-bg-warning' }), '≥ 50 %'),
            h('span', null, h('i', { class: 'dot lvl-bg-danger' }), '< 50 %')
          )
        )
      ),
      h('div', { class: 'habits-bottom' },
        h('section', { class: 'card' },
          h('div', { class: 'card-head' },
            h('h2', { class: 'section-label' }, 'Aperçu mensuel'),
            h('span', { class: 'card-hint' }, '% des habitudes cochées par jour')
          ),
          els.curve
        ),
        h('section', { class: 'card' },
          h('h2', { class: 'section-label' }, 'Récap hebdomadaire'),
          els.weeks
        )
      )
    ));

    drawMonth();
  }

  function goToMonth(m) {
    if (m > D.currentMonth()) m = D.currentMonth();   // pas au-delà du mois en cours
    month = m;
    B.ui.setError(els.error, '');
    drawMonth();
  }

  function drawMonth() {
    var current = D.currentMonth();
    els.monthLabel.textContent = D.monthLabel(month);
    els.next.disabled = month >= current;
    els.todayBtn.disabled = month === current;
    drawGrid();
    drawPanels();
  }

  /* ---------- Grille de suivi ---------- */

  function drawGrid() {
    var habits = L.habitsForMonth(data(), month);
    var today = D.today();
    var n = D.daysInMonth(month);
    rows = {};
    B.ui.clear(els.grid);

    // En-tête : colonnes fixes + numéros de jour
    var dayHeads = [];
    for (var day = 1; day <= n; day++) {
      var date = D.dayOfMonth(month, day);
      var wd = D.weekdayIndex(date);
      dayHeads.push(h('span', {
        class: 'hday-head' + (date === today ? ' today' : '') + (wd >= 5 ? ' weekend' : ''),
        title: D.formatLong(date), role: 'columnheader'
      }, String(day)));
    }
    els.grid.appendChild(h('div', { class: 'hrow hrow-head', role: 'row' },
      h('div', { class: 'hfix' },
        h('span', { role: 'columnheader' }, 'Habitude'),
        h('span', { class: 'right', role: 'columnheader' }, 'Fait / cible'),
        h('span', { class: 'right', role: 'columnheader' }, 'Reste'),
        h('span', { class: 'right', role: 'columnheader' }, '%')
      ),
      dayHeads,
      h('span', { class: 'hend' })
    ));

    if (habits.length === 0) {
      els.grid.appendChild(h('p', { class: 'muted hgrid-empty' },
        month === D.currentMonth() ? 'Ajoute ta première habitude ci-dessous.' : 'Aucune habitude suivie ce mois-là.'));
      return;
    }

    habits.forEach(function (x) { els.grid.appendChild(habitRow(x, today, n)); });
  }

  function habitRow(x, today, n) {
    var r = rows[x.id] = {};

    // Nom, modifiable dans la ligne
    r.name = h('input', { class: 'hname', type: 'text', value: x.name, maxlength: '100', 'aria-label': 'Nom de l\'habitude' });
    editableOnBlur(r.name, function (value) {
      var result = B.store.update(function (d) { return L.renameHabit(d, x.id, value); });
      if (!result.ok) return result.error;
      drawPanels();
      return null;
    }, function () { return L.findHabit(data(), x.id).name; });

    // Cible du mois, modifiable dans la ligne
    r.target = h('input', {
      class: 'htarget num', type: 'text', inputmode: 'numeric', maxlength: '3',
      'aria-label': 'Cible de ' + x.name + ' pour ' + D.monthLabel(month)
    });
    editableOnBlur(r.target, function (value) {
      var result = B.store.update(function (d) { return L.setTarget(d, x.id, month, value); });
      if (!result.ok) return result.error;
      r.target.classList.add('saved-ok');
      setTimeout(function () { r.target.classList.remove('saved-ok'); }, 900);
      updateRow(x);
      drawPanels();
      return null;
    }, function () { return String(L.targetFor(data(), x, month)); });

    r.done = h('span', { class: 'num' });
    r.rest = h('span', { class: 'right num muted' });
    r.pct = h('span', { class: 'num' });
    r.bar = h('span');

    var cells = [];
    for (var day = 1; day <= n; day++) cells.push(dayCell(x, D.dayOfMonth(month, day), today));

    var row = h('div', { class: 'hrow', role: 'row' },
      h('div', { class: 'hfix', role: 'rowheader' },
        r.name,
        h('span', { class: 'right hdone' }, r.done, h('span', { class: 'slash' }, '/'), r.target),
        r.rest,
        h('span', { class: 'right hpct' }, r.pct, h('span', { class: 'progress' }, r.bar))
      ),
      cells,
      h('span', { class: 'hend' },
        h('button', {
          type: 'button', class: 'icon-action', title: 'Archiver', 'aria-label': 'Archiver « ' + x.name + ' »',
          onclick: function () { archive(x); }
        }, icon('archive')))
    );
    updateRow(x);
    return row;
  }

  /*
   * Champ modifié « en quittant le champ » (Entrée ou clic ailleurs) ; Échap
   * annule. save(value) renvoie un message d'erreur ou null.
   */
  function editableOnBlur(input, save, currentValue) {
    input.value = currentValue();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = currentValue(); input.blur(); }
    });
    input.addEventListener('blur', function () {
      if (!els || input.value === currentValue()) return;
      var error = save(input.value);
      B.ui.setError(els.error, error || '');
      input.value = currentValue();
    });
  }

  function dayCell(x, date, today) {
    var btn = h('button', { type: 'button', class: 'hcell', role: 'checkbox' });
    setCellState(btn, x, date, today);
    btn.addEventListener('click', function () {
      if (date > today) return;
      B.store.update(function (d) { L.toggleCheck(d, x.id, date, today); });
      setCellState(btn, x, date, today);
      updateRow(x);
      drawPanels();
    });
    return h('span', { class: 'hday', role: 'cell' }, btn);
  }

  function setCellState(btn, x, date, today) {
    var checked = !!L.checksOf(data(), x.id)[date];
    var future = date > today;
    btn.className = 'hcell' + (checked ? ' done' : '') + (date === today ? ' today' : '') + (future ? ' future' : '');
    btn.disabled = future;
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
    btn.setAttribute('aria-label', x.name + ' — ' + D.formatLong(date));
    btn.title = D.formatLong(date) + (future ? ' (à venir)' : checked ? ' — fait' : '');
    if (checked) { B.ui.clear(btn); btn.appendChild(icon('check', null, 'ph-bold')); }
    else B.ui.clear(btn);
  }

  function updateRow(x) {
    var r = rows[x.id];
    if (!r) return;
    var s = L.monthStats(data(), x, month);
    var lvl = L.level(s.pct);
    r.done.textContent = s.done;
    if (document.activeElement !== r.target) r.target.value = s.target;
    r.rest.textContent = s.rest;
    r.pct.textContent = s.pct + ' %';
    r.pct.className = 'num lvl-' + lvl;
    r.bar.className = 'lvl-bg-' + lvl;
    r.bar.style.width = Math.min(s.pct, 100) + '%';
  }

  function onAdd(e) {
    e.preventDefault();
    var result = B.store.update(function (d) { return L.addHabit(d, els.newName.value, D.today()); });
    if (!result.ok) { B.ui.setError(els.error, result.error); return; }
    B.ui.setError(els.error, '');
    els.newName.value = '';
    month = D.currentMonth();
    drawMonth();
    els.newName.focus();
  }

  function archive(x) {
    B.ui.confirm({
      title: 'Archiver l\'habitude',
      message: 'Archiver « ' + x.name + ' » ? Elle disparaîtra de la liste du jour, mais son historique ' +
        'restera consultable en naviguant vers les mois où elle était suivie.',
      confirmLabel: 'Archiver'
    }).then(function (ok) {
      if (!ok || !els) return;
      B.store.update(function (d) { L.archiveHabit(d, x.id, D.today()); });
      drawMonth();
    });
  }

  /* ---------- Panneaux : anneau, classement, aperçu, semaines ---------- */

  function drawPanels() {
    var d = data();
    var c = L.monthCompletion(d, month);

    // Anneau de complétion
    els.ring.style.setProperty('--p', Math.min(c.pct, 100));
    B.ui.clear(els.ring);
    els.ring.appendChild(h('span', { class: 'ring-value num' }, c.pct + ' %'));
    B.ui.clear(els.ringText);
    B.ui.append(els.ringText, [
      h('span', null, h('strong', { class: 'num' }, String(c.done)), ' ', c.done >= 2 ? 'coches' : 'coche'),
      h('span', null, 'sur ' + c.target + ' ' + (c.target >= 2 ? 'visées' : 'visée')),
      h('span', null, c.rest + ' ' + (c.rest >= 2 ? 'restantes' : 'restante'))
    ]);

    // Classement
    var ranked = L.ranking(d, month);
    B.ui.clear(els.ranking);
    if (ranked.length === 0) els.ranking.appendChild(h('p', { class: 'muted small' }, 'Aucune habitude ce mois-ci.'));
    ranked.forEach(function (item) {
      var lvl = L.level(item.stats.pct);
      els.ranking.appendChild(h('div', { class: 'rank-item' },
        h('div', { class: 'rank-line' },
          h('span', { class: 'rank-name' }, item.habit.name),
          h('span', { class: 'num lvl-' + lvl }, item.stats.pct + ' %')
        ),
        h('div', { class: 'progress' }, h('span', { class: 'lvl-bg-' + lvl, style: 'width:' + Math.min(item.stats.pct, 100) + '%' }))
      ));
    });

    drawCurve(d);

    // Récap hebdomadaire
    B.ui.clear(els.weeks);
    L.weeklyRecap(d, month).forEach(function (w) {
      els.weeks.appendChild(h('div', { class: 'week-row' },
        h('span', { class: 'num muted' }, w.label),
        h('div', { class: 'progress thick' }, h('span', { style: 'width:' + Math.min(w.pct, 100) + '%' })),
        h('span', { class: 'num right' }, w.pct + ' %')
      ));
    });
  }

  function svg(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  /* Aperçu mensuel : graphique en aire (SVG), arrêté à aujourd'hui pour le mois en cours. */
  function drawCurve(d) {
    var points = L.dailyCurve(d, month, D.today());
    var n = D.daysInMonth(month);
    var W = 300, H = 100;
    var x = function (day) { return (day - 1) / (n - 1) * W; };
    var y = function (pct) { return 4 + (100 - pct) * 0.92; };

    B.ui.clear(els.curve);
    if (L.habitsForMonth(d, month).length === 0) {
      els.curve.appendChild(h('p', { class: 'muted small' }, 'La courbe apparaîtra avec tes premières habitudes.'));
      return;
    }

    var chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', class: 'curve-svg', role: 'img',
      'aria-label': 'Pourcentage des habitudes cochées chaque jour de ' + D.monthLabel(month) });
    var gradId = 'curve-grad';
    var defs = svg('defs');
    var grad = svg('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svg('stop', { offset: '0', class: 'curve-stop-top' }));
    grad.appendChild(svg('stop', { offset: '1', class: 'curve-stop-bottom' }));
    defs.appendChild(grad);
    chart.appendChild(defs);

    [0, 50, 100].forEach(function (p) {
      chart.appendChild(svg('line', { x1: 0, x2: W, y1: y(p), y2: y(p), class: 'curve-grid', 'vector-effect': 'non-scaling-stroke' }));
    });

    if (points.length > 0) {
      var line = points.map(function (p, i) { return (i ? 'L' : 'M') + x(p.day).toFixed(2) + ',' + y(p.pct).toFixed(2); }).join(' ');
      var last = points[points.length - 1];
      var area = line + ' L' + x(last.day).toFixed(2) + ',' + H + ' L0,' + H + ' Z';
      chart.appendChild(svg('path', { d: area, fill: 'url(#' + gradId + ')' }));
      chart.appendChild(svg('path', { d: line, class: 'curve-line', 'vector-effect': 'non-scaling-stroke' }));

      // Zones de survol : une par jour, avec info-bulle
      var step = W / (n - 1);
      points.forEach(function (p) {
        var zone = svg('rect', { x: Math.max(0, x(p.day) - step / 2), y: 0, width: step, height: H, class: 'curve-hit' });
        var title = svg('title');
        title.textContent = D.parse(p.date).getDate() + ' ' + D.MOIS[+month.slice(5, 7) - 1] + ' — ' + p.pct + ' %';
        zone.appendChild(title);
        chart.appendChild(zone);
      });
    }

    var monthShort = MOIS_COURTS[+month.slice(5, 7) - 1];
    els.curve.appendChild(chart);
    els.curve.appendChild(h('div', { class: 'curve-axis' },
      h('span', null, '1 ' + monthShort), h('span', null, '15'), h('span', null, String(n))));
  }

  /* ======================================================================
     Onglet GLOBAL
     ====================================================================== */

  function renderGlobal(container) {
    els = { root: h('div', { class: 'habits-global' }) };
    container.appendChild(els.root);
    drawGlobal();
  }

  function drawGlobal() {
    var g = L.globalStats(data(), D.today());
    B.ui.clear(els.root);

    function kpi(label, value, unit) {
      return h('div', { class: 'card kpi' },
        h('span', { class: 'section-label' }, label),
        h('span', { class: 'kpi-value num' }, String(value), unit ? h('span', { class: 'kpi-unit' }, unit) : null)
      );
    }
    els.root.appendChild(h('div', { class: 'kpis' },
      kpi('Habitudes suivies', g.count),
      kpi('Meilleure série en cours', g.bestCurrentStreak, g.bestCurrentStreak >= 2 ? 'jours' : 'jour'),
      kpi('Total réalisé', g.totalDone, 'fois'),
      kpi('Réussite globale', g.globalRate, '%')
    ));

    var card = h('section', { class: 'card habits-table-card' });
    els.root.appendChild(card);

    if (g.rows.length === 0) {
      card.appendChild(h('p', { class: 'muted' }, 'Aucune habitude pour le moment.'));
      return;
    }

    var tbody = h('tbody');
    g.rows.forEach(function (row) {
      var x = row.habit;
      var lvl = L.level(row.rate);
      tbody.appendChild(h('tr', null,
        h('th', { scope: 'row' },
          h('span', { class: 'gname' }, x.name),
          x.archivedAt ? h('span', { class: 'badge', title: 'Archivée le ' + D.formatShort(x.archivedAt) }, 'archivée') : null),
        h('td', { class: 'num' },
          h('span', { class: 'streak' + (row.streak > 0 ? ' on' : '') }, icon('fire', null, row.streak > 0 ? 'ph-fill' : 'ph'), row.streak + ' j')),
        h('td', { class: 'num' }, row.record + ' j'),
        h('td', { class: 'num' }, String(row.done)),
        h('td', null, h('span', { class: 'badge ' + lvl + ' num' }, row.rate + ' %')),
        h('td', null, miniBars(row.months)),
        h('td', { class: 'right' }, h('button', {
          type: 'button', class: 'icon-action danger', title: 'Supprimer définitivement',
          'aria-label': 'Supprimer « ' + x.name + ' » et tout son historique',
          onclick: function () { remove(x); }
        }, icon('trash')))
      ));
    });

    card.appendChild(h('div', { class: 'table-scroll' },
      h('table', { class: 'table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Habitude'),
          h('th', { scope: 'col' }, 'Série actu.'),
          h('th', { scope: 'col' }, 'Record'),
          h('th', { scope: 'col' }, 'Total fait'),
          h('th', { scope: 'col' }, 'Réussite'),
          h('th', { scope: 'col' }, '12 derniers mois'),
          h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Supprimer'))
        )),
        tbody
      )
    ));
  }

  function miniBars(months) {
    return h('div', { class: 'minibars', role: 'img',
      'aria-label': months.map(function (m) { return m.label; }).join(', ') },
      months.map(function (m) {
        return h('span', { class: 'minibar', title: m.label },
          h('span', { style: 'height:' + Math.max(m.pct, m.done > 0 ? 6 : 0) + '%' }));
      }));
  }

  function remove(x) {
    B.ui.confirm({
      title: 'Supprimer définitivement',
      message: 'Supprimer « ' + x.name + ' » et tout son historique ? Cette action est définitive et ' +
        'irréversible : toutes les coches enregistrées pour cette habitude seront perdues.',
      confirmLabel: 'Supprimer',
      danger: true
    }).then(function (ok) {
      if (!ok || !els) return;
      B.store.update(function (d) { L.deleteHabit(d, x.id); });
      drawGlobal();
    });
  }

  function leave() {
    // Un nom ou une cible en cours de modification est enregistré (événement blur).
    if (document.activeElement && els && els.grid && els.grid.contains(document.activeElement)) document.activeElement.blur();
    els = null;
    rows = {};
  }

  B.modules = B.modules || {};
  B.modules.habits = {
    render: render,
    leave: leave,
    flush: function () {
      if (document.activeElement && els && els.grid && els.grid.contains(document.activeElement)) document.activeElement.blur();
    }
  };
})(window.Bourgeon = window.Bourgeon || {});
