/*
 * Bourgeon — module HABITUDES : affichage.
 * Les règles de calcul sont dans habits-logic.js.
 *
 * Onglet MOIS : grille de suivi (nom, fait / cible modifiable, %, un losange
 * par jour), aperçu du mois, semaines, complétion du mois, classement.
 * Onglet GLOBAL : bilan depuis toujours, habitudes archivées comprises.
 *
 * Pour que la saisie reste fluide, cocher une case ou changer une cible ne
 * redessine pas la grille : on met à jour la ligne concernée et les panneaux.
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon, D = B.dates, L = B.habitsLogic;

  var month = null;   // mois affiché "AAAA-MM"
  var els = null;     // éléments de l'écran
  var rows = {};      // habitId -> éléments de sa ligne

  function data() { return B.store.get(); }

  function render(container, tabId, ctx) {
    rows = {};
    if (tabId === 'global') renderGlobal(container);
    else if (tabId === 'today') renderToday(container, ctx);
    else renderMonth(container, ctx);
    if (ctx.mobile) {
      ctx.corner.appendChild(B.ui.cornerButton('plus', 'Nouvelle habitude', function () {
        B.app.showSection('habits', 'month');
        var input = document.querySelector('.habits-add .input');
        if (input) { input.scrollIntoView({ block: 'center' }); input.focus(); }
      }));
    }
  }

  /* ======================================================================
     Onglet AUJOURD'HUI (mobile) : cocher les rituels du jour d'un pouce
     ====================================================================== */

  var INITIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function renderToday(container) {
    els = { root: h('div', { class: 'habits-today' }) };
    container.appendChild(els.root);
    drawToday();
  }

  function drawToday() {
    var d = data(), today = D.today(), m = D.monthKey(today);
    var habits = L.habitsForMonth(d, m);
    var doneToday = habits.filter(function (x) { return L.checksOf(d, x.id)[today]; }).length;
    var monthPct = L.monthCompletion(d, m).pct;
    var left = habits.length - doneToday;
    var jour = D.JOURS[D.weekdayIndex(today)];
    var past = [];
    for (var k = 6; k >= 1; k--) past.push(D.addDays(today, -k));

    B.ui.clear(els.root);
    if (habits.length === 0) {
      els.root.appendChild(h('div', { class: 'card empty-state' },
        icon('plant', 'empty-icon'),
        h('p', { class: 'empty-title' }, 'Aucun rituel pour le moment'),
        h('p', { class: 'muted' }, 'Ajoute ta première habitude avec le bouton « + ».')));
      return;
    }

    var ring = h('div', { class: 'ring small', role: 'img', 'aria-label': doneToday + ' rituels faits sur ' + habits.length },
      h('span', { class: 'ring-ticks' }), h('span', { class: 'ring-square' }), h('span', { class: 'ring-square rot' }),
      h('span', { class: 'ring-arc' }),
      h('span', { class: 'ring-center' }, h('span', { class: 'ring-value num' }, String(doneToday), h('span', { class: 'ring-pct' }, '/' + habits.length))));
    ring.style.setProperty('--p', Math.round(doneToday / habits.length * 100));

    els.root.appendChild(h('section', { class: 'today-summary' },
      ring,
      h('div', { class: 'today-summary-text' },
        h('p', { class: 'today-summary-title' }, left === 0 ? 'Tous les rituels sont faits' : 'Encore ' + B.ui.plural(left, 'rituel', 'rituels')),
        h('p', { class: 'muted' }, 'pour ce ' + jour + '.'),
        h('p', { class: 'muted' }, 'Mois en cours : ', h('strong', { class: 'lvl-' + L.level(monthPct) }, monthPct + ' %')))
    ));

    els.root.appendChild(h('div', { class: 'today-days', 'aria-hidden': 'true' },
      past.map(function (date) { return h('span', null, INITIALES[D.weekdayIndex(date)]); }), h('span', { class: 'today-days-gap' })));

    els.root.appendChild(h('div', { class: 'today-habits' }, habits.map(function (x) {
      var checks = L.checksOf(d, x.id);
      var done = !!checks[today];
      var streak = L.currentStreak(checks, today);
      var pct = L.monthStats(d, x, m).pct;
      return h('div', { class: 'today-habit' + (done ? ' done' : '') },
        h('div', { class: 'today-habit-text' },
          h('span', { class: 'today-habit-name' }, x.name),
          h('span', { class: 'today-habit-meta' },
            streak > 0 ? [icon('fire', 'today-flame', 'ph-fill'), B.ui.plural(streak, 'j', 'j') + ' de série'] : 'Pas de série',
            ' · ', h('span', { class: 'lvl-' + L.level(pct) }, pct + ' %'))),
        h('div', { class: 'today-habit-past', 'aria-hidden': 'true' }, past.map(function (date) {
          return h('span', { class: 'mini-gem' + (checks[date] ? ' on' : '') });
        })),
        h('button', {
          type: 'button', class: 'big-check' + (done ? ' on' : ''), role: 'checkbox', 'aria-checked': done ? 'true' : 'false',
          'aria-label': (done ? 'Décocher ' : 'Cocher ') + x.name + ' pour aujourd\'hui',
          onclick: function () {
            B.store.update(function (dd) { L.toggleCheck(dd, x.id, today, today); });
            drawToday();
          }
        }, done ? icon('check', null, 'ph-bold') : null));
    })));
  }

  /* ======================================================================
     Onglet MOIS
     ====================================================================== */

  function renderMonth(container, ctx) {
    month = D.currentMonth();

    els = {
      prev: h('button', {
        type: 'button', class: 'btn btn-bare', 'aria-label': 'Mois précédent', title: 'Mois précédent',
        onclick: function () { goToMonth(D.addMonths(month, -1)); }
      }, icon('caret-left', null, 'ph-bold')),
      monthLabel: h('span', { class: 'habits-month-label', 'aria-live': 'polite' }),
      next: h('button', {
        type: 'button', class: 'btn btn-bare', 'aria-label': 'Mois suivant', title: 'Mois suivant',
        onclick: function () { goToMonth(D.addMonths(month, 1)); }
      }, icon('caret-right', null, 'ph-bold')),
      todayBtn: h('button', { type: 'button', class: 'btn', onclick: function () { goToMonth(D.currentMonth()); } }, 'Aujourd\'hui'),

      grid: h('div', { class: 'hgrid', role: 'table', 'aria-label': 'Suivi des habitudes' }),
      newName: h('input', {
        class: 'input', type: 'text', maxlength: '100',
        placeholder: 'Inscrire un nouveau rituel…', 'aria-label': 'Nouvelle habitude'
      }),
      error: B.ui.formError(),

      ring: h('div', { class: 'ring', role: 'img' }),
      ranking: h('div', { class: 'ranking' }),
      curve: h('div', { class: 'pins' }),
      weeks: h('div', { class: 'weeks' })
    };

    ctx.actions.appendChild(els.prev);
    ctx.actions.appendChild(els.monthLabel);
    ctx.actions.appendChild(els.next);
    ctx.actions.appendChild(els.todayBtn);

    var addForm = h('form', { class: 'habits-add', novalidate: true, onsubmit: onAdd },
      els.newName,
      h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus', null, 'ph-bold'), 'Invoquer')
    );

    container.appendChild(h('div', { class: 'habits-month' },
      h('section', { class: 'card habits-main' },
        h('div', { class: 'hgrid-scroll' }, els.grid),
        addForm,
        els.error,
        h('div', { class: 'habits-bottom' },
          h('div', { class: 'habits-panel' },
            h('h2', { class: 'section-label' }, 'Aperçu du mois'),
            els.curve
          ),
          h('div', { class: 'habits-panel' },
            h('h2', { class: 'section-label' }, 'Semaines'),
            els.weeks
          )
        )
      ),
      h('aside', { class: 'habits-side' },
        h('div', { class: 'habits-ring-block' },
          els.ring,
          h('h2', { class: 'section-label' }, 'Complétion du mois')
        ),
        h('div', { class: 'habits-ranking-block' },
          h('h2', { class: 'section-label' }, 'Classement'),
          els.ranking,
          h('div', { class: 'level-legend' },
            h('span', null, h('i', { class: 'gem lvl-bg-success' }), '≥ 80 %'),
            h('span', null, h('i', { class: 'gem lvl-bg-warning' }), '≥ 50 %'),
            h('span', null, h('i', { class: 'gem lvl-bg-danger' }), '< 50 %')
          )
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

    // En-tête : colonnes fixes + numéros de jour (dimanches et jour actuel marqués)
    var dayHeads = [];
    for (var day = 1; day <= n; day++) {
      var date = D.dayOfMonth(month, day);
      var wd = D.weekdayIndex(date);
      dayHeads.push(h('span', {
        class: 'hday-head' + (date === today ? ' today' : '') + (wd === 6 ? ' sunday' : ''),
        title: D.formatLong(date), role: 'columnheader'
      }, String(day)));
    }
    els.grid.appendChild(h('div', { class: 'hrow hrow-head', role: 'row' },
      h('div', { class: 'hfix' },
        h('span', { role: 'columnheader' }, 'Rituel'),
        h('span', { class: 'right', role: 'columnheader' }, 'Fait'),
        h('span', { class: 'right', role: 'columnheader' }, '%')
      ),
      dayHeads,
      h('span', { class: 'hend' })
    ));
    els.grid.appendChild(B.ui.ornament('hgrid-ornament'));

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
      'aria-label': 'Cible de ' + x.name + ' pour ' + D.monthLabel(month), title: 'Cible du mois (modifiable)'
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
    r.doneCell = h('span', { class: 'right hdone' }, r.done, h('span', { class: 'slash' }, '/'), r.target);
    r.pct = h('span', { class: 'num' });

    var cells = [];
    for (var day = 1; day <= n; day++) cells.push(dayCell(x, D.dayOfMonth(month, day), today));

    var row = h('div', { class: 'hrow', role: 'row' },
      h('div', { class: 'hfix', role: 'rowheader' },
        r.name,
        r.doneCell,
        h('span', { class: 'right hpct' }, r.pct)
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

  /* Losange plein = fait ; petit point = jour passé manqué ; contour = aujourd'hui. */
  function setCellState(btn, x, date, today) {
    var checked = !!L.checksOf(data(), x.id)[date];
    var future = date > today;
    btn.className = 'hcell' + (checked ? ' done' : future ? ' future' : date === today ? ' today' : ' missed');
    btn.disabled = future;
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
    btn.setAttribute('aria-label', x.name + ' — ' + D.formatLong(date));
    btn.title = D.formatLong(date) + (future ? ' (à venir)' : checked ? ' — fait' : '');
  }

  function updateRow(x) {
    var r = rows[x.id];
    if (!r) return;
    var s = L.monthStats(data(), x, month);
    r.done.textContent = s.done;
    if (document.activeElement !== r.target) r.target.value = s.target;
    r.doneCell.title = B.ui.plural(s.rest, 'restant', 'restants') + ' pour atteindre la cible';
    r.pct.textContent = s.pct;
    r.pct.className = 'num lvl-' + L.level(s.pct);
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

  /* ---------- Panneaux : cadran, classement, aperçu, semaines ---------- */

  function drawPanels() {
    var d = data();
    var c = L.monthCompletion(d, month);

    // Cadran de complétion
    B.ui.clear(els.ring);
    els.ring.style.setProperty('--p', Math.min(c.pct, 100));
    els.ring.setAttribute('aria-label', 'Complétion du mois : ' + c.pct + ' %, ' + c.done + ' sur ' + c.target);
    B.ui.append(els.ring, [
      h('span', { class: 'ring-ticks' }),
      h('span', { class: 'ring-square' }),
      h('span', { class: 'ring-square rot' }),
      h('span', { class: 'ring-arc' }),
      h('span', { class: 'ring-center' },
        h('span', { class: 'ring-value num' }, String(c.pct), h('span', { class: 'ring-pct' }, '%')),
        h('span', { class: 'ring-sub' }, c.done + ' sur ' + c.target))
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
          h('span', { class: 'num rank-pct lvl-' + lvl }, String(item.stats.pct))
        ),
        h('div', { class: 'bar' }, h('span', { class: 'bar-fill lvl-' + lvl, style: 'width:' + Math.min(item.stats.pct, 100) + '%' }))
      ));
    });

    drawPins(d);

    // Semaines : un losange par semaine, de la couleur de son niveau
    B.ui.clear(els.weeks);
    L.weeklyRecap(d, month).forEach(function (w) {
      els.weeks.appendChild(h('div', { class: 'week', title: 'Jours ' + w.label + ' : ' + w.pct + ' %' },
        h('span', { class: 'week-gem lvl-' + L.level(w.pct) }, h('span', { class: 'num' }, String(w.pct))),
        h('span', { class: 'week-range num' }, w.label)
      ));
    });
  }

  /*
   * Aperçu du mois : une « épingle » par jour, de hauteur = % des habitudes
   * cochées ce jour-là. S'arrête à aujourd'hui pour le mois en cours.
   */
  function drawPins(d) {
    var points = L.dailyCurve(d, month, D.today());
    var n = D.daysInMonth(month);
    var today = D.today();
    B.ui.clear(els.curve);
    if (L.habitsForMonth(d, month).length === 0) {
      els.curve.appendChild(h('p', { class: 'muted small' }, 'L\'aperçu apparaîtra avec tes premières habitudes.'));
      return;
    }
    var chart = h('div', { class: 'pins-chart', role: 'img',
      'aria-label': 'Pourcentage des habitudes cochées chaque jour de ' + D.monthLabel(month) });
    for (var day = 1; day <= n; day++) {
      var p = points[day - 1];
      if (!p) { chart.appendChild(h('span', { class: 'pin empty' })); continue; }
      var tone = p.date === today ? 'now' : p.pct >= 80 ? 'high' : 'low';
      chart.appendChild(h('span', {
        class: 'pin ' + tone, style: '--h:' + Math.max(p.pct, 4) + '%',
        title: day + ' ' + D.MOIS[+month.slice(5, 7) - 1] + ' — ' + p.pct + ' %'
      }, h('span', { class: 'pin-head' }), h('span', { class: 'pin-stem' })));
    }
    els.curve.appendChild(chart);
    els.curve.appendChild(h('div', { class: 'pins-axis' },
      h('span', null, '1 ' + D.MOIS_COURTS[+month.slice(5, 7) - 1]), h('span', null, '15'),
      h('span', { class: 'pins-last' }, String(n))));
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
