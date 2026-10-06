/*
 * Bourgeon — coquille de l'application : barre latérale, navigation,
 * sous-onglets, mode clair / sombre, gestion des erreurs.
 *
 * Chaque module s'enregistre dans B.modules sous son identifiant :
 *   B.modules.journal = {
 *     render: function (container, tabId, ctx) { … },  // dessine la section
 *                                  // ctx.actions : zone à droite du titre
 *     leave:  function () { … },                  // (facultatif) avant de quitter
 *     flush:  function () { … },                  // (facultatif) enregistre les
 *                                  // brouillons quand la page est fermée ou masquée
 *     badge:  function () { … },                  // (facultatif) compteur dans la
 *                                  // barre latérale : { text, tone } ou null
 *     init:   function () { … }                   // (facultatif) au démarrage
 *   };
 * Un module absent affiche « en préparation ».
 */
(function (B) {
  'use strict';

  var h = B.ui.h;
  var icon = B.ui.icon;
  B.modules = B.modules || {};

  /*
   * Les 7 sections, dans l'ordre de la barre latérale.
   * icon = nom d'icône Phosphor (https://phosphoricons.com), kicker = sous-titre
   * au-dessus du titre de la page, navLabel = nom court dans la barre
   * latérale, step = étape du plan.
   */
  var SECTIONS = [
    { id: 'journal', label: 'Journal', icon: 'feather', kicker: 'Chronique', step: 2 },
    { id: 'habits', label: 'Habitudes', icon: 'plant', kicker: 'Suivi', step: 4,
      tabs: [{ id: 'month', label: 'Mois' }, { id: 'global', label: 'Global' }],
      mobileTabs: [{ id: 'today', label: 'Aujourd\'hui' }, { id: 'month', label: 'Mois' }, { id: 'global', label: 'Global' }] },
    { id: 'focus', label: 'Focus', icon: 'timer', kicker: 'Concentration', step: 6,
      tabs: [{ id: 'session', label: 'Session' }, { id: 'history', label: 'Historique' }],
      mobileCornerTabs: true },   // mobile : on passe d'un onglet à l'autre par le bouton du coin
    { id: 'goals', label: 'Objectifs', icon: 'target', kicker: 'Cap', step: 3 },
    { id: 'eisenhower', label: 'Eisenhower', navLabel: 'Matrice', icon: 'squares-four', kicker: 'Priorités', step: 7 },
    { id: 'revisions', label: 'Révisions', icon: 'brain', kicker: 'Mémoire', step: 5,
      tabs: [{ id: 'tree', label: 'Arborescence' }, { id: 'today', label: 'Aujourd\'hui' }],
      mobileTabs: [{ id: 'today', label: 'Aujourd\'hui' }, { id: 'tree', label: 'Arborescence' }] },
    { id: 'sport', label: 'Sport', icon: 'barbell', kicker: 'Entraînement', step: 8,
      tabs: [{ id: 'planning', label: 'Planning' }, { id: 'vma', label: 'Course (VMA)' }, { id: 'records', label: 'Records' }],
      mobileTabs: [{ id: 'planning', label: 'Planning' }, { id: 'vma', label: 'Course' }, { id: 'records', label: 'Records' }] }
  ];

  var THEME_KEY = 'bourgeon.theme';

  /*
   * Mobile (écran étroit) : barre d'onglets en bas, Focus en rond au
   * centre, « Plus » pour Objectifs, Eisenhower et Sport. Certains modules
   * proposent alors une mise en page et des sous-onglets propres au mobile.
   */
  var MQ = window.matchMedia ? window.matchMedia('(max-width: 760px)') : { matches: false };
  function isMobile() { return !!MQ.matches; }
  var TAB_MAIN = ['journal', 'habits', 'focus', 'revisions'];
  var TAB_MORE = ['goals', 'eisenhower', 'sport'];

  function tabsOf(section) { return (isMobile() && section.mobileTabs) || section.tabs; }

  var state = {
    section: null,   // identifiant de la section affichée
    tabs: {}         // dernier sous-onglet choisi par section
  };
  var els = {};      // éléments fixes de la coquille

  function findSection(id) {
    return SECTIONS.filter(function (s) { return s.id === id; })[0];
  }

  /* --- Thème --- */

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* non bloquant */ }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#080b1a' : '#f1eee8');
    B.ui.clear(els.themeBtn);
    B.ui.append(els.themeBtn, theme === 'dark'
      ? [icon('sun'), h('span', { class: 'theme-label' }, 'Clair')]
      : [icon('moon'), h('span', { class: 'theme-label' }, 'Sombre')]);
    els.themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre');
    els.themeBtn.title = els.themeBtn.getAttribute('aria-label');
  }

  /* --- Construction de la coquille --- */

  function buildShell(root) {
    els.nav = h('nav', { class: 'nav', 'aria-label': 'Sections' },
      SECTIONS.map(function (s) {
        return h('button', {
          type: 'button', class: 'nav-item', 'data-section': s.id,
          onclick: function () { showSection(s.id); }
        }, icon(s.icon, 'nav-icon'), h('span', { class: 'nav-label' }, s.navLabel || s.label),
          h('span', { class: 'count', hidden: true }));
      })
    );

    els.themeBtn = h('button', {
      type: 'button', class: 'theme-toggle',
      onclick: function () { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }
    });

    els.kicker = h('span', { class: 'page-kicker' });
    els.title = h('h1', { class: 'page-title' });
    els.tabs = h('div', { class: 'page-tabs' });
    els.actions = h('div', { class: 'page-actions' });
    els.corner = h('div', { class: 'page-corner' });
    els.content = h('div', { class: 'page-content' });

    root.appendChild(h('div', { class: 'app' },
      h('aside', { class: 'sidebar' },
        brandBlock(),
        els.nav,
        h('div', { class: 'side-foot' },
          els.themeBtn,
          els.dataBtn = h('button', { type: 'button', class: 'theme-toggle data-btn', onclick: function () { B.backup.open(); } },
            els.syncIcon = icon('database'), els.syncLabel = h('span', { class: 'theme-label' }, 'Données')))
      ),
      h('main', { class: 'main' },
        h('header', { class: 'page-header' }, h('div', { class: 'page-titles' }, els.kicker, els.title), els.corner, els.tabs, els.actions),
        els.content
      ),
      buildTabbar()
    ));

    applyTheme(currentTheme());
  }

  /* --- Barre d'onglets du mobile --- */

  function tabItem(id, extraClass) {
    var s = findSection(id);
    return h('button', {
      type: 'button', class: 'tab-item' + (extraClass ? ' ' + extraClass : ''), 'data-section': id,
      onclick: function () { showSection(id); }
    },
      id === 'focus' ? h('span', { class: 'tab-gem' }, icon(s.icon, 'tab-icon', 'ph-bold')) : icon(s.icon, 'tab-icon'),
      h('span', { class: 'tab-label' }, s.label),
      h('span', { class: 'count tab-count', hidden: true }));
  }

  function buildTabbar() {
    els.moreBtn = h('button', { type: 'button', class: 'tab-item tab-more', onclick: openMore, 'aria-haspopup': 'dialog' });
    els.tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Sections' },
      tabItem('journal'), tabItem('habits'), tabItem('focus', 'tab-focus'), tabItem('revisions'), els.moreBtn);
    drawMoreBtn();
    return els.tabbar;
  }

  /* Le dernier emplacement prend l'icône du module ouvert parmi l'accueil, Objectifs, Eisenhower et Sport. */
  function drawMoreBtn() {
    var current = TAB_MORE.indexOf(state.section) >= 0 ? findSection(state.section) : null;
    B.ui.clear(els.moreBtn);
    B.ui.append(els.moreBtn, current
      ? [icon(current.icon, 'tab-icon', 'ph-fill'), h('span', { class: 'tab-label' }, current.label)]
      : [icon('dots-three-outline', 'tab-icon'), h('span', { class: 'tab-label' }, 'Plus')]);
    els.moreBtn.classList.toggle('active', !!current);
  }

  /* Feuille « Plus » : les autres modules, les données et le thème. */
  function openMore() {
    var dlg;
    function go(id) { dlg.finish(''); showSection(id); }
    var content = h('div', { class: 'more-sheet' },
      h('h2', { class: 'section-label' }, 'Plus'),
      TAB_MORE.map(function (id) {
        var s = findSection(id);
        return h('button', { type: 'button', class: 'more-item' + (state.section === id ? ' active' : ''), onclick: function () { go(id); } },
          icon(s.icon, 'more-icon'), h('span', null, s.label), h('span', { class: 'more-kicker' }, s.kicker));
      }),
      h('hr', { class: 'more-sep' }),
      h('button', { type: 'button', class: 'more-item', onclick: function () { dlg.finish(''); B.backup.open(); } },
        icon('database', 'more-icon'), h('span', null, 'Données et synchronisation')),
      h('button', { type: 'button', class: 'more-item', onclick: function () { dlg.finish(''); applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); } },
        icon(currentTheme() === 'dark' ? 'sun' : 'moon', 'more-icon'), h('span', null, currentTheme() === 'dark' ? 'Mode clair' : 'Mode sombre'))
    );
    dlg = B.ui.openDialog(content);
    dlg.classList.add('sheet');
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.finish(''); });   // toucher le fond ferme
  }

  /* Marque : une pousse dans un carré arrondi. */
  function brandBlock() {
    return h('div', { class: 'brand', title: 'Bourgeon' },
      h('span', { class: 'brand-mark' }, icon('plant', null, 'ph-fill')),
      h('span', { class: 'visually-hidden' }, 'Bourgeon'));
  }

  /* --- Navigation --- */

  function showSection(id, tabId) {
    var section = findSection(id);
    var previous = state.section && B.modules[state.section];
    if (previous && previous.leave) previous.leave();

    state.section = id;
    var tabs = tabsOf(section);
    if (tabs) {
      var wanted = tabId || state.tabs[id];
      if (!wanted || !tabs.some(function (t) { return t.id === wanted; })) wanted = tabs[0].id;
      state.tabs[id] = wanted;
    }

    // Barre d'onglets du mobile
    Array.prototype.forEach.call(els.tabbar.querySelectorAll('.tab-item[data-section]'), function (btn) {
      var active = btn.getAttribute('data-section') === id;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    drawMoreBtn();

    // Entrée active dans la barre latérale
    Array.prototype.forEach.call(els.nav.children, function (btn) {
      var active = btn.getAttribute('data-section') === id;
      btn.classList.toggle('active', active);
      // Icône pleine pour l'entrée active, contour pour les autres
      var i = btn.querySelector('.nav-icon');
      i.classList.toggle('ph-fill', active);
      i.classList.toggle('ph', !active);
      if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });

    // En-tête : sous-titre, titre et sous-onglets
    els.kicker.textContent = section.kicker || '';
    els.title.textContent = section.label;
    els.content.setAttribute('data-section', id);
    B.ui.clear(els.tabs);
    if (tabs && !(isMobile() && section.mobileCornerTabs)) {
      els.tabs.appendChild(B.ui.segmented(tabs, state.tabs[id], function (t) {
        showSection(id, t);
      }, 'Sous-onglets ' + section.label));
    }

    // Contenu (redessiné à chaque visite pour être à jour).
    // Le module peut placer des boutons à droite du titre dans ctx.actions.
    B.ui.clear(els.content);
    B.ui.clear(els.actions);
    B.ui.clear(els.corner);
    var mod = B.modules[id];
    if (mod && mod.render) {
      mod.render(els.content, state.tabs[id], { actions: els.actions, corner: els.corner, mobile: isMobile() });
    } else {
      renderPlaceholder(els.content, section);
    }
    els.content.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* Compteurs de la barre latérale (ex. révisions dues), recalculés après chaque modification. */
  function refreshBadges() {
    if (!els.nav) return;
    Array.prototype.forEach.call(els.tabbar.querySelectorAll('.tab-item[data-section]'), function (btn) {
      var id = btn.getAttribute('data-section');
      var mod = B.modules[id];
      var b = mod && mod.badge ? mod.badge() : null;
      if (id === 'focus') {
        btn.querySelector('.tab-label').textContent = b ? b.text : 'Focus';
        btn.classList.toggle('live', !!b);
        btn.classList.toggle('paused', !!(b && /paused/.test(b.tone)));
        return;
      }
      var count = btn.querySelector('.tab-count');
      count.hidden = !b;
      if (b) { count.textContent = b.text; count.className = 'count tab-count' + (b.tone ? ' ' + b.tone : ''); }
    });
    Array.prototype.forEach.call(els.nav.children, function (btn) {
      var mod = B.modules[btn.getAttribute('data-section')];
      var count = btn.querySelector('.count');
      var b = mod && mod.badge ? mod.badge() : null;
      count.hidden = !b;
      if (b) {
        count.textContent = b.text;
        count.className = 'count' + (b.tone ? ' ' + b.tone : '');
        count.title = b.title || '';
      }
    });
  }

  function renderPlaceholder(container, section) {
    container.appendChild(h('div', { class: 'card empty-state' },
      icon(section.icon, 'empty-icon'),
      h('p', { class: 'empty-title' }, 'Module en préparation'),
      h('p', { class: 'muted' }, 'Le module ' + section.label + ' arrive à l\'étape ' + section.step + ' du plan.')
    ));
  }

  /* --- Données illisibles au démarrage --- */

  function renderFatal(root, err) {
    var messages = {
      unavailable: 'Le navigateur empêche Bourgeon d\'enregistrer des données (navigation privée ' +
        'stricte ou stockage bloqué dans les réglages). Autorisez le stockage pour ce site puis rechargez la page.',
      corrupt: 'Les données enregistrées sont illisibles. Par sécurité, Bourgeon ne démarre pas pour ' +
        'ne pas les écraser. Vous pouvez les télécharger telles quelles pour tenter de les récupérer.',
      tooNew: 'Ces données ont été créées par une version plus récente de Bourgeon. Utilisez la ' +
        'dernière version de l\'application pour les ouvrir.'
    };
    var download = err.raw ? h('button', {
      type: 'button', class: 'btn btn-primary',
      onclick: function () {
        var blob = new Blob([err.raw], { type: 'application/json' });
        var a = h('a', { href: URL.createObjectURL(blob), download: 'bourgeon-donnees-brutes.json' });
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }, 'Télécharger les données brutes') : null;

    root.appendChild(h('div', { class: 'fatal' },
      h('div', { class: 'card' },
        h('h1', { class: 'page-title' }, 'Bourgeon ne peut pas démarrer'),
        h('p', null, messages[err.code] || err.message),
        download
      )
    ));
  }

  /* --- Démarrage --- */

  function start() {
    var root = document.getElementById('app');

    try {
      B.store.load();
    } catch (err) {
      if (err instanceof B.store.StoreError) { renderFatal(root, err); return; }
      throw err;
    }

    // Toute erreur inattendue est montrée à l'utilisateur plutôt qu'ignorée.
    window.addEventListener('error', function (e) { B.ui.showError(e.error || e.message); });
    window.addEventListener('unhandledrejection', function (e) { B.ui.showError(e.reason); });

    // Fermeture de l'onglet ou passage en arrière-plan : on enregistre les
    // brouillons du module affiché pour ne rien perdre.
    window.addEventListener('pagehide', flushCurrent);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushCurrent();
    });

    buildShell(root);
    // Passage écran large ↔ écran étroit : on redessine avec la bonne mise en page.
    if (MQ.addEventListener) MQ.addEventListener('change', function () { if (state.section) showSection(state.section); });
    Object.keys(B.modules).forEach(function (id) { if (B.modules[id].init) B.modules[id].init(); });
    showSection('journal');

    refreshBadges();
    B.store.onChange(refreshBadges);
    setInterval(refreshBadges, 60000);   // passage à un nouveau jour

    // Synchronisation entre appareils (si configurée dans js/config.js)
    B.sync.onStatus(drawSyncStatus);
    B.sync.init();
    drawSyncStatus();

    // Appli installable et utilisable hors ligne (seulement une fois en ligne,
    // pas en ouvrant le fichier index.html directement)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      // Une nouvelle version vient de prendre la main : on recharge une fois
      // pour l'afficher (seulement s'il y avait déjà une version installée).
      var hadController = !!navigator.serviceWorker.controller;
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController || reloaded) return;
        reloaded = true;
        flushCurrent();
        location.reload();
      });
      navigator.serviceWorker.register('sw.js').catch(function () { /* non bloquant */ });
    }
  }

  function flushCurrent() {
    var mod = state.section && B.modules[state.section];
    if (mod && mod.flush) mod.flush();
  }

  /* Redessine l'écran affiché (ex. après réception de données d'un autre appareil). */
  function refresh() {
    if (!state.section) return;
    var dialogsOpen = document.querySelector('dialog[open]');
    Object.keys(B.modules).forEach(function (id) { if (B.modules[id].init) B.modules[id].init(); });
    if (!dialogsOpen) showSection(state.section);
    refreshBadges();
  }

  /* État de la synchronisation sur le bouton du bas de la barre latérale. */
  var SYNC_LOOK = {
    ok: { icon: 'cloud-check', label: 'Synchronisé', tone: 'ok' },
    pending: { icon: 'cloud-arrow-up', label: 'Envoi en attente…', tone: 'pending' },
    syncing: { icon: 'cloud-arrow-up', label: 'Synchronisation…', tone: 'pending' },
    offline: { icon: 'cloud-slash', label: 'Hors ligne', tone: 'warn' },
    error: { icon: 'cloud-warning', label: 'Erreur de synchro', tone: 'warn' },
    signedout: { icon: 'cloud', label: 'Non connecté', tone: 'muted' }
  };
  function drawSyncStatus() {
    if (!els.dataBtn) return;
    var st = B.sync.status();
    var look = SYNC_LOOK[st.status];
    var fresh = icon(look ? look.icon : 'database');
    els.syncIcon.replaceWith(fresh);
    els.syncIcon = fresh;
    els.syncLabel.textContent = look ? 'Sync' : 'Données';
    els.dataBtn.className = 'theme-toggle data-btn' + (look ? ' sync-' + look.tone : '');
    els.dataBtn.title = look ? 'Données et synchronisation — ' + look.label + (st.detail ? ' — ' + st.detail : '') : 'Données (sauvegarde, import)';
    els.dataBtn.setAttribute('aria-label', els.dataBtn.title);
  }

  /*
   * Ferme la section affichée (son module enregistre ses brouillons) et
   * n'en affiche plus aucune. Utilisé avant de remplacer toutes les données
   * (import) : sinon un brouillon resté à l'écran serait réécrit par-dessus
   * les données importées au moment du rechargement de la page.
   */
  function closeSection() {
    var mod = state.section && B.modules[state.section];
    if (mod && mod.leave) mod.leave();
    state.section = null;
  }

  B.app = {
    start: start, showSection: showSection, closeSection: closeSection, refresh: refresh, isMobile: isMobile,
    flushCurrent: flushCurrent, refreshBadges: refreshBadges, SECTIONS: SECTIONS
  };

  document.addEventListener('DOMContentLoaded', start);
})(window.Bourgeon = window.Bourgeon || {});
