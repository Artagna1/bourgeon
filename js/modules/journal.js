/*
 * Bourgeon — module JOURNAL.
 *
 * Quelques lignes par jour, une seule entrée par date. On ne va pas dans le
 * futur, et changer de jour (ou de section) enregistre d'abord le texte en
 * cours : on ne perd jamais un brouillon.
 *
 * Données : data.journal.entries["AAAA-MM-JJ"] = { text, updatedAt }
 * Une entrée vide n'est pas conservée.
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon, D = B.dates;
  var PREVIEW_LENGTH = 240;

  /* ================= Règles (sans affichage, testées) ================= */

  function getText(data, date) {
    var e = data.journal.entries[date];
    return e ? e.text : '';
  }

  /*
   * Enregistre le texte d'une date (espaces de début et de fin retirés).
   * Réenregistrer remplace le texte ; un texte vide supprime l'entrée.
   * Renvoie true si quelque chose a changé.
   */
  function setText(data, date, raw) {
    var text = String(raw == null ? '' : raw).trim();
    if (text === getText(data, date)) return false;
    if (text === '') delete data.journal.entries[date];
    else data.journal.entries[date] = { text: text, updatedAt: new Date().toISOString() };
    return true;
  }

  /* Aperçu : les 240 premiers caractères, suivis de « … » si le texte est plus long. */
  function preview(text) {
    return text.length > PREVIEW_LENGTH ? text.slice(0, PREVIEW_LENGTH) + '…' : text;
  }

  /*
   * Jours précédents, du plus récent au plus ancien, sans le jour ouvert ni
   * les jours vides.
   */
  function history(data, openDate) {
    var entries = data.journal.entries;
    return Object.keys(entries)
      .filter(function (d) { return d !== openDate && entries[d].text; })
      .sort()
      .reverse()
      .map(function (d) { return { date: d, preview: preview(entries[d].text) }; });
  }

  /* On ne peut pas aller au-delà d'aujourd'hui. */
  function clampToToday(date, today) {
    return date > today ? today : date;
  }

  /* « Aujourd'hui », « Hier », « Il y a 5 jours » */
  function relativeLabel(date, today) {
    var n = D.diffDays(date, today);
    if (n === 0) return 'Aujourd\'hui';
    if (n === 1) return 'Hier';
    return 'Il y a ' + n + ' jours';
  }

  /* ================= Affichage ================= */

  var current = null;   // date ouverte
  var els = null;       // éléments de l'écran

  /* Enregistre sans rien afficher (changement de jour, de section, fermeture). */
  function saveSilently() {
    if (!els || els.text.value === els.loaded) return;   // rien de modifié à l'écran
    B.store.update(function (data) { setText(data, current, els.text.value); });
    els.loaded = els.text.value;
  }

  function goTo(date) {
    saveSilently();
    current = clampToToday(date, D.today());
    draw();
    els.text.focus();
  }

  function save() {
    B.store.update(function (data) { setText(data, current, els.text.value); });
    els.text.value = getText(B.store.get(), current);
    els.loaded = els.text.value;
    B.ui.flashSaved(els.saved);
  }

  function render(container, tabId, ctx) {
    current = D.today();

    els = {
      prev: h('button', {
        type: 'button', class: 'btn btn-icon', 'aria-label': 'Jour précédent', title: 'Jour précédent',
        onclick: function () { goTo(D.addDays(current, -1)); }
      }, icon('caret-left')),
      next: h('button', {
        type: 'button', class: 'btn btn-icon', 'aria-label': 'Jour suivant', title: 'Jour suivant',
        onclick: function () { goTo(D.addDays(current, 1)); }
      }, icon('caret-right')),
      todayBtn: h('button', {
        type: 'button', class: 'btn',
        onclick: function () { goTo(D.today()); }
      }, 'Aujourd\'hui'),

      day: h('span', { class: 'journal-day num' }),
      weekday: h('span', { class: 'journal-weekday' }),
      monthYear: h('span', { class: 'journal-month' }),
      relative: h('span', { class: 'journal-relative' }),
      text: h('textarea', {
        class: 'journal-text', rows: '8',
        placeholder: 'Quelques lignes sur ta journée…',
        'aria-label': 'Texte du jour'
      }),
      saved: h('span', { class: 'saved-flash', role: 'status' }),
      history: h('div', { class: 'journal-history' })
    };

    ctx.actions.appendChild(els.prev);
    ctx.actions.appendChild(els.next);
    ctx.actions.appendChild(els.todayBtn);

    container.appendChild(h('div', { class: 'journal' },
      h('section', { class: 'card journal-editor' },
        h('div', { class: 'journal-head' },
          els.day,
          h('div', { class: 'journal-head-text' }, els.weekday, els.monthYear),
          els.relative
        ),
        h('div', { class: 'journal-rule', 'aria-hidden': 'true' }),
        els.text,
        h('div', { class: 'journal-foot' },
          els.saved,
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, 'Enregistrer')
        )
      ),
      h('section', { class: 'journal-past' },
        h('h2', { class: 'section-label' }, 'Jours précédents'),
        els.history
      )
    ));

    draw();
  }

  /* Met l'écran à jour pour la date ouverte. */
  function draw() {
    var today = D.today();
    var d = D.parse(current);

    els.day.textContent = d.getDate();
    els.weekday.textContent = D.JOURS[D.weekdayIndex(current)];
    els.monthYear.textContent = D.MOIS[d.getMonth()] + ' ' + d.getFullYear();
    els.relative.textContent = relativeLabel(current, today);
    els.text.setAttribute('aria-label', 'Texte du ' + D.formatLong(current));
    els.text.value = getText(B.store.get(), current);
    els.loaded = els.text.value;

    els.next.disabled = current >= today;
    els.todayBtn.disabled = current === today;

    els.saved.classList.remove('visible');
    drawHistory();
  }

  function drawHistory() {
    var items = history(B.store.get(), current);
    B.ui.clear(els.history);
    if (items.length === 0) {
      els.history.appendChild(h('p', { class: 'muted journal-empty' },
        'Les jours précédents apparaîtront ici.'));
      return;
    }
    items.forEach(function (item) {
      els.history.appendChild(h('article', { class: 'journal-entry' },
        h('div', { class: 'journal-entry-body' },
          h('h3', { class: 'journal-entry-date' }, D.formatLong(item.date)),
          h('p', { class: 'journal-entry-preview' }, item.preview)
        ),
        h('button', {
          type: 'button', class: 'btn btn-ghost',
          'aria-label': 'Ouvrir le ' + D.formatLong(item.date),
          onclick: function () { goTo(item.date); window.scrollTo(0, 0); }
        }, 'Ouvrir', icon('caret-right'))
      ));
    });
  }

  function leave() {
    saveSilently();
    els = null;
  }

  B.modules = B.modules || {};
  B.modules.journal = {
    render: render,
    leave: leave,
    flush: saveSilently,
    // Règles exposées pour les tests
    logic: { getText: getText, setText: setText, preview: preview, history: history, clampToToday: clampToToday, relativeLabel: relativeLabel }
  };
})(window.Bourgeon = window.Bourgeon || {});
