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
   * icon = nom d'icône Phosphor (https://phosphoricons.com), step = étape du plan.
   */
  var SECTIONS = [
    { id: 'journal', label: 'Journal', icon: 'notebook', step: 2 },
    { id: 'habits', label: 'Habitudes', icon: 'check-square', step: 4,
      tabs: [{ id: 'month', label: 'Mois' }, { id: 'global', label: 'Global' }] },
    { id: 'focus', label: 'Focus', icon: 'timer', step: 6,
      tabs: [{ id: 'session', label: 'Session' }, { id: 'history', label: 'Historique' }] },
    { id: 'goals', label: 'Objectifs', icon: 'target', step: 3 },
    { id: 'eisenhower', label: 'Eisenhower', icon: 'compass', step: 7 },
    { id: 'revisions', label: 'Révisions', icon: 'brain', step: 5,
      tabs: [{ id: 'tree', label: 'Arborescence' }, { id: 'today', label: 'Aujourd\'hui' }] },
    { id: 'sport', label: 'Sport', icon: 'sneaker-move', step: 8,
      tabs: [{ id: 'planning', label: 'Planning' }, { id: 'vma', label: 'Course (VMA)' }] }
  ];

  var THEME_KEY = 'bourgeon.theme';

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
    B.ui.clear(els.themeBtn);
    B.ui.append(els.themeBtn, theme === 'dark'
      ? [icon('sun'), h('span', { class: 'theme-label' }, 'Mode clair')]
      : [icon('moon'), h('span', { class: 'theme-label' }, 'Mode sombre')]);
    els.themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre');
  }

  /* --- Construction de la coquille --- */

  function buildShell(root) {
    els.nav = h('nav', { class: 'nav', 'aria-label': 'Sections' },
      SECTIONS.map(function (s) {
        return h('button', {
          type: 'button', class: 'nav-item', 'data-section': s.id,
          onclick: function () { showSection(s.id); }
        }, icon(s.icon, 'nav-icon'), h('span', { class: 'nav-label' }, s.label),
          h('span', { class: 'count', hidden: true }));
      })
    );

    els.themeBtn = h('button', {
      type: 'button', class: 'theme-toggle',
      onclick: function () { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }
    });

    els.title = h('h1', { class: 'page-title' });
    els.tabs = h('div', { class: 'page-tabs' });
    els.actions = h('div', { class: 'page-actions' });
    els.content = h('div', { class: 'page-content' });

    root.appendChild(h('div', { class: 'app' },
      h('aside', { class: 'sidebar' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-dot', 'aria-hidden': 'true' }), 'Bourgeon'),
        els.nav,
        h('button', { type: 'button', class: 'theme-toggle data-btn', onclick: function () { B.backup.open(); } },
          icon('database'), h('span', { class: 'theme-label' }, 'Données'),
          els.syncDot = h('span', { class: 'sync-dot', hidden: true, role: 'status' })),
        els.themeBtn
      ),
      h('main', { class: 'main' },
        h('header', { class: 'page-header' }, els.title, els.tabs, els.actions),
        els.content
      )
    ));

    applyTheme(currentTheme());
  }

  /* --- Navigation --- */

  function showSection(id, tabId) {
    var section = findSection(id);
    var previous = state.section && B.modules[state.section];
    if (previous && previous.leave) previous.leave();

    state.section = id;
    if (section.tabs) {
      state.tabs[id] = tabId || state.tabs[id] || section.tabs[0].id;
    }

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

    // En-tête : titre + sous-onglets
    els.title.textContent = section.label;
    B.ui.clear(els.tabs);
    if (section.tabs) {
      els.tabs.appendChild(B.ui.segmented(section.tabs, state.tabs[id], function (t) {
        showSection(id, t);
      }, 'Sous-onglets ' + section.label));
    }

    // Contenu (redessiné à chaque visite pour être à jour).
    // Le module peut placer des boutons à droite du titre dans ctx.actions.
    B.ui.clear(els.content);
    B.ui.clear(els.actions);
    var mod = B.modules[id];
    if (mod && mod.render) {
      mod.render(els.content, state.tabs[id], { actions: els.actions });
    } else {
      renderPlaceholder(els.content, section);
    }
    els.content.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* Compteurs de la barre latérale (ex. révisions dues), recalculés après chaque modification. */
  function refreshBadges() {
    if (!els.nav) return;
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

  /* Petit indicateur de synchronisation sur le bouton « Données ». */
  var SYNC_LOOK = {
    ok: { icon: 'cloud-check', label: 'Synchronisé', tone: 'ok' },
    pending: { icon: 'cloud-arrow-up', label: 'Envoi en attente…', tone: 'pending' },
    syncing: { icon: 'cloud-arrow-up', label: 'Synchronisation…', tone: 'pending' },
    offline: { icon: 'cloud-slash', label: 'Hors ligne', tone: 'warn' },
    error: { icon: 'cloud-warning', label: 'Erreur de synchro', tone: 'warn' },
    signedout: { icon: 'cloud', label: 'Non connecté', tone: 'muted' }
  };
  function drawSyncStatus() {
    if (!els.syncDot) return;
    var st = B.sync.status();
    var look = SYNC_LOOK[st.status];
    els.syncDot.hidden = !look;
    if (!look) return;
    B.ui.clear(els.syncDot);
    els.syncDot.className = 'sync-dot ' + look.tone;
    els.syncDot.appendChild(icon(look.icon));
    els.syncDot.title = look.label + (st.detail ? ' — ' + st.detail : '');
    els.syncDot.setAttribute('aria-label', look.label);
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
    start: start, showSection: showSection, closeSection: closeSection, refresh: refresh,
    flushCurrent: flushCurrent, refreshBadges: refreshBadges, SECTIONS: SECTIONS
  };

  document.addEventListener('DOMContentLoaded', start);
})(window.Bourgeon = window.Bourgeon || {});
