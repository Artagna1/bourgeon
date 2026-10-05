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

  function render(container, tabId, ctx) {
    els = { root: h('div', { class: 'focus' }) };
    container.appendChild(els.root);
    ctx.actions.appendChild(alertsToggle());
    if (ctx.mobile) {
      ctx.corner.appendChild(tabId === 'history'
        ? B.ui.cornerButton('hourglass-high', 'Session', function () { B.app.showSection('focus', 'session'); })
        : B.ui.cornerButton('clock-counter-clockwise', 'Historique', function () { B.app.showSection('focus', 'history'); }));
    }
    if (tabId === 'history') renderHistory();
    else renderSession();
  }

  /* Interrupteur « Notification à la fin de la phase » (son + notification). */
  function alertsToggle() {
    var btn = h('button', { type: 'button', class: 'toggle-line' });
    function draw() {
      var on = data().focus.settings.alerts;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on ? 'Son et notification activés — cliquer pour couper' : 'Son et notification coupés — cliquer pour activer';
      B.ui.clear(btn);
      B.ui.append(btn, [icon(on ? 'bell' : 'bell-slash', null, on ? 'ph' : 'ph'), 'Notification à la fin de la phase']);
    }
    btn.addEventListener('click', function () {
      B.store.update(function (d) { d.focus.settings.alerts = !d.focus.settings.alerts; });
      if (data().focus.settings.alerts) { unlockAudio(); askNotificationPermission(); }
      draw();
      if (view.redraw) view.redraw();
    });
    draw();
    return btn;
  }

  /* ---------- Onglet SESSION ---------- */

  function renderSession() {
    if (!form) form = Object.assign({}, DEFAULT_CONFIG, data().focus.lastConfig || {});
    els.dial = h('section', { class: 'card focus-dial' });
    els.config = h('section', { class: 'card focus-config' });
    els.today = h('section', { class: 'focus-today' });
    els.root.appendChild(h('div', { class: 'focus-session' },
      els.dial,
      h('div', { class: 'focus-side' }, els.config, els.today)));
    view.redraw = function () { if (els && els.config) { drawConfig(); drawDial(); drawToday(); } };
    view.redraw();
  }

  function drawConfig() {
    var d = data();
    var running = !!d.focus.active;
    B.ui.clear(els.config);
    if (running) { drawSummary(d); return; }

    var subjects = d.revisions.subjects;
    if (form.subjectId && !subjects.some(function (s) { return s.id === form.subjectId; })) form.subjectId = '';

    function field(label, control) {
      return h('div', { class: 'focus-field' }, h('span', { class: 'field-label' }, label), control);
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

    els.configError = B.ui.formError();

    els.config.appendChild(h('h2', { class: 'section-label' }, 'Configuration'));
    els.config.appendChild(h('div', { class: 'focus-fieldset' },
      field('Cible', target),
      field('Matière', subjectSelect),
      subjects.length === 0 ? h('p', { class: 'muted small focus-hint' }, 'Les matières se créent dans Révisions ▸ Arborescence.') : null,
      chapterField,
      field('Mode', mode),
      modeOptions,
      els.configError,
      h('button', { type: 'button', class: 'btn btn-primary focus-start', onclick: onStart }, icon('play', null, 'ph-fill'), 'Démarrer la session')
    ));
  }

  /* Pendant une session : résumé verrouillé de la configuration. */
  function drawSummary(d) {
    var a = d.focus.active;
    var modeText = FL.MODES[a.mode];
    if (a.mode === 'pomodoro') modeText += ' ' + Math.round(a.workSec / 60) + ' / ' + Math.round(a.breakSec / 60);
    if (a.mode === 'sablier') modeText += ' ' + FL.formatTimer(a.plannedSec);
    var subject = a.subjectId ? (d.revisions.subjects.filter(function (s) { return s.id === a.subjectId; })[0] || { name: 'Matière supprimée' }).name : 'Sans matière';
    var chapter = a.chapterId ? (d.revisions.chapters.filter(function (c) { return c.id === a.chapterId; })[0] || { name: 'Chapitre supprimé' }).name : '—';
    function line(label, value) { return h('div', { class: 'summary-line' }, h('span', null, label), h('strong', null, value)); }
    B.ui.append(els.config, [
      h('div', { class: 'card-head' }, h('h2', { class: 'section-label' }, 'Configuration'), icon('lock-simple', 'summary-lock', 'ph-fill')),
      line('Mode', modeText),
      line('Matière', subject),
      line('Chapitre', chapter),
      line('Son de fin', d.focus.settings.alerts ? 'Activé' : 'Coupé'),
      h('p', { class: 'summary-note' }, 'Verrouillée pendant la session.')
    ]);
  }

  /* « Aujourd'hui » : temps de travail du jour et sessions du jour. */
  function drawToday() {
    var d = data(), today = D.today();
    var sessions = d.focus.sessions.filter(function (s) { return s.day === today; })
      .sort(function (x, y) { return y.startedAt - x.startedAt; });
    var total = sessions.reduce(function (n, s) { return n + s.duration; }, 0);
    var hrs = Math.floor(total / 3600), mins = Math.floor((total % 3600) / 60);
    B.ui.clear(els.today);
    B.ui.append(els.today, [
      h('h2', { class: 'section-label' }, 'Aujourd\'hui'),
      h('div', { class: 'today-total' },
        h('span', { class: 'today-big num' }, hrs > 0 ? hrs + ' h ' + D.pad(mins) : mins + ' min'),
        h('span', { class: 'today-sub' }, 'de travail · ' + B.ui.plural(sessions.length, 'session', 'sessions'))),
      sessions.length === 0 ? h('p', { class: 'muted small' }, 'Aucune session terminée aujourd\'hui.') : null,
      h('div', { class: 'today-list' }, sessions.slice(0, 6).map(function (s) {
        return h('div', { class: 'today-item' },
          h('div', { class: 'today-item-text' },
            h('span', null, FL.targetLabel(d, s.subjectId, s.chapterId)),
            h('span', { class: 'today-status ' + (s.completed ? 'lvl-success' : 'lvl-warning') }, s.completed ? 'Terminée' : 'Interrompue')),
          h('span', { class: 'today-dur num' }, D.formatDuration(s.duration).replace('h', ' h ')));
      }))
    ]);
  }

  /* Réglages d'une session en cours (pour garder le formulaire cohérent après l'arrêt). */
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
    if (!r.ok) {
      if (els.configError) B.ui.setError(els.configError, r.error);
      else B.ui.showError(new Error(r.error));
      return;
    }
    if (els.configError) B.ui.setError(els.configError, '');
    unlockAudio();
    if (data().focus.settings.alerts) askNotificationPermission();
    B.store.update(function (d) { d.focus.lastConfig = Object.assign({}, form); });
    start(r.config);
    form = configOfSession(data().focus.active);
    view.redraw();
  }

  /* ---------- Le cadran ---------- */

  /* Frise des phases du pomodoro : les derniers cycles, la phase en cours se remplit. */
  function phaseStrip(a, info) {
    var p = info.pomodoro;
    var first = Math.max(1, p.cycle - 2);
    var segs = [];
    for (var c = first; c <= p.cycle; c++) {
      ['work', 'break'].forEach(function (ph) {
        var len = ph === 'work' ? a.workSec : a.breakSec;
        var fill;
        if (c < p.cycle) fill = 1;
        else if (ph === 'work') fill = p.phase === 'work' ? 1 - p.remaining / len : 1;
        else fill = p.phase === 'break' ? 1 - p.remaining / len : 0;
        segs.push(h('div', { class: 'strip-seg ' + ph + (fill > 0 && fill < 1 ? ' now' : ''), style: 'flex:' + len },
          h('span', { class: 'strip-bar' }, h('span', { class: 'strip-fill', style: 'width:' + Math.round(fill * 1000) / 10 + '%' })),
          h('span', { class: 'strip-label' }, ph === 'work' ? 'Travail' : 'Pause')));
      });
    }
    return h('div', { class: 'phase-strip', 'aria-hidden': 'true' }, segs);
  }

  function drawDial() {
    var d = data();
    var a = d.focus.active;
    B.ui.clear(els.dial);
    els.dial.className = 'card focus-dial';
    onTick = null;

    function dialRing(center) {
      return h('div', { class: 'dial-ring' },
        h('span', { class: 'dial-ticks' }),
        h('span', { class: 'dial-square' }),
        h('span', { class: 'dial-square rot' }),
        h('span', { class: 'dial-arc' }),
        center);
    }

    if (!a) {
      els.dial.classList.add('idle');
      els.dial.appendChild(h('div', { class: 'dial-top' },
        h('span', { class: 'dial-target' }, icon('book-open'), 'Aucune session en cours'),
        h('span', { class: 'dial-cycle' }, 'Prêt')));
      els.dial.appendChild(dialRing(h('div', { class: 'dial-center' },
        h('span', { class: 'dial-phase' }, 'Prêt'),
        h('span', { class: 'dial-time num' }, '--:--'),
        h('span', { class: 'dial-sub' }, 'Choisis la configuration puis démarre.'))));
      els.dial.appendChild(h('div', { class: 'dial-actions' },
        h('button', { type: 'button', class: 'btn btn-primary dial-main', onclick: onStart }, icon('play', null, 'ph-fill'), 'Démarrer')));
      return;
    }

    var refs = {
      target: h('span', { class: 'dial-target' }),
      cycle: h('span', { class: 'dial-cycle' }),
      ring: null,
      phase: h('span', { class: 'dial-phase' }),
      time: h('span', { class: 'dial-time num', role: 'timer', 'aria-live': 'off' }),
      sub: h('span', { class: 'dial-sub' }),
      strip: h('div', { class: 'strip-wrap' }),
      meta: h('div', { class: 'dial-meta' }),
      pauseBtn: h('button', { type: 'button', class: 'btn btn-primary dial-main', onclick: function () { togglePause(); update(Date.now()); } }),
      stopBtn: h('button', { type: 'button', class: 'btn btn-danger dial-main dial-stop', 'aria-label': 'Arrêter la session', onclick: function () { finish(Date.now()); } },
        icon('stop', null, 'ph-fill'), h('span', { class: 'dial-btn-label' }, 'Arrêter'))
    };
    refs.ring = dialRing(h('div', { class: 'dial-center' }, refs.phase, refs.time, refs.sub));
    els.dial.appendChild(h('div', { class: 'dial-top' }, refs.target, refs.cycle));
    els.dial.appendChild(refs.ring);
    els.dial.appendChild(refs.strip);
    els.dial.appendChild(refs.meta);
    els.dial.appendChild(h('div', { class: 'dial-actions' }, refs.stopBtn, refs.pauseBtn));

    function update(now) {
      var a2 = active();
      if (!a2 || !els || !els.dial) return;
      var info = FL.display(a2, now);
      var paused = !!a2.pausedAt;
      var isPomo = a2.mode === 'pomodoro';

      els.dial.className = 'card focus-dial running' + (isPomo ? ' phase-' + info.phase : '') + (paused ? ' paused' : '');

      B.ui.clear(refs.target);
      B.ui.append(refs.target, [icon('book-open'), FL.targetLabel(data(), a2.subjectId, a2.chapterId, true)]);
      refs.cycle.textContent = FL.MODES[a2.mode] + (isPomo ? ' · cycle ' + info.cycle : '');

      // La pause est prioritaire sur tout le reste
      refs.phase.textContent = paused ? 'En pause' : isPomo ? (info.phase === 'work' ? 'Travail' : 'Pause') : 'En cours';
      refs.ring.style.setProperty('--p', info.progress === null ? 100 : Math.round(info.progress * 1000) / 10);
      refs.ring.classList.toggle('free', info.progress === null);
      refs.time.textContent = FL.formatTimer(info.seconds);

      if (paused) refs.sub.textContent = 'Temps figé : la pause n\'est jamais comptée comme du travail.';
      else if (a2.mode === 'sablier') refs.sub.textContent = 'restantes sur ' + FL.formatTimer(a2.plannedSec);
      else if (isPomo) refs.sub.textContent = info.phase === 'work'
        ? 'restantes sur ' + FL.formatTimer(a2.workSec) + ', puis ' + Math.round(a2.breakSec / 60) + ' min de pause'
        : 'de pause, puis ' + Math.round(a2.workSec / 60) + ' min de travail';
      else refs.sub.textContent = 'de travail effectif';

      B.ui.clear(refs.strip);
      if (isPomo) refs.strip.appendChild(phaseStrip(a2, info));

      // « 50 min faites aujourd'hui » · « fin à 21:58 »
      var counted = isPomo ? info.pomodoro.workDone : a2.mode === 'sablier' ? Math.min(FL.elapsedSec(a2, now), a2.plannedSec) : FL.elapsedSec(a2, now);
      var todayDone = data().focus.sessions.filter(function (x) { return x.day === D.today(); })
        .reduce(function (n, x) { return n + x.duration; }, 0) + (D.toStr(new Date(a2.startedAt)) === D.today() ? counted : 0);
      var endText = '';
      if (!paused && a2.mode !== 'chrono') {
        var end = new Date(now + info.seconds * 1000);
        endText = (isPomo ? (info.phase === 'work' ? 'pause à ' : 'reprise à ') : 'fin à ') + D.pad(end.getHours()) + ':' + D.pad(end.getMinutes());
      }
      B.ui.clear(refs.meta);
      B.ui.append(refs.meta, [h('span', null, D.formatDuration(todayDone) + ' faites aujourd\'hui'), h('span', null, endText)]);

      B.ui.clear(refs.pauseBtn);
      refs.pauseBtn.className = 'btn dial-main ' + (paused ? 'btn-resume' : 'btn-primary');
      B.ui.append(refs.pauseBtn, paused ? [icon('play', null, 'ph-fill'), 'Reprendre'] : [icon('pause', null, 'ph-fill'), 'Pause']);
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
    return { text: FL.formatTimer(info.seconds), tone: a.pausedAt ? 'live paused' : 'live', title: a.pausedAt ? 'Session Focus en pause' : 'Session Focus en cours' };
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
