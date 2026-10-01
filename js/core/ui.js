/*
 * Bourgeon — petits outils d'interface partagés par tous les modules.
 */
(function (B) {
  'use strict';

  /*
   * Crée un élément HTML.
   *   h('button', { class: 'btn', onclick: fn, text: 'OK' })
   *   h('div', { class: 'card' }, enfant1, [enfant2, enfant3], 'du texte')
   * Propriétés spéciales : class, text, style, value, on<événement>.
   * Les valeurs null / undefined / false sont ignorées.
   */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k === 'value') el.value = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    append(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function append(parent, children) {
    children.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) append(parent, c);
      else parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
  }

  /*
   * Icône Phosphor : icon('timer') -> <i class="ph ph-timer">.
   * style : 'ph' (contour, par défaut), 'ph-fill' (pleine) ou 'ph-bold' (épaisse).
   */
  function icon(name, extraClass, style) {
    return h('i', { class: (style || 'ph') + ' ph-' + name + (extraClass ? ' ' + extraClass : ''), 'aria-hidden': 'true' });
  }

  /* Bouton rond en losange du coin de l'en-tête (mobile). */
  function cornerButton(iconName, label, onclick, pressed) {
    return h('button', {
      type: 'button', class: 'corner-btn', title: label, 'aria-label': label, onclick: onclick,
      'aria-pressed': pressed === undefined ? null : (pressed ? 'true' : 'false')
    }, icon(iconName, null, 'ph-bold'));
  }

  /* Séparateur décoratif : deux filets et un losange au centre. */
  function ornament(extraClass) {
    return h('div', { class: 'ornament' + (extraClass ? ' ' + extraClass : ''), 'aria-hidden': 'true' },
      h('span', { class: 'ornament-line' }), h('span', { class: 'ornament-gem' }), h('span', { class: 'ornament-line' }));
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /*
   * Sélecteur segmenté (sous-onglets, choix de mode…).
   * options : [{ id, label }], onChange(id) appelé au clic.
   */
  function segmented(options, currentId, onChange, ariaLabel) {
    return h('div', { class: 'segmented', role: 'tablist', 'aria-label': ariaLabel || null },
      options.map(function (o) {
        var active = o.id === currentId;
        return h('button', {
          type: 'button', role: 'tab', class: active ? 'active' : null,
          'aria-selected': active ? 'true' : 'false',
          onclick: function () { if (!active) onChange(o.id); }
        }, o.label);
      })
    );
  }

  /* Zone de message d'erreur à placer sous un formulaire. */
  function formError() {
    return h('p', { class: 'form-error', role: 'alert', 'aria-live': 'polite' });
  }
  function setError(el, message) {
    el.textContent = message || '';
  }

  /* Affiche brièvement « ✓ Enregistré » dans l'élément donné. */
  function flashSaved(el) {
    clear(el);
    append(el, [icon('check', null, 'ph-bold'), 'Enregistré']);
    el.classList.add('visible');
    clearTimeout(el._flashTimer);
    el._flashTimer = setTimeout(function () { el.classList.remove('visible'); }, 2500);
  }

  /* --- Fenêtres modales --- */

  /*
   * Ouvre une fenêtre modale. onClose(valeur) est appelé une seule fois :
   *   - au clic sur un bouton d'un formulaire method="dialog" (valeur = value
   *     du bouton), traité tout de suite ;
   *   - à la fermeture par Échap ou par dlg.finish(valeur).
   */
  function openDialog(content, onClose) {
    var dlg = h('dialog', { class: 'modal' }, content);
    var finished = false;
    function finish(value) {
      if (finished) return;
      finished = true;
      if (dlg.open) dlg.close(value || '');
      dlg.remove();
      if (onClose) onClose(value || '');
    }
    dlg.addEventListener('submit', function (e) {
      if (e.target.getAttribute('method') !== 'dialog') return;   // formulaires internes
      e.preventDefault();
      finish(e.submitter ? e.submitter.value : '');
    });
    dlg.addEventListener('close', function () { finish(dlg.returnValue); });
    dlg.finish = finish;
    document.body.appendChild(dlg);
    dlg.showModal();
    return dlg;
  }

  /*
   * Demande une confirmation. Renvoie une promesse : true si l'utilisateur
   * confirme. Pour une action destructrice, danger: true colore le bouton en
   * rouge et c'est « Annuler » qui a le focus par défaut.
   *   ui.confirm({ title, message, confirmLabel, danger }).then(function (ok) { … })
   */
  function confirm(opts) {
    return new Promise(function (resolve) {
      var cancelBtn = h('button', { type: 'submit', value: 'cancel', class: 'btn' }, 'Annuler');
      var okBtn = h('button', { type: 'submit', value: 'ok', class: opts.danger ? 'btn btn-danger' : 'btn btn-primary' },
        opts.confirmLabel || 'Confirmer');
      var dlg = openDialog(
        h('form', { method: 'dialog' },
          h('h2', { class: 'modal-title' }, opts.title || 'Confirmation'),
          h('p', { class: 'modal-text' }, opts.message || ''),
          h('div', { class: 'modal-actions' }, cancelBtn, okBtn)
        ),
        function (value) { resolve(value === 'ok'); }
      );
      (opts.danger ? cancelBtn : okBtn).focus();
      return dlg;
    });
  }

  /* Affiche une erreur inattendue, pour que rien ne se perde en silence. */
  var errorOpen = false;
  function showError(err) {
    if (errorOpen) return;      // évite d'empiler des dizaines de fenêtres
    errorOpen = true;
    var message = (err && err.message) || String(err);
    var details = err && err.stack ? err.stack : '';
    openDialog(
      h('form', { method: 'dialog' },
        h('h2', { class: 'modal-title danger' }, 'Une erreur inattendue est survenue'),
        h('p', { class: 'modal-text' }, message),
        details ? h('details', { class: 'modal-details' }, h('summary', null, 'Détails techniques'), h('pre', null, details)) : null,
        h('div', { class: 'modal-actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Fermer'))
      ),
      function () { errorOpen = false; }
    );
  }

  /* Accord singulier / pluriel : plural(2, 'jour restant', 'jours restants') -> "2 jours restants". */
  function plural(n, singular, pluralForm) {
    return n + ' ' + (Math.abs(n) >= 2 ? pluralForm : singular);
  }

  B.ui = {
    h: h, icon: icon, ornament: ornament, cornerButton: cornerButton, append: append, clear: clear, segmented: segmented,
    formError: formError, setError: setError, flashSaved: flashSaved,
    openDialog: openDialog, confirm: confirm, showError: showError, plural: plural
  };
})(window.Bourgeon = window.Bourgeon || {});
