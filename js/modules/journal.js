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
    drawStatus();
    B.ui.flashSaved(els.saved);
    drawHistory();
    if (els.mobile) drawWeek();   // losange « jour écrit » à jour
  }

  var JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  var INITIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  /* « Enregistré à 21:14 » (ou « le 03/03 à 21:14 » pour un autre jour). */
  function savedLabel(date) {
    var e = B.store.get().journal.entries[date];
    if (!e || !e.updatedAt) return '';
    var t = new Date(e.updatedAt);
    if (isNaN(t)) return 'Enregistré';
    var hm = D.pad(t.getHours()) + ':' + D.pad(t.getMinutes());
    return D.toStr(t) === D.today() ? 'Enregistré à ' + hm : 'Enregistré le ' + D.formatShort(D.toStr(t)).slice(0, 5) + ' à ' + hm;
  }

  function render(container, tabId, ctx) {
    current = D.today();

    els = {
      prev: h('button', {
        type: 'button', class: 'btn btn-bare', 'aria-label': 'Jour précédent', title: 'Jour précédent',
        onclick: function () { goTo(D.addDays(current, -1)); }
      }, icon('caret-left', null, 'ph-bold')),
      next: h('button', {
        type: 'button', class: 'btn btn-bare', 'aria-label': 'Jour suivant', title: 'Jour suivant',
        onclick: function () { goTo(D.addDays(current, 1)); }
      }, icon('caret-right', null, 'ph-bold')),
      todayBtn: h('button', {
        type: 'button', class: 'btn',
        onclick: function () { goTo(D.today()); }
      }, 'Aujourd\'hui'),

      day: h('span', { class: 'journal-day num' }),
      relative: h('span', { class: 'journal-relative' }),
      weekday: h('span', { class: 'journal-weekday' }),
      monthYear: h('span', { class: 'journal-month' }),
      text: h('textarea', {
        class: 'journal-text', rows: '8',
        placeholder: 'Quelques lignes sur ta journée…',
        'aria-label': 'Texte du jour'
      }),
      status: h('span', { class: 'journal-status' }),
      saved: h('span', { class: 'saved-flash', role: 'status' }),
      history: h('div', { class: 'journal-history' })
    };

    if (ctx.mobile) { renderMobile(container); draw(); return; }

    ctx.actions.appendChild(els.prev);
    ctx.actions.appendChild(els.next);
    ctx.actions.appendChild(els.todayBtn);

    container.appendChild(h('div', { class: 'journal' },
      h('section', { class: 'card journal-editor' },
        h('div', { class: 'journal-head' },
          els.day,
          h('div', { class: 'journal-head-text' }, els.relative, els.weekday, els.monthYear)
        ),
        B.ui.ornament(),
        els.text,
        h('div', { class: 'journal-foot' },
          h('span', { class: 'journal-saved' }, els.status, els.saved),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, icon('floppy-disk', null, 'ph-bold'), 'Enregistrer')
        )
      ),
      h('section', { class: 'journal-past' },
        h('h2', { class: 'section-label' }, 'Jours passés'),
        els.history
      )
    ));

    draw();
  }

  /*
   * Mobile : bandeau de la semaine (le jour ouvert en évidence, un point sous
   * les jours écrits), puis la carte du jour avec « Enregistrer » qui devient
   * « ✓ Enregistré ».
   */
  function renderMobile(container) {
    els.mobile = true;
    els.week = h('div', { class: 'week-strip', role: 'group', 'aria-label': 'Semaine' });
    els.mTitle = h('h2', { class: 'journal-m-title' });
    els.mSave = h('button', { type: 'button', class: 'journal-m-save', onclick: save });
    els.text.addEventListener('input', drawMobileSave);
    container.appendChild(h('div', { class: 'journal mobile' },
      els.week,
      h('section', { class: 'card journal-editor' },
        h('div', { class: 'journal-m-head' }, els.mTitle, els.mSave),
        B.ui.ornament(),
        els.text),
      h('section', { class: 'journal-past' }, els.history)
    ));
  }

  function drawWeek() {
    var today = D.today();
    var monday = D.startOfWeek(current);
    var entries = B.store.get().journal.entries;
    B.ui.clear(els.week);
    els.week.appendChild(h('button', {
      type: 'button', class: 'week-nav', 'aria-label': 'Semaine précédente',
      onclick: function () { goTo(D.addDays(current, -7)); }
    }, icon('caret-left', null, 'ph-bold')));
    for (var i = 0; i < 7; i++) {
      (function (date, i) {
        var future = date > today;
        els.week.appendChild(h('button', {
          type: 'button',
          class: 'week-day' + (date === current ? ' selected' : '') + (date === today ? ' today' : '') + (entries[date] && entries[date].text ? ' has' : ''),
          disabled: future, 'aria-label': D.formatLong(date), 'aria-pressed': date === current ? 'true' : 'false',
          onclick: function () { goTo(date); }
        }, h('span', { class: 'week-letter' }, INITIALES[i]), h('span', { class: 'week-num num' }, String(D.parse(date).getDate()))));
      })(D.addDays(monday, i), i);
    }
    els.week.appendChild(h('button', {
      type: 'button', class: 'week-nav', 'aria-label': 'Semaine suivante', disabled: D.addDays(monday, 7) > today,
      onclick: function () { goTo(D.addDays(current, 7)); }
    }, icon('caret-right', null, 'ph-bold')));
  }

  function drawMobileSave() {
    if (!els || !els.mSave) return;
    var dirty = els.text.value !== els.loaded;
    var saved = !!B.store.get().journal.entries[current];
    B.ui.clear(els.mSave);
    els.mSave.className = 'journal-m-save' + (dirty ? ' dirty' : '');
    els.mSave.disabled = !dirty;
    if (dirty) B.ui.append(els.mSave, [icon('floppy-disk', null, 'ph-bold'), 'Enregistrer']);
    else if (saved) B.ui.append(els.mSave, [icon('check', null, 'ph-bold'), 'Enregistré']);
  }

  function drawStatus() {
    if (els.mobile) { drawMobileSave(); return; }
    var label = savedLabel(current);
    B.ui.clear(els.status);
    if (label) B.ui.append(els.status, [icon('check', null, 'ph-bold'), label]);
  }

  /* Met l'écran à jour pour la date ouverte. */
  function draw() {
    var today = D.today();
    var d = D.parse(current);
    var jour = D.JOURS[D.weekdayIndex(current)];

    if (els.mobile) {
      els.mTitle.textContent = jour.charAt(0).toUpperCase() + jour.slice(1) + ' ' + d.getDate() + ' ' + D.MOIS_COURTS[d.getMonth()];
      drawWeek();
    }
    els.day.textContent = d.getDate();
    els.relative.textContent = relativeLabel(current, today);
    els.weekday.textContent = jour.charAt(0).toUpperCase() + jour.slice(1);
    els.monthYear.textContent = D.MOIS[d.getMonth()] + ' ' + d.getFullYear();
    els.text.setAttribute('aria-label', 'Texte du ' + D.formatLong(current));
    els.text.value = getText(B.store.get(), current);
    els.loaded = els.text.value;

    els.next.disabled = current >= today;
    els.todayBtn.disabled = current === today;

    els.saved.classList.remove('visible');
    drawStatus();
    drawHistory();
  }

  function drawHistory() {
    var items = history(B.store.get(), current);
    var today = D.today();
    B.ui.clear(els.history);
    if (items.length === 0) {
      els.history.appendChild(h('p', { class: 'muted journal-empty' },
        'Les jours précédents apparaîtront ici.'));
      return;
    }
    items.forEach(function (item) {
      var d = D.parse(item.date);
      var sameYear = item.date.slice(0, 4) === today.slice(0, 4);
      els.history.appendChild(h('article', { class: 'journal-entry', title: D.formatLong(item.date) },
        h('div', { class: 'journal-entry-date' },
          h('span', { class: 'journal-entry-num num' }, String(d.getDate())),
          h('span', { class: 'journal-entry-wd' }, JOURS_COURTS[D.weekdayIndex(item.date)]),
          h('span', { class: 'journal-entry-month' }, D.MOIS_COURTS[d.getMonth()] + (sameYear ? '' : ' ' + d.getFullYear()))
        ),
        h('div', { class: 'journal-entry-body' },
          h('div', { class: 'journal-entry-top' },
            h('span', { class: 'journal-entry-rel' }, relativeLabel(item.date, today)),
            h('button', {
              type: 'button', class: 'link-btn',
              'aria-label': 'Ouvrir le ' + D.formatLong(item.date),
              onclick: function () { goTo(item.date); window.scrollTo(0, 0); }
            }, 'Ouvrir')
          ),
          h('p', { class: 'journal-entry-preview' }, item.preview)
        )
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
