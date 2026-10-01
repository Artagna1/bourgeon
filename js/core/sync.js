/*
 * Bourgeon — synchronisation entre appareils (Supabase).
 *
 * Principe :
 *   - L'appli travaille toujours sur ses données LOCALES (navigateur) : elle
 *     reste rapide et marche hors ligne.
 *   - Les données sont découpées en modules (journal, habitudes…). Quand un
 *     module change, il est marqué « à envoyer » puis envoyé à Supabase.
 *   - À l'ouverture, au retour sur l'appli et régulièrement, on récupère les
 *     modules modifiés ailleurs.
 *   - Si un même module a été modifié des deux côtés : le Journal est
 *     fusionné jour par jour ; pour les autres modules, la modification la
 *     plus récente l'emporte.
 *
 * État local de la synchro (clé « bourgeon.sync ») :
 *   { userId, dirty: { module: date de la modif locale },
 *     seen: { module: date serveur de la dernière version connue } }
 *
 * Chaque ligne envoyée porte changed_at = heure de la modification sur
 * l'appareil : c'est elle qui départage un conflit (et non l'heure d'envoi,
 * sinon un appareil qui envoie en retard écraserait une modification plus
 * récente faite ailleurs).
 */
(function (B) {
  'use strict';

  var SECTIONS = ['journal', 'habits', 'focus', 'goals', 'eisenhower', 'revisions', 'sport'];
  var META_KEY = 'bourgeon.sync';
  var TABLE = 'bourgeon_docs';

  /* ================= Règles (sans réseau, testées) ================= */

  /* Modules dont le contenu a changé par rapport aux instantanés connus. */
  function changedSections(data, snapshots) {
    return SECTIONS.filter(function (s) { return JSON.stringify(data[s]) !== snapshots[s]; });
  }

  /* Journal : fusion jour par jour, la version la plus récente de chaque jour gagne. */
  function mergeJournal(local, remote) {
    var out = { entries: {} };
    var a = (local && local.entries) || {}, b = (remote && remote.entries) || {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (day) {
      var x = a[day], y = b[day];
      if (!x || !y) { out.entries[day] = x || y; return; }
      out.entries[day] = (Date.parse(y.updatedAt) || 0) > (Date.parse(x.updatedAt) || 0) ? y : x;
    });
    return out;
  }

  /*
   * Un module a changé des deux côtés : que faire ?
   *   'merge'  — fusionner (Journal) ;
   *   'remote' — la version distante est plus récente ;
   *   'local'  — la modification locale est plus récente.
   */
  function resolveConflict(section, localChangedAt, remoteChangedAt) {
    if (section === 'journal') return 'merge';
    return Date.parse(remoteChangedAt) > Date.parse(localChangedAt) ? 'remote' : 'local';
  }

  /* Vrai si cet appareil ne contient encore rien de personnel. */
  function isEmpty(d) {
    return Object.keys(d.journal.entries).length === 0 &&
      d.habits.items.length === 0 && d.focus.sessions.length === 0 &&
      d.goals.items.length === 0 && d.eisenhower.tasks.length === 0 &&
      d.revisions.subjects.length === 0 &&
      d.sport.planning.every(function (p) { return !p; });
  }

  /* ================= Moteur ================= */

  var client = null;
  var user = null;
  var meta = null;
  var snapshots = {};
  var status = 'off';        // off | signedout | syncing | ok | pending | offline | error
  var statusDetail = '';
  var statusListeners = [];
  var running = null;        // promesse de la synchro en cours
  var again = false;         // une nouvelle synchro a été demandée pendant la synchro en cours
  var pushTimer = null;

  function enabled() {
    var c = B.config || {};
    return !!(c.supabaseUrl && c.supabaseKey && window.supabase && window.supabase.createClient);
  }

  function loadMeta() {
    try { meta = JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { meta = {}; }
    meta.dirty = meta.dirty || {};
    meta.seen = meta.seen || {};
  }
  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* non bloquant */ }
  }

  function takeSnapshots() {
    var d = B.store.get();
    SECTIONS.forEach(function (s) { snapshots[s] = JSON.stringify(d[s]); });
  }

  function setStatus(s, detail) {
    status = s;
    statusDetail = detail || '';
    statusListeners.forEach(function (fn) { fn(status, statusDetail); });
  }

  function pendingCount() { return Object.keys(meta.dirty).length; }

  /* Après chaque enregistrement local : repère les modules modifiés. */
  function onLocalChange() {
    var changed = changedSections(B.store.get(), snapshots);
    if (!changed.length) return;
    var now = new Date().toISOString();
    changed.forEach(function (s) {
      meta.dirty[s] = now;
      snapshots[s] = JSON.stringify(B.store.get()[s]);
    });
    saveMeta();
    if (!user) return;
    setStatus('pending');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { sync(); }, 1200);
  }

  /* Remplace un module local par une version reçue, sans le marquer « à envoyer ». */
  function applySection(section, value) {
    var d = B.store.get();
    d[section] = value;
    snapshots[section] = JSON.stringify(value);
  }

  function isNetworkError(err) {
    return !navigator.onLine || /fetch|network|Failed to/i.test((err && err.message) || '');
  }

  /*
   * Une synchronisation complète : récupérer ce qui a changé ailleurs, puis
   * envoyer ce qui a changé ici. quiet : ne rien remplacer si l'utilisateur
   * est en train d'écrire (synchro périodique).
   */
  function sync(opts) {
    if (!user) return Promise.resolve();
    if (running) { again = true; return running; }
    running = doSync(opts || {}).then(function () {
      running = null;
      if (again) { again = false; return sync(); }
    }, function (err) {
      running = null;
      if (isNetworkError(err)) setStatus('offline', 'Hors ligne : les modifications seront envoyées au retour du réseau.');
      else setStatus('error', (err && err.message) || String(err));
    });
    return running;
  }

  function editing() {
    var el = document.activeElement;
    return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'file'));
  }

  function doSync(opts) {
    setStatus('syncing');
    return client.from(TABLE).select('section, updated_at').then(check).then(function (rows) {
      var newer = rows.filter(function (r) {
        return SECTIONS.indexOf(r.section) >= 0 && (!meta.seen[r.section] || Date.parse(r.updated_at) > Date.parse(meta.seen[r.section]));
      }).map(function (r) { return r.section; });
      if (!newer.length) return push();
      // Synchro périodique pendant une saisie : on ne remplace rien et on
      // n'envoie rien non plus (ce serait écraser une version plus récente).
      if (opts.quiet && editing()) return;
      return client.from(TABLE).select('section, data, changed_at, updated_at, version').in('section', newer)
        .then(check).then(applyRemote).then(push);
    }).then(function () {
      setStatus(pendingCount() ? 'pending' : 'ok');
    });
  }

  function check(res) {
    if (res.error) {
      var err = new Error(res.error.message || 'Erreur Supabase');
      err.code = res.error.code;
      throw err;
    }
    return res.data || [];
  }

  /* Intègre les modules reçus (avec fusion / arbitrage si modifiés des deux côtés). */
  function applyRemote(rows) {
    var tooNew = rows.some(function (r) { return r.version > B.store.VERSION; });
    if (tooNew) throw new Error('Ces données viennent d\'une version plus récente de Bourgeon : recharge la page pour mettre l\'appli à jour.');

    // Les brouillons à l'écran sont d'abord enregistrés (ils deviennent des modifications locales).
    if (B.app && B.app.flushCurrent) B.app.flushCurrent();

    var changed = false;
    rows.forEach(function (r) {
      var local = meta.dirty[r.section];
      if (!local) {
        applySection(r.section, r.data);
        changed = true;
      } else {
        var decision = resolveConflict(r.section, local, r.changed_at || r.updated_at);
        if (decision === 'merge') {
          applySection(r.section, mergeJournal(B.store.get()[r.section], r.data));
          meta.dirty[r.section] = new Date().toISOString();   // le résultat fusionné repart vers le serveur
          changed = true;
        } else if (decision === 'remote') {
          applySection(r.section, r.data);
          delete meta.dirty[r.section];
          changed = true;
        }
        // 'local' : on garde la version locale, elle sera envoyée.
      }
      meta.seen[r.section] = r.updated_at;
    });
    saveMeta();
    if (changed) {
      B.store.save();
      if (B.app && B.app.refresh) B.app.refresh();
    }
  }

  /* Envoie les modules modifiés localement. */
  function push() {
    var sections = Object.keys(meta.dirty).filter(function (s) { return SECTIONS.indexOf(s) >= 0; });
    if (!sections.length) return Promise.resolve();
    var d = B.store.get();
    var sent = {};
    var rows = sections.map(function (s) {
      sent[s] = snapshots[s];
      return { user_id: user.id, section: s, data: d[s], version: B.store.VERSION, changed_at: meta.dirty[s] };
    });
    return client.from(TABLE).upsert(rows, { onConflict: 'user_id,section' }).select('section, updated_at').then(check).then(function (saved) {
      saved.forEach(function (r) {
        meta.seen[r.section] = r.updated_at;
        if (snapshots[r.section] === sent[r.section]) delete meta.dirty[r.section];   // pas retouché pendant l'envoi
      });
      saveMeta();
    });
  }

  /* ---------- Première synchro d'un compte sur cet appareil ---------- */

  function firstSync() {
    setStatus('syncing');
    return client.from(TABLE).select('section, data, updated_at, version').then(check).then(function (rows) {
      rows = rows.filter(function (r) { return SECTIONS.indexOf(r.section) >= 0; });
      var local = B.store.get();
      if (rows.length === 0) return 'upload';
      if (isEmpty(local)) return { use: 'remote', rows: rows };
      return askWhichData(rows).then(function (choice) { return { use: choice, rows: rows }; });
    }).then(function (plan) {
      meta = { userId: user.id, dirty: {}, seen: {} };
      if (plan === 'upload' || plan.use === 'local') {
        if (plan.rows) plan.rows.forEach(function (r) { meta.seen[r.section] = r.updated_at; });
        var now = new Date().toISOString();
        SECTIONS.forEach(function (s) { meta.dirty[s] = now; });
        saveMeta();
        return push();
      }
      if (plan.use === 'remote') {
        // On remplace les modules par ceux du compte SANS les marquer « à
        // envoyer » (applySection met l'instantané à jour avant l'enregistrement).
        var d = B.store.get();
        var incoming = { version: B.store.VERSION };
        SECTIONS.forEach(function (s) { incoming[s] = d[s]; });
        plan.rows.forEach(function (r) { incoming[r.section] = r.data; meta.seen[r.section] = r.updated_at; });
        var parsed = B.store.parse(JSON.stringify(incoming)).data;   // complète les rubriques manquantes
        SECTIONS.forEach(function (s) { applySection(s, parsed[s]); });
        B.store.save();
        saveMeta();
        if (B.app && B.app.refresh) B.app.refresh();
      }
    }).then(function () {
      setStatus(pendingCount() ? 'pending' : 'ok');
    });
  }

  /* Les deux côtés ont des données : on demande lesquelles garder. */
  function askWhichData(rows) {
    var remote = B.store.defaultData();
    rows.forEach(function (r) { remote[r.section] = r.data; });
    remote = B.store.parse(JSON.stringify(remote)).data;
    return new Promise(function (resolve) {
      var h = B.ui.h;
      var dlg = B.ui.openDialog(h('form', { method: 'dialog' },
        h('h2', { class: 'modal-title' }, 'Quelles données garder ?'),
        h('p', { class: 'modal-text' },
          'Ton compte contient déjà des données, et cet appareil aussi.\n\n' +
          'Sur le compte : ' + B.backup.summary(remote) + '.\n\n' +
          'Sur cet appareil : ' + B.backup.summary(B.store.get()) + '.\n\n' +
          'Les données non choisies seront remplacées.'),
        h('div', { class: 'modal-actions modal-actions-stack' },
          h('button', { type: 'submit', value: 'local', class: 'btn' }, 'Garder celles de cet appareil'),
          h('button', { type: 'submit', value: 'remote', class: 'btn btn-primary' }, 'Utiliser celles du compte'))
      ), function (value) { resolve(value === 'local' ? 'local' : 'remote'); });
      dlg.querySelector('.btn-primary').focus();
    });
  }

  /*
   * Secours : renvoie TOUS les modules de cet appareil vers le compte (ils
   * deviennent la version la plus récente et remplacent celle des autres
   * appareils à leur prochaine synchro).
   */
  function forceUpload() {
    if (!user) return Promise.resolve();
    var now = new Date().toISOString();
    SECTIONS.forEach(function (s) { meta.dirty[s] = now; });
    saveMeta();
    return push().then(function () { setStatus(pendingCount() ? 'pending' : 'ok'); }, fail);
  }

  /* ---------- Compte ---------- */

  function onSignedIn(u) {
    var first = !user || user.id !== u.id;
    user = u;
    if (!first) return;
    if (meta.userId !== u.id) firstSync().catch(fail);
    else sync();
  }

  function fail(err) {
    if (isNetworkError(err)) setStatus('offline', 'Hors ligne.');
    else setStatus('error', (err && err.message) || String(err));
  }

  function signIn(email, password) {
    return client.auth.signInWithPassword({ email: email.trim(), password: password }).then(function (res) {
      if (res.error) throw new Error(translateAuthError(res.error));
      onSignedIn(res.data.user);
      return res.data.user;
    });
  }

  function signUp(email, password) {
    // Le lien de confirmation reçu par e-mail ramène vers cette page de l'appli.
    var options = /^https?:$/.test(location.protocol) ? { emailRedirectTo: location.origin + location.pathname } : {};
    return client.auth.signUp({ email: email.trim(), password: password, options: options }).then(function (res) {
      if (res.error) throw new Error(translateAuthError(res.error));
      if (!res.data.session) return { confirm: true };   // confirmation par e-mail demandée par Supabase
      onSignedIn(res.data.user);
      return { confirm: false };
    });
  }

  function signOut() {
    return client.auth.signOut().then(function () {
      user = null;
      meta = { dirty: {}, seen: {} };
      saveMeta();
      setStatus('signedout');
    });
  }

  function translateAuthError(err) {
    var m = (err && err.message) || '';
    if (/invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/email not confirmed/i.test(m)) return 'Adresse e-mail pas encore confirmée : clique sur le lien reçu par e-mail.';
    if (/already registered|already been registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail : connecte-toi.';
    if (/password should be at least/i.test(m)) return 'Le mot de passe doit contenir au moins 6 caractères.';
    if (/signups not allowed|signup is disabled/i.test(m)) return 'La création de compte est désactivée.';
    if (/unable to validate email|invalid email/i.test(m)) return 'Adresse e-mail invalide.';
    if (/fetch|network/i.test(m)) return 'Pas de connexion internet.';
    return m || 'Erreur de connexion.';
  }

  /* ---------- Démarrage ---------- */

  function init() {
    loadMeta();
    takeSnapshots();
    B.store.onChange(onLocalChange);
    if (!enabled()) { setStatus('off'); return; }

    client = window.supabase.createClient(B.config.supabaseUrl, B.config.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bourgeon.auth' }
    });
    setStatus('signedout');

    client.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (session) onSignedIn(session.user);
    }).catch(fail);
    client.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) onSignedIn(session.user);
      else if (event === 'SIGNED_OUT') { user = null; setStatus('signedout'); }
    });

    document.addEventListener('visibilitychange', function () {
      if (!user) return;
      if (document.visibilityState === 'hidden') { clearTimeout(pushTimer); sync(); }
      else sync();
    });
    window.addEventListener('online', function () { if (user) sync(); });
    window.addEventListener('focus', function () { if (user) sync({ quiet: true }); });
    setInterval(function () { if (user && document.visibilityState === 'visible') sync({ quiet: true }); }, 3 * 60 * 1000);
  }

  B.sync = {
    init: init, sync: sync, signIn: signIn, signUp: signUp, signOut: signOut, enabled: enabled, forceUpload: forceUpload,
    status: function () { return { status: status, detail: statusDetail, email: user && user.email, pending: meta ? pendingCount() : 0 }; },
    onStatus: function (fn) { statusListeners.push(fn); },
    logic: { SECTIONS: SECTIONS, changedSections: changedSections, mergeJournal: mergeJournal, resolveConflict: resolveConflict, isEmpty: isEmpty }
  };
})(window.Bourgeon = window.Bourgeon || {});
