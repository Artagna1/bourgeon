/*
 * Bourgeon — sauvegarde : exporter toutes les données dans un fichier JSON,
 * ou les remplacer par celles d'un fichier (sauvegarde, ou conversion depuis
 * l'appli bureau avec outils/convertir_depuis_python.py).
 */
(function (B) {
  'use strict';

  var h = B.ui.h, icon = B.ui.icon;

  /* Petit résumé lisible du contenu, pour savoir ce qu'on importe. */
  function summary(d) {
    var r = d.revisions;
    var checks = Object.keys(d.habits.checks).reduce(function (n, id) { return n + Object.keys(d.habits.checks[id]).length; }, 0);
    return [
      B.ui.plural(Object.keys(d.journal.entries).length, 'entrée de journal', 'entrées de journal'),
      B.ui.plural(d.habits.items.length, 'habitude', 'habitudes') + ' (' + B.ui.plural(checks, 'coche', 'coches') + ')',
      B.ui.plural(d.focus.sessions.length, 'session Focus', 'sessions Focus'),
      B.ui.plural(d.goals.items.length, 'objectif', 'objectifs'),
      B.ui.plural(d.eisenhower.tasks.length, 'tâche', 'tâches'),
      B.ui.plural(r.subjects.length, 'matière', 'matières') + ', ' + B.ui.plural(r.concepts.length, 'concept', 'concepts')
    ].join(' · ');
  }

  function download(text, filename) {
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function open() {
    var error = B.ui.formError();
    var fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', 'aria-label': 'Fichier à importer' });
    var dlg;

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var incoming;
        try {
          incoming = B.store.parse(String(reader.result)).data;
        } catch (e) {
          B.ui.setError(error, e.message);
          fileInput.value = '';
          return;
        }
        dlg.finish('');
        B.ui.confirm({
          title: 'Remplacer toutes les données ?',
          message: 'Le fichier « ' + file.name + ' » contient : ' + summary(incoming) + '.\n\n' +
            'TOUTES les données actuelles de Bourgeon dans ce navigateur seront remplacées et définitivement ' +
            'effacées (' + summary(B.store.get()) + ').',
          confirmLabel: 'Remplacer', danger: true
        }).then(function (ok) {
          if (!ok) return;
          B.app.closeSection();
          B.store.importData(String(reader.result));
          location.reload();   // repart de zéro avec les nouvelles données
        });
      };
      reader.onerror = function () { B.ui.setError(error, 'Impossible de lire ce fichier.'); };
      reader.readAsText(file, 'utf-8');
    });

    var content = h('div', { class: 'backup' },
      h('h2', { class: 'modal-title' }, 'Tes données'),
      syncSection(),
      h('p', { class: 'modal-text' }, 'Tout est enregistré dans ce navigateur, sur cet appareil. Si tu vides les données ' +
        'du navigateur, elles sont perdues : exporte régulièrement une sauvegarde.'),
      h('p', { class: 'backup-summary small muted' }, 'Actuellement : ' + summary(B.store.get()) + '.'),
      h('div', { class: 'backup-actions' },
        h('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: function () { download(B.store.exportData(), 'bourgeon-sauvegarde-' + B.dates.today() + '.json'); }
        }, icon('download-simple'), 'Exporter une sauvegarde'),
        h('button', { type: 'button', class: 'btn', onclick: function () { fileInput.click(); } }, icon('upload-simple'), 'Importer un fichier…'),
        fileInput
      ),
      h('p', { class: 'small muted' }, 'Importer remplace toutes les données actuelles (une confirmation est demandée).'),
      error,
      h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn', onclick: function () { dlg.finish(''); } }, 'Fermer'))
    );
    dlg = B.ui.openDialog(content);
    dlg.classList.add('modal-wide');
  }

  /* ---------- Synchronisation entre appareils ---------- */

  var STATUS_TEXT = {
    ok: 'Synchronisé', pending: 'Envoi en attente…', syncing: 'Synchronisation…',
    offline: 'Hors ligne', error: 'Erreur de synchronisation', signedout: 'Non connecté'
  };

  /* Bloc « Synchronisation » de la fenêtre (se redessine quand l'état change). */
  function syncSection() {
    if (!B.sync.enabled()) return null;
    var box = h('section', { class: 'sync-box' });
    function draw() {
      if (!box.isConnected && box.parentNode) return;
      var st = B.sync.status();
      B.ui.clear(box);
      box.appendChild(h('h3', { class: 'section-label' }, 'Synchronisation entre appareils'));

      if (st.status === 'signedout') {
        var email = h('input', { class: 'input', type: 'email', autocomplete: 'username', placeholder: 'E-mail', 'aria-label': 'E-mail' });
        var password = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe', 'aria-label': 'Mot de passe' });
        var message = h('p', { class: 'small sync-message', role: 'status' });
        var buttons = [];
        function run(action) {
          message.className = 'small sync-message';
          message.textContent = 'Connexion…';
          buttons.forEach(function (b) { b.disabled = true; });
          action(email.value, password.value).then(function (res) {
            if (res && res.confirm) {
              message.textContent = 'Compte créé : clique sur le lien reçu par e-mail pour le confirmer, puis connecte-toi ici.';
              buttons.forEach(function (b) { b.disabled = false; });
            }
          }, function (err) {
            message.className = 'small sync-message error';
            message.textContent = err.message;
            buttons.forEach(function (b) { b.disabled = false; });
          });
        }
        var signIn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Se connecter');
        var signUp = h('button', { type: 'button', class: 'btn', onclick: function () { run(B.sync.signUp); } }, 'Créer le compte');
        buttons.push(signIn, signUp);
        box.appendChild(h('p', { class: 'small muted' }, 'Connecte-toi avec le même compte sur chaque appareil (ordinateur, téléphone) pour retrouver partout les mêmes données.'));
        box.appendChild(h('form', {
          class: 'sync-form', novalidate: true,
          onsubmit: function (e) { e.preventDefault(); run(B.sync.signIn); }
        }, email, password, h('div', { class: 'backup-actions' }, signIn, signUp)));
        box.appendChild(message);
        return;
      }

      box.appendChild(h('p', { class: 'sync-line' },
        h('span', { class: 'sync-state ' + st.status }, STATUS_TEXT[st.status] || st.status),
        st.email ? h('span', { class: 'muted' }, ' · ' + st.email) : null));
      if (st.detail) box.appendChild(h('p', { class: 'small ' + (st.status === 'error' ? 'sync-message error' : 'muted') }, st.detail));
      box.appendChild(h('div', { class: 'backup-actions' },
        h('button', { type: 'button', class: 'btn', onclick: function () { B.sync.sync(); } }, icon('arrows-clockwise'), 'Synchroniser maintenant'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { B.sync.signOut(); } }, 'Se déconnecter')));
      box.appendChild(h('button', {
        type: 'button', class: 'btn btn-ghost sync-force',
        onclick: function () {
          B.ui.confirm({
            title: 'Renvoyer les données de cet appareil ?',
            message: 'Les données de cet appareil (' + summary(B.store.get()) + ') vont remplacer celles du compte. ' +
              'Les autres appareils les recevront à leur prochaine synchronisation.

À utiliser si un autre appareil n'affiche pas les bonnes données.',
            confirmLabel: 'Renvoyer', danger: true
          }).then(function (ok) { if (ok) B.sync.forceUpload(); });
        }
      }, icon('upload-simple'), 'Renvoyer les données de cet appareil vers le compte'));
    }
    B.sync.onStatus(function () { if (box.isConnected) draw(); });
    draw();
    return box;
  }

  B.backup = { open: open, summary: summary };
})(window.Bourgeon = window.Bourgeon || {});
