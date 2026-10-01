/*
 * Bourgeon — module RÉVISIONS : affichage.
 * Les règles de calcul sont dans revisions-logic.js.
 *
 * Onglet ARBORESCENCE : réglages (paliers par défaut, types de paliers,
 * heure de début de journée), arbre Matière ▸ Chapitre ▸ Concept avec une
 * case par palier.
 * Onglet AUJOURD'HUI : les concepts à revoir, les plus en retard en haut et
 * en plus gros.
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon, D = B.dates, RL = B.revisionsLogic;

  var collapsed = {};   // id -> true si la section est repliée (mémorisé pendant la session)
  var view = null;      // 'tree' | 'today'
  var els = null;
  var shownDay = null;  // journée logique affichée
  var timer = null;

  function data() { return B.store.get(); }
  function day() { return RL.today(data()); }

  function render(container, tabId, ctx) {
    view = tabId === 'today' ? 'today' : 'tree';
    shownDay = day();
    els = { root: h('div', { class: 'revisions' }) };
    container.appendChild(els.root);
    ctx.actions.appendChild(h('button', { type: 'button', class: 'btn', onclick: openStepTypes }, icon('sliders-horizontal'), 'Rythmes'));
    if (view === 'tree') {
      ctx.actions.appendChild(h('button', {
        type: 'button', class: 'btn btn-primary',
        onclick: function () {
          var input = els && els.root.querySelector('.rv-add-subject input');
          if (input) { input.scrollIntoView({ block: 'center', behavior: 'smooth' }); input.focus(); }
        }
      }, icon('plus', null, 'ph-bold'), 'Nouvelle matière'));
    }
    if (view === 'today') renderToday(); else renderTree();

    // La liste se met à jour toute seule au passage de l'heure de début de
    // journée, même si la page reste ouverte (ou après une mise en veille).
    clearInterval(timer);
    timer = setInterval(checkNewDay, 30000);
    document.addEventListener('visibilitychange', checkNewDay);
  }

  function checkNewDay() {
    if (!els || day() === shownDay) return;
    shownDay = day();
    B.ui.clear(els.root);
    if (view === 'today') renderToday(); else renderTree();
    if (B.app.refreshBadges) B.app.refreshBadges();
  }

  /* ======================================================================
     Onglet ARBORESCENCE
     ====================================================================== */

  function renderTree() {
    // --- Arbre ---
    els.treeError = B.ui.formError();
    els.tree = h('div', { class: 'rv-tree' });
    var subjectInput = h('input', { class: 'input', type: 'text', maxlength: '100', placeholder: 'Nouvelle matière…', 'aria-label': 'Nouvelle matière' });
    var subjectError = B.ui.formError();
    els.root.appendChild(h('section', { class: 'card rv-tree-card' },
      els.treeError,
      els.tree,
      addForm(subjectInput, 'Matière', subjectError, function () {
        return B.store.update(function (d) { return RL.addSubject(d, subjectInput.value); });
      }, 'rv-add-subject'),
      h('div', { class: 'rv-legend', 'aria-label': 'Légende des cases de palier' },
        legendItem('done', 'Fait'),
        legendItem('late', 'En retard'),
        legendItem('todo', 'À faire'),
        legendItem('locked', 'Verrouillé')
      )
    ));
    drawTree();
  }

  function legendItem(state, label) {
    return h('span', { class: 'rv-legend-item' }, h('span', { class: 'rv-cell sample ' + state }), label);
  }

  /* Petit formulaire « Nouveau … » [+ …] avec sa zone d'erreur. */
  function addForm(input, label, error, add, extraClass) {
    return h('form', {
      class: 'rv-add ' + (extraClass || ''), novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        var r = add();
        B.ui.setError(error, r.ok ? '' : r.error);
        if (!r.ok) return;
        var focusKey = input.getAttribute('data-focus-key');
        drawTree();
        var again = focusKey && els.tree.parentNode.querySelector('[data-focus-key="' + focusKey + '"]');
        (again || input).focus();
        if (!again) input.value = '';
      }
    },
      h('div', { class: 'rv-inline' }, input, h('button', { type: 'submit', class: 'btn btn-ghost' }, icon('plus'), label)),
      error
    );
  }

  function drawTree() {
    if (!els || !els.tree) return;
    var d = data(), today = day();
    var subjects = d.revisions.subjects;
    B.ui.clear(els.tree);
    B.ui.setError(els.treeError, '');

    if (subjects.length === 0) {
      els.tree.appendChild(h('p', { class: 'muted rv-empty' }, 'Ajoute une première matière ci-dessous.'));
      return;
    }
    subjects.forEach(function (s) { els.tree.appendChild(subjectBlock(d, s, today)); });
  }

  function subjectBlock(d, s, today) {
    var steps = RL.stepsForSubject(d, s);
    var cols = 'minmax(0, 1fr) repeat(' + steps.length + ', var(--rv-cell-col)) var(--rv-actions-col)';

    var typeSelect = h('select', {
      class: 'rv-type', 'aria-label': 'Rythme de ' + s.name, title: 'Rythme de révision (cliquer pour changer)',
      onchange: function () {
        B.store.update(function (dd) { RL.setSubjectStepType(dd, s.id, typeSelect.value); });
        drawTree();
      }
    }, h('option', { value: '' }, 'Rythme par défaut'),
      d.revisions.stepTypes.map(function (t) {
        var o = h('option', { value: t.id }, 'Rythme ' + t.name);
        if (t.id === s.stepTypeId) o.selected = true;
        return o;
      }));

    var chapters = RL.chaptersOf(d, s.id);
    var body = h('div', { class: 'rv-body' },
      h('div', { class: 'rv-grid rv-cols', style: 'grid-template-columns:' + cols, 'aria-hidden': 'true' },
        h('span'),
        steps.map(function (n, i) {
          var last = i === steps.length - 1;
          return h('span', { class: 'rv-col-head' + (last ? ' last' : '') }, 'J+' + n, last ? h('small', null, 'entretien') : null);
        }),
        h('span')
      ),
      chapters.map(function (ch) { return chapterBlock(d, s, ch, steps, cols, today); }),
      chapterForm(s)
    );

    return h('section', { class: 'rv-subject' + (collapsed[s.id] ? ' collapsed' : '') + (s.frozenAt ? ' frozen' : '') },
      h('div', { class: 'rv-subject-head' },
        titleButton(s, 'subject', 'rv-subject-title'),
        typeSelect,
        s.frozenAt ? h('span', { class: 'badge rv-frozen-badge' }, icon('snowflake'), 'gelée') : null,
        h('span', { class: 'rv-spacer' }),
        freezeButton('subject', s),
        deleteButton('subject', s)
      ),
      body
    );
  }

  function chapterBlock(d, s, ch, steps, cols, today) {
    var concepts = RL.conceptsOf(d, ch.id);
    var inheritedFrozen = !!s.frozenAt;
    return h('div', { class: 'rv-chapter' + (collapsed[ch.id] ? ' collapsed' : '') + (ch.frozenAt || inheritedFrozen ? ' frozen' : '') },
      h('div', { class: 'rv-grid rv-chapter-head', style: 'grid-template-columns:' + cols },
        h('div', { class: 'rv-name-cell' },
          titleButton(ch, 'chapter', 'rv-chapter-title'),
          ch.frozenAt ? h('span', { class: 'badge rv-frozen-badge' }, icon('snowflake'), 'gelé') : null
        ),
        h('span', { style: 'grid-column: span ' + steps.length }),
        h('div', { class: 'rv-actions' }, freezeButton('chapter', ch), deleteButton('chapter', ch))
      ),
      h('div', { class: 'rv-body' },
        concepts.map(function (c) { return conceptRow(d, c, steps, cols, today, inheritedFrozen || !!ch.frozenAt); }),
        conceptForm(ch)
      )
    );
  }

  function conceptRow(d, c, steps, cols, today, parentFrozen) {
    var st = RL.conceptState(c, steps, today);
    return h('div', { class: 'rv-grid rv-concept' + (c.frozenAt || parentFrozen ? ' frozen' : ''), style: 'grid-template-columns:' + cols },
      h('div', { class: 'rv-name-cell' }, nameLabel(c, 'concept', 'rv-concept-name')),
      st.cells.map(function (cell, i) { return stepCell(c, cell, i, steps, st); }),
      h('div', { class: 'rv-actions' }, freezeButton('concept', c), deleteButton('concept', c))
    );
  }

  /* Case d'un palier : fait / en retard / à faire / verrouillé. */
  function stepCell(c, cell, i, steps, st) {
    var label = 'J+' + steps[i] + (i === steps.length - 1 ? ' (entretien)' : '');
    var title;
    if (cell.state === 'done') title = label + ' — fait' + (cell.date ? ' le ' + D.formatShort(cell.date) : '') + (cell.canUndo ? ' (cliquer pour annuler)' : '');
    else if (cell.state === 'late') title = label + ' — en retard de ' + st.lateDays + ' j (échéance ' + D.formatShort(st.due) + ')';
    else if (cell.state === 'todo') title = label + ' — à faire, échéance ' + D.formatShort(st.due);
    else title = label + ' — verrouillé';

    var clickable = cell.state === 'todo' || cell.state === 'late' || cell.canUndo;
    return h('span', { class: 'rv-cell-wrap' },
      h('button', {
        type: 'button', class: 'rv-cell ' + cell.state + (cell.canUndo ? ' undoable' : ''),
        role: 'checkbox', 'aria-checked': cell.state === 'done' ? 'true' : 'false',
        'aria-label': c.name + ' — ' + title, title: title,
        disabled: !clickable,
        onclick: function () {
          var today = day();
          B.store.update(function (dd) {
            if (cell.state === 'done') RL.undo(dd, c.id, today);
            else RL.validate(dd, c.id, today);
          });
          drawTree();
        }
      })
    );
  }

  /*
   * Titre de matière ou de chapitre : clic simple = replier / déplier,
   * double-clic = renommer.
   */
  function titleButton(item, kind, cls) {
    var clickTimer = null;
    var btn = h('button', {
      type: 'button', class: 'rv-title ' + cls, 'aria-expanded': collapsed[item.id] ? 'false' : 'true',
      title: 'Clic : replier / déplier · double-clic : renommer'
    }, icon(collapsed[item.id] ? 'caret-right' : 'caret-down', 'rv-caret'), h('span', { class: 'rv-title-text' }, item.name));
    btn.addEventListener('click', function () {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(function () {
        collapsed[item.id] = !collapsed[item.id];
        var block = btn.closest(kind === 'subject' ? '.rv-subject' : '.rv-chapter');
        block.classList.toggle('collapsed', !!collapsed[item.id]);
        btn.setAttribute('aria-expanded', collapsed[item.id] ? 'false' : 'true');
        btn.querySelector('.rv-caret').className = 'ph ph-' + (collapsed[item.id] ? 'caret-right' : 'caret-down') + ' rv-caret';
      }, 220);
    });
    btn.addEventListener('dblclick', function () {
      clearTimeout(clickTimer);
      startRename(btn.querySelector('.rv-title-text'), item, kind);
    });
    return btn;
  }

  /* Nom de concept : double-clic = renommer. */
  function nameLabel(item, kind, cls) {
    var span = h('span', { class: cls, title: 'Double-clic pour renommer', tabindex: '0' }, item.name);
    span.addEventListener('dblclick', function () { startRename(span, item, kind); });
    span.addEventListener('keydown', function (e) { if (e.key === 'F2') startRename(span, item, kind); });
    return span;
  }

  /* Renommer sur place : Entrée valide, Échap annule. */
  function startRename(span, item, kind) {
    var input = h('input', { class: 'input rv-rename', type: 'text', value: item.name, maxlength: '100', 'aria-label': 'Nouveau nom' });
    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      if (save && input.value.trim() !== item.name) {
        var r = B.store.update(function (d) { return RL.rename(d, kind, item.id, input.value); });
        drawTree();
        if (!r.ok) B.ui.setError(els.treeError, r.error);
      } else {
        drawTree();
      }
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      e.stopPropagation();
    });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    input.addEventListener('blur', function () { finish(true); });
    span.replaceWith(input);
    input.focus();
    input.select();
  }

  function freezeButton(kind, item) {
    var frozen = !!item.frozenAt;
    var label = frozen ? 'Dégeler' : 'Geler (masqué de "Aujourd\'hui")';
    return h('button', {
      type: 'button', class: 'icon-action rv-freeze' + (frozen ? ' on' : ''), title: label, 'aria-label': label + ' : ' + item.name,
      onclick: function () {
        B.store.update(function (d) { RL.toggleFreeze(d, kind, item.id, day()); });
        drawTree();
      }
    }, icon(frozen ? 'sun' : 'snowflake'));
  }

  function deleteButton(kind, item) {
    return h('button', {
      type: 'button', class: 'icon-action danger', title: 'Supprimer', 'aria-label': 'Supprimer « ' + item.name + ' »',
      onclick: function () {
        if (kind === 'concept') {
          B.store.update(function (d) { RL.deleteConcept(d, item.id); });
          drawTree();
          return;
        }
        var what = kind === 'subject' ? 'ainsi que tous ses chapitres et concepts' : 'ainsi que tous ses concepts';
        B.ui.confirm({
          title: kind === 'subject' ? 'Supprimer la matière' : 'Supprimer le chapitre',
          message: 'Supprimer « ' + item.name + ' » ' + what + ' ? Cette action est définitive et irréversible : ' +
            'la progression de révision sera perdue. Les sessions Focus passées sont conservées.',
          confirmLabel: 'Supprimer', danger: true
        }).then(function (ok) {
          if (!ok || !els) return;
          B.store.update(function (d) {
            if (kind === 'subject') RL.deleteSubject(d, item.id); else RL.deleteChapter(d, item.id);
          });
          drawTree();
        });
      }
    }, icon('x'));
  }

  function chapterForm(s) {
    var input = h('input', { class: 'input', type: 'text', maxlength: '100', placeholder: 'Nouveau chapitre…',
      'aria-label': 'Nouveau chapitre dans ' + s.name, 'data-focus-key': 'ch-' + s.id });
    var error = B.ui.formError();
    return addForm(input, 'Chapitre', error, function () {
      return B.store.update(function (d) { return RL.addChapter(d, s.id, input.value); });
    }, 'rv-add-chapter');
  }

  function conceptForm(ch) {
    var input = h('input', { class: 'input', type: 'text', maxlength: '100', placeholder: 'Nouveau concept…',
      'aria-label': 'Nouveau concept dans ' + ch.name, 'data-focus-key': 'co-' + ch.id });
    var error = B.ui.formError();
    return addForm(input, 'Concept', error, function () {
      return B.store.update(function (d) { return RL.addConcept(d, ch.id, input.value, day()); });
    }, 'rv-add-concept');
  }

  /* ---------- Fenêtre « Types de paliers » ---------- */

  function openStepTypes() {
    var list = h('div', { class: 'rv-types' });
    var error = B.ui.formError();
    var nameInput = h('input', { class: 'input', type: 'text', maxlength: '100', placeholder: 'Nom (ex. Intensif)', 'aria-label': 'Nom du type' });
    var stepsInput = h('input', { class: 'input', type: 'text', placeholder: '1,3,7,14', 'aria-label': 'Paliers du type' });

    function drawTypes() {
      B.ui.clear(list);
      var types = data().revisions.stepTypes;
      if (types.length === 0) list.appendChild(h('p', { class: 'muted small' }, 'Aucun type de palier pour le moment.'));
      types.forEach(function (t) {
        var n = h('input', { class: 'input', type: 'text', value: t.name, maxlength: '100', 'aria-label': 'Nom du type' });
        var st = h('input', { class: 'input', type: 'text', value: RL.formatSteps(t.steps), 'aria-label': 'Paliers de ' + t.name });
        function save() {
          if (n.value === t.name && st.value === RL.formatSteps(t.steps)) return;
          var r = B.store.update(function (d) { return RL.updateStepType(d, t.id, n.value, st.value); });
          B.ui.setError(error, r.ok ? '' : r.error);
          drawTypes();
        }
        [n, st].forEach(function (inp) {
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
          inp.addEventListener('change', save);
        });
        list.appendChild(h('div', { class: 'rv-type-row' }, n, st,
          h('button', {
            type: 'button', class: 'icon-action danger', title: 'Supprimer', 'aria-label': 'Supprimer le type ' + t.name,
            onclick: function () {
              B.store.update(function (d) { RL.deleteStepType(d, t.id); });
              drawTypes();
            }
          }, icon('x'))));
      });
    }

    var addFormEl = h('form', {
      class: 'rv-type-row rv-type-add', novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        var r = B.store.update(function (d) { return RL.addStepType(d, nameInput.value, stepsInput.value); });
        B.ui.setError(error, r.ok ? '' : r.error);
        if (r.ok) { nameInput.value = ''; stepsInput.value = ''; drawTypes(); nameInput.focus(); }
      }
    }, nameInput, stepsInput, h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus'), 'Ajouter'));

    var settings = data().revisions.settings;
    var defaultStepsInput = h('input', { class: 'input rv-steps-input', type: 'text', value: RL.formatSteps(settings.defaultSteps), 'aria-label': 'Paliers par défaut' });
    var stepsSaved = h('span', { class: 'saved-flash', role: 'status' });
    var stepsForm = h('form', {
      class: 'rv-setting', novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        var r = B.store.update(function (d) { return RL.setDefaultSteps(d, defaultStepsInput.value); });
        B.ui.setError(error, r.ok ? '' : r.error);
        if (r.ok) { defaultStepsInput.value = RL.formatSteps(r.steps); B.ui.flashSaved(stepsSaved); }
      }
    },
      h('label', { class: 'field-label' }, 'Paliers par défaut (jours, séparés par des virgules)'),
      h('div', { class: 'rv-inline' }, defaultStepsInput, h('button', { type: 'submit', class: 'btn' }, 'Enregistrer'), stepsSaved));
    var hourSelect = h('select', {
      class: 'input rv-hour', 'aria-label': 'Nouvelle journée à partir de',
      onchange: function () {
        B.store.update(function (d) { RL.setDayStartHour(d, hourSelect.value); });
        shownDay = day();
        if (B.app.refreshBadges) B.app.refreshBadges();
      }
    });
    for (var hr = 0; hr <= 11; hr++) {
      hourSelect.appendChild(h('option', { value: String(hr), selected: hr === settings.dayStartHour }, hr === 0 ? '0 h (minuit)' : hr + ' h'));
    }

    var dlg;
    var content = h('div', { class: 'rv-types-dialog' },
      h('h2', { class: 'modal-title' }, 'Rythmes de révision'),
      h('div', { class: 'rv-settings-row' },
        stepsForm,
        h('div', { class: 'rv-setting' }, h('label', { class: 'field-label' }, 'Nouvelle journée à partir de'), hourSelect)),
      B.ui.ornament(),
      h('h3', { class: 'section-label' }, 'Types de paliers'),
      h('p', { class: 'modal-text' }, 'Un type de palier peut être assigné à plusieurs matières depuis l\'en-tête de chacune. ' +
        'Une matière sans type assigné utilise le réglage « Paliers par défaut ».'),
      list,
      h('h3', { class: 'section-label rv-types-sub' }, 'Nouveau type'),
      addFormEl,
      error,
      h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn', onclick: function () { dlg.finish(); } }, 'Fermer'))
    );
    drawTypes();
    dlg = B.ui.openDialog(content, function () {
      if (!els) return;
      B.ui.clear(els.root);
      if (view === 'today') renderToday(); else renderTree();
    });
    dlg.classList.add('modal-wide');
    nameInput.focus();
  }

  /* ======================================================================
     Onglet AUJOURD'HUI
     ====================================================================== */

  function renderToday() {
    var today = day();
    var items = RL.todayList(data(), today);
    var late = items.filter(function (x) { return x.state.late; }).length;
    var dateText = D.formatLong(today);
    dateText = dateText.charAt(0).toLowerCase() + dateText.slice(1).replace(/ \d{4}$/, '');

    els.root.appendChild(h('div', { class: 'rv-today-head' },
      h('h2', { class: 'rv-today-title' }, 'Journée du ' + dateText),
      items.length ? h('p', { class: 'muted small' },
        B.ui.plural(items.length, 'révision', 'révisions'),
        late ? h('span', { class: 'rv-late-count' }, ' · ' + late + ' en retard') : null) : null
    ));

    if (items.length === 0) {
      els.root.appendChild(h('div', { class: 'card empty-state' },
        icon('confetti', 'empty-icon'),
        h('p', { class: 'empty-title' }, 'Rien à réviser aujourd\'hui. 🎉')
      ));
      return;
    }

    var list = h('div', { class: 'rv-today-list' });
    items.forEach(function (item) {
      var st = item.state;
      var style = RL.lateStyle(st.lateDays);
      var stepLabel = st.label + (st.inMaintenance ? ' · entretien' : '');
      list.appendChild(h('article', { class: 'rv-today-item' + (st.late ? ' late' : '') },
        h('button', {
          type: 'button', class: 'rv-check' + (st.late ? ' late' : ''), role: 'checkbox', 'aria-checked': 'false',
          'aria-label': 'Valider ' + stepLabel + ' pour ' + item.concept.name,
          title: 'Valider ' + stepLabel,
          onclick: function (e) {
            var row = e.currentTarget.closest('.rv-today-item');
            B.store.update(function (d) { RL.validate(d, item.concept.id, day()); });
            row.classList.add('leaving');
            setTimeout(function () { if (els) { B.ui.clear(els.root); renderToday(); } }, 260);
          }
        }),
        h('div', { class: 'rv-today-body' },
          h('div', { class: 'rv-today-line' },
            h('span', { class: 'rv-today-name', style: 'font-size:' + style.size + 'px;font-weight:' + style.weight }, item.concept.name),
            h('span', { class: 'rv-today-path' }, item.subject.name + ' / ' + item.chapter.name)
          ),
          h('p', { class: 'rv-today-meta num' },
            stepLabel + ' · échéance ' + D.formatShort(st.due),
            st.late ? ' · ' + st.lateDays + ' j de retard' : '')
        )
      ));
    });
    els.root.appendChild(list);
  }

  /* Compteur de la barre latérale : révisions dues (orange s'il y a du retard). */
  function badge() {
    var d = data();
    if (!d) return null;
    var items = RL.todayList(d, day());
    if (items.length === 0) return null;
    return { text: String(items.length), tone: items.some(function (x) { return x.state.late; }) ? 'warning' : '' };
  }

  function leave() {
    clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', checkNewDay);
    if (document.activeElement && els && els.root.contains(document.activeElement)) document.activeElement.blur();
    els = null;
  }

  B.modules = B.modules || {};
  B.modules.revisions = { render: render, leave: leave, badge: badge };
})(window.Bourgeon = window.Bourgeon || {});
