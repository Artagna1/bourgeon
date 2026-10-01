/*
 * Bourgeon — module FOCUS : moteur de session + affichage.
 * Les règles de calcul sont dans focus-logic.js.
 *
 * Le MOTEUR tourne indépendamment de l'écran affiché : une session continue
 * quand on change de section ou de thème, et elle reprend toute seule après
 * un rechargement de la page (la session en cours est enregistrée dans
 * data.focus.active). Il vérifie chaque seconde la fin du sablier et les
 * changements de phase du pomodoro (son + notification).
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon, D = B.dates, FL = B.focusLogic;

  var PERIODS = [
    { id: 'week', label: 'Cette semaine' },
    { id: 'month', label: 'Ce mois' },
    { id: 'year', label: 'Cette année' },
    { id: 'all', label: 'Tout' }
  ];
  var DEFAULT_CONFIG = { target: 'subject', subjectId: '', chapterId: '', mode: 'chrono', hours: '0', minutes: '45', work: '25', brk: '5' };

  function data() { return B.store.get(); }
  function active() { return data() && data().focus.active; }

  /* ======================================================================
     Moteur
     ====================================================================== */

  var ticker = null;
  var lastPhase = null;
  var onTick = null;     // mise à jour de l'écran, si l'onglet Session est affiché

  function ensureTicker() {
    if (!ticker && active()) ticker = setInterval(tick, 1000);
  }

  function tick() {
    var a = active();
    if (!a) {
      clearInterval(ticker);
      ticker = null;
      B.app.refreshBadges();
      return;
    }
    var now = Date.now();
    if (!a.pausedAt) {
      if (a.mode === 'sablier' && FL.display(a, now).finished) {
        finish(now);
        alertUser('Sablier terminé', FL.targetLabel(data(), a.subjectId, a.chapterId, true) + ' — ' + D.formatDuration(a.plannedSec) + ' de travail enregistrées.');
        return;
      }
      if (a.mode === 'pomodoro') {
        var p = FL.pomodoro(a, now);
        if (lastPhase && p.phase !== lastPhase) {
          if (p.phase === 'break') alertUser('Pause !', Math.round(a.breakSec / 60) + ' min de pause. Le temps de pause n\'est pas compté.');
          else alertUser('Au travail !', 'Cycle ' + p.cycle + ' — ' + Math.round(a.workSec / 60) + ' min de travail.');
        }
        lastPhase = p.phase;
      }
    }
    B.app.refreshBadges();
    if (onTick) onTick(now);
  }

  function start(config) {
    var now = Date.now();
    B.store.update(function (d) { d.focus.active = FL.startSession(config, now); });
    lastPhase = null;
    ensureTicker();
    B.app.refreshBadges();
  }

  function togglePause() {
    var now = Date.now();
    B.store.update(function (d) {
      var a = d.focus.active;
      if (a.pausedAt) FL.resume(a, now); else FL.pause(a, now);
    });
    B.app.refreshBadges();
  }

  /* Arrête la session et l'enregistre dans l'historique. */
  function finish(now) {
    B.store.update(function (d) {
      var s = FL.stopSession(d.focus.active, now || Date.now());
      d.focus.sessions.push(FL.attachToExisting(d, s));
      d.focus.active = null;
    });
    lastPhase = null;
    B.app.refreshBadges();
    if (view.redraw) view.redraw();
  }

  /* ---------- Son et notification ---------- */

  var audio = null;

  /* Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur : on le prépare au démarrage. */
  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }

  function beep() {
    if (!audio) return;
    try {
      [0, 0.28, 0.56].forEach(function (t, i) {
        var osc = audio.createOscillator(), gain = audio.createGain();
        var at = audio.currentTime + t;
        osc.type = 'sine';
        osc.frequency.value = i === 2 ? 1175 : 880;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        osc.connect(gain).connect(audio.destination);
        osc.start(at);
        osc.stop(at + 0.25);
      });
    } catch (e) { /* son indisponible : non bloquant */ }
  }

  function alertUser(title, body) {
    if (!data().focus.settings.alerts) return;
    beep();
    if (document.visibilityState === 'visible') return;   // la page est sous les yeux : le son suffit
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Bourgeon — ' + title, { body: body });
    } catch (e) { /* notifications indisponibles : non bloquant */ }
  }

  function askNotificationPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) { /* non bloquant */ }
  }

  /* ======================================================================
     Affichage
     ====================================================================== */

  var view = {};         // fonctions de l'écran affiché (redraw)
  var els = null;
  var form = null;       // réglages en cours de saisie
  var period = 'week';

  function render(container, tabId) {
    els = { root: h('div', { class: 'focus' }) };
    container.appendChild(els.root);
    if (tabId === 'history') renderHistory();
    else renderSession();
  }

  /* ---------- Onglet SESSION ---------- */

  function renderSession() {
    if (!form) form = Object.assign({}, DEFAULT_CONFIG, data().focus.lastConfig || {});
    els.config = h('section', { class: 'card focus-config' });
    els.dial = h('section', { class: 'card focus-dial' });
    els.root.appendChild(h('div', { class: 'focus-session' }, els.config, els.dial));
    view.redraw = function () { if (els && els.config) { drawConfig(); drawDial(); } };
    view.redraw();
  }

  function drawConfig() {
    var d = data();
    var running = !!d.focus.active;
    var subjects = d.revisions.subjects;
    if (running) form = configOfSession(d.focus.active);
    if (form.subjectId && !subjects.some(function (s) { return s.id === form.subjectId; })) form.subjectId = '';
    B.ui.clear(els.config);

    function field(label, control) {
      return h('div', { class: 'focus-field' }, h('span', { class: 'section-label' }, label), control);
    }
    function redrawConfig(key, value) { form[key] = value; drawConfig(); }

    // Cible
    var target = B.ui.segmented([{ id: 'subject', label: 'Matière' }, { id: 'chapter', label: 'Chapitre' }],
      form.target, function (v) { redrawConfig('target', v); }, 'Cible');

    // Matière
    var subjectSelect = h('select', {
      class: 'input', 'aria-label': 'Matière',
      onchange: function () { form.chapterId = ''; redrawConfig('subjectId', subjectSelect.value); }
    }, h('option', { value: '' }, '— Aucune matière —'), subjects.map(function (s) {
      return h('option', { value: s.id, selected: s.id === form.subjectId }, s.name);
    }));

    // Chapitre (si la cible est « Chapitre »)
    var chapterField = null;
    if (form.target === 'chapter') {
      var chapters = form.subjectId ? B.revisionsLogic.chaptersOf(d, form.subjectId) : [];
      if (form.chapterId && !chapters.some(function (c) { return c.id === form.chapterId; })) form.chapterId = '';
      var placeholder = !form.subjectId ? '— Choisis d\'abord une matière —'
        : chapters.length === 0 ? '— Aucun chapitre dans cette matière —' : '— Choisir un chapitre —';
      var chapterSelect = h('select', {
        class: 'input', 'aria-label': 'Chapitre', disabled: chapters.length === 0,
        onchange: function () { form.chapterId = chapterSelect.value; }
      }, h('option', { value: '' }, placeholder), chapters.map(function (c) {
        return h('option', { value: c.id, selected: c.id === form.chapterId }, c.name);
      }));
      chapterField = field('Chapitre', chapterSelect);
    }

    // Mode et durées
    var mode = B.ui.segmented([{ id: 'chrono', label: 'Chrono' }, { id: 'sablier', label: 'Sablier' }, { id: 'pomodoro', label: 'Pomodoro' }],
      form.mode, function (v) { redrawConfig('mode', v); }, 'Mode');

    function numInput(key, label, max) {
      var input = h('input', {
        class: 'input focus-num num', type: 'text', inputmode: 'numeric', maxlength: String(max).length,
        value: form[key], 'aria-label': label,
        oninput: function () { form[key] = input.value; }
      });
      return input;
    }
    var modeOptions = null;
    if (form.mode === 'sablier') {
      modeOptions = h('div', { class: 'focus-durations' },
        h('span', null, 'Durée'), numInput('hours', 'Heures', 23), h('span', null, 'h'),
        numInput('minutes', 'Minutes', 59), h('span', null, 'min'));
    } else if (form.mode === 'pomodoro') {
      modeOptions = h('div', { class: 'focus-mode-options' },
        h('div', { class: 'focus-durations' },
          h('span', null, 'Travail'), numInput('work', 'Minutes de travail', 300), h('span', null, 'min'),
          h('span', { class: 'focus-gap' }), h('span', null, 'Pause'), numInput('brk', 'Minutes de pause', 300), h('span', null, 'min')),
        h('p', { class: 'muted small' }, 'Tourne à l\'infini jusqu\'à l\'arrêt manuel.'));
    }

    var alerts = h('input', {
      type: 'checkbox', checked: d.focus.settings.alerts,
      onchange: function () { B.store.update(function (dd) { dd.focus.settings.alerts = alerts.checked; }); }
    });

    els.configError = B.ui.formError();

    var fieldset = h('fieldset', { class: 'focus-fieldset', disabled: running },
      field('Cible', target),
      field('Matière', subjectSelect),
      subjects.length === 0 ? h('p', { class: 'muted small focus-hint' }, 'Les matières se créent dans Révisions ▸ Arborescence.') : null,
      chapterField,
      field('Mode', mode),
      modeOptions,
      h('label', { class: 'focus-alerts' }, alerts, icon('bell-simple-ringing'), 'Son (et notification si la page est en arrière-plan) en fin de phase'),
      els.configError,
      h('button', { type: 'button', class: 'btn btn-primary focus-start', onclick: onStart }, icon('play', null, 'ph-fill'), 'Démarrer la session')
    );

    els.config.appendChild(h('h2', { class: 'section-label focus-card-title' }, running ? 'Configuration · verrouillée pendant la session' : 'Configuration'));
    els.config.appendChild(fieldset);
  }

  /* Réglages d'une session en cours, pour les afficher (verrouillés) dans le formulaire. */
  function configOfSession(a) {
    var planned = a.plannedSec ? Math.round(a.plannedSec / 60) : 45;
    return Object.assign({}, DEFAULT_CONFIG, form || {}, {
      target: a.chapterId ? 'chapter' : 'subject',
      subjectId: a.subjectId || '', chapterId: a.chapterId || '', mode: a.mode,
      hours: String(Math.floor(planned / 60)), minutes: String(planned % 60),
      work: a.workSec ? String(a.workSec / 60) : (form && form.work) || '25',
      brk: a.breakSec ? String(a.breakSec / 60) : (form && form.brk) || '5'
    });
  }

  function onStart() {
    var r = FL.validateConfig(form);
    if (!r.ok) { B.ui.setError(els.configError, r.error); return; }
    B.ui.setError(els.configError, '');
    unlockAudio();
    if (data().focus.settings.alerts) askNotificationPermission();
    B.store.update(function (d) { d.focus.lastConfig = Object.assign({}, form); });
    start(r.config);
    view.redraw();
  }

  /* ---------- Le cadran ---------- */

  function drawDial() {
    var d = data();
    var a = d.focus.active;
    B.ui.clear(els.dial);
    els.dial.className = 'card focus-dial';
    onTick = null;

    if (!a) {
      els.dial.classList.add('idle');
      els.dial.appendChild(h('div', { class: 'dial-top' }, h('span', { class: 'badge' }, 'PRÊT')));
      els.dial.appendChild(h('div', { class: 'dial-ring idle' },
        h('div', { class: 'dial-center' },
          h('span', { class: 'dial-time num' }, '--:--'),
          h('span', { class: 'dial-sub' }, 'Aucune session en cours'))));
      els.dial.appendChild(h('div', { class: 'dial-actions' },
        h('button', { type: 'button', class: 'btn btn-primary dial-main', onclick: onStart }, icon('play', null, 'ph-fill'), 'Démarrer')));
      return;
    }

    var refs = {
      badge: h('span', { class: 'badge' }),
      cycle: h('span', { class: 'dial-cycle num' }),
      ring: h('div', { class: 'dial-ring' }),
      phase: h('span', { class: 'dial-phase' }),
      time: h('span', { class: 'dial-time num', role: 'timer', 'aria-live': 'off' }),
      sub: h('span', { class: 'dial-sub' }),
      target: h('p', { class: 'dial-target' }),
      pauseBtn: h('button', { type: 'button', class: 'btn btn-primary dial-main', onclick: function () { togglePause(); update(Date.now()); } }),
      stopBtn: h('button', { type: 'button', class: 'btn btn-danger dial-main', onclick: function () { finish(Date.now()); } },
        icon('stop', null, 'ph-fill'), 'Arrêter la session')
    };
    refs.ring.appendChild(h('div', { class: 'dial-center' }, refs.phase, refs.time, refs.sub));
    els.dial.appendChild(h('div', { class: 'dial-top' }, refs.badge, refs.cycle));
    els.dial.appendChild(refs.ring);
    els.dial.appendChild(refs.target);
    els.dial.appendChild(h('div', { class: 'dial-actions' }, refs.pauseBtn, refs.stopBtn));

    function update(now) {
      var a2 = active();
      if (!a2 || !els || !els.dial) return;
      var info = FL.display(a2, now);
      var paused = !!a2.pausedAt;
      var isPomo = a2.mode === 'pomodoro';

      els.dial.className = 'card focus-dial running' + (isPomo ? ' phase-' + info.phase : '') + (paused ? ' paused' : '');

      // Badge : la pause est prioritaire sur tout le reste
      B.ui.clear(refs.badge);
      if (paused) { refs.badge.className = 'badge warning'; B.ui.append(refs.badge, [icon('pause', null, 'ph-fill'), 'EN PAUSE']); }
      else if (isPomo && info.phase === 'break') { refs.badge.className = 'badge success'; B.ui.append(refs.badge, [icon('coffee'), 'PAUSE']); }
      else if (isPomo) { refs.badge.className = 'badge accent'; B.ui.append(refs.badge, [h('span', { class: 'live-dot' }), 'TRAVAIL']); }
      else { refs.badge.className = 'badge accent'; B.ui.append(refs.badge, [h('span', { class: 'live-dot' }), 'EN COURS']); }

      refs.cycle.textContent = isPomo ? 'Cycle ' + info.cycle : '';
      refs.ring.style.setProperty('--p', info.progress === null ? 100 : Math.round(info.progress * 1000) / 10);
      refs.ring.classList.toggle('free', info.progress === null);
      refs.time.textContent = FL.formatTimer(info.seconds);
      refs.phase.textContent = isPomo ? (info.phase === 'work' ? '● TRAVAIL' : 'PAUSE') : FL.MODES[a2.mode].toUpperCase();

      if (paused) refs.sub.textContent = 'Temps figé. La pause n\'est jamais comptée comme du travail.';
      else if (a2.mode === 'sablier') refs.sub.textContent = 'restantes sur ' + FL.formatTimer(a2.plannedSec);
      else if (isPomo) refs.sub.textContent = info.phase === 'work'
        ? 'puis ' + Math.round(a2.breakSec / 60) + ' min de pause'
        : 'puis ' + Math.round(a2.workSec / 60) + ' min de travail';
      else refs.sub.textContent = 'de travail effectif';

      refs.target.textContent = FL.targetLabel(data(), a2.subjectId, a2.chapterId, true) + ' · ' + FL.MODES[a2.mode];

      B.ui.clear(refs.pauseBtn);
      refs.pauseBtn.className = 'btn dial-main ' + (paused ? 'btn-resume' : 'btn-primary');
      B.ui.append(refs.pauseBtn, paused ? [icon('play', null, 'ph-fill'), 'Reprendre'] : [icon('pause', null, 'ph-fill'), 'Mettre en pause']);
    }

    update(Date.now());
    onTick = update;
  }

  /* ---------- Onglet HISTORIQUE ---------- */

  function renderHistory() {
    view.redraw = function () { if (els && els.root) { B.ui.clear(els.root); drawHistory(); } };
    drawHistory();
  }

  function drawHistory() {
    var d = data(), today = D.today();

    // Récap par matière
    var recap = FL.recapBySubject(d, period, today);
    var recapList = h('div', { class: 'focus-recap' });
    if (recap.length === 0) recapList.appendChild(h('p', { class: 'muted small' }, 'Aucune session sur cette période.'));
    recap.forEach(function (r) {
      recapList.appendChild(h('div', { class: 'recap-row' },
        h('span', { class: 'recap-name' + (r.subjectId ? '' : ' muted') }, r.name),
        h('div', { class: 'progress thick' }, h('span', { style: 'width:' + (r.ratio * 100) + '%' })),
        h('span', { class: 'num right' }, D.formatDuration(r.seconds))
      ));
    });

    // Carte de chaleur
    var weeks = FL.heatmap(d, today);
    var dayNames = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    var grid = h('div', { class: 'heatmap', role: 'img', 'aria-label': 'Temps de travail par jour sur les 8 dernières semaines' },
      dayNames.map(function (n, row) {
        return [h('span', { class: 'heat-day' }, n)].concat(weeks.map(function (w) {
          var cell = w[row];
          if (!cell) return h('span', { class: 'heat-cell empty' });
          return h('span', {
            class: 'heat-cell' + (cell.seconds > 0 ? ' on' : '') + (cell.date === today ? ' today' : ''),
            style: '--i:' + cell.intensity.toFixed(3), title: cell.label
          });
        }));
      })
    );

    // Sessions récentes
    var recent = FL.recentSessions(d, 5);
    var recentBlock;
    if (recent.length === 0) {
      recentBlock = h('p', { class: 'muted small' }, 'Aucune session enregistrée pour le moment.');
    } else {
      recentBlock = h('div', { class: 'table-scroll' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Début'), h('th', { scope: 'col' }, 'Matière · chapitre'),
          h('th', { scope: 'col' }, 'Mode'), h('th', { scope: 'col' }, 'Durée'), h('th', { scope: 'col' }, 'Statut'))),
        h('tbody', null, recent.map(function (s) {
          return h('tr', null,
            h('td', { class: 'num' }, FL.formatStart(s.startedAt)),
            h('td', null, FL.targetLabel(d, s.subjectId, s.chapterId)),
            h('td', null, FL.MODES[s.mode] + (s.mode === 'pomodoro' && s.workCycles ? ' · ' + B.ui.plural(s.workCycles, 'cycle', 'cycles') : '')),
            h('td', { class: 'num' }, D.formatDuration(s.duration)),
            h('td', null, s.completed ? h('span', { class: 'badge success' }, 'Terminée') : h('span', { class: 'badge' }, 'Interrompue')));
        }))));
    }

    els.root.appendChild(h('div', { class: 'focus-history' },
      h('section', { class: 'card focus-recap-card' },
        h('div', { class: 'card-head' },
          h('h2', { class: 'section-label' }, 'Récap par matière'),
          B.ui.segmented(PERIODS, period, function (p) { period = p; view.redraw(); }, 'Période')),
        recapList),
      h('section', { class: 'card focus-heat-card' },
        h('div', { class: 'card-head' },
          h('h2', { class: 'section-label' }, '8 dernières semaines'),
          h('span', { class: 'card-hint' }, 'intensité maximale à 2 h')),
        grid),
      h('section', { class: 'card focus-recent-card' },
        h('h2', { class: 'section-label' }, 'Sessions récentes'),
        recentBlock)
    ));
  }

  /* Compteur de la barre latérale : le temps de la session en cours. */
  function badge() {
    var a = active();
    if (!a) return null;
    var info = FL.display(a, Date.now());
    return { text: FL.formatTimer(info.seconds), tone: a.pausedAt ? 'warning' : 'live', title: 'Session Focus en cours' };
  }

  function leave() {
    onTick = null;
    view = {};
    els = null;
  }

  /* Au démarrage de l'appli : reprend une session laissée en cours. */
  function init() {
    if (active()) ensureTicker();
  }

  B.modules = B.modules || {};
  B.modules.focus = { render: render, leave: leave, badge: badge, init: init };
})(window.Bourgeon = window.Bourgeon || {});
