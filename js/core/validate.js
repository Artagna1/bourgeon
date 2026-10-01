/*
 * Bourgeon — validation des saisies.
 *
 * Chaque fonction renvoie { ok: true, value } ou { ok: false, error }.
 * Le message d'erreur est prêt à être affiché sous le formulaire.
 */
(function (B) {
  'use strict';

  var MIN_DATE = '2000-01-01';
  var MAX_DATE = '2100-12-31';

  /*
   * Nom (habitude, objectif, tâche, matière, chapitre, concept, type de
   * palier) : entre 2 et 100 caractères, espaces de début et de fin retirés.
   * emptyMessage permet un message propre au formulaire quand le champ est vide
   * (ex. « Merci d'indiquer un nom d'objectif. »).
   */
  function name(raw, emptyMessage) {
    var value = String(raw == null ? '' : raw).trim();
    if (value === '' && emptyMessage) return { ok: false, error: emptyMessage };
    if (value.length < 2 || value.length > 100) {
      return { ok: false, error: 'Le nom doit contenir entre 2 et 100 caractères.' };
    }
    return { ok: true, value: value };
  }

  /* Date "AAAA-MM-JJ" comprise entre le 01/01/2000 et le 31/12/2100. */
  function date(s) {
    if (!B.dates.isValidStr(s)) return { ok: false, error: 'Merci d\'indiquer une date valide.' };
    if (s < MIN_DATE || s > MAX_DATE) {
      return { ok: false, error: 'La date doit être comprise entre le 01/01/2000 et le 31/12/2100.' };
    }
    return { ok: true, value: s };
  }

  B.validate = { name: name, date: date, MIN_DATE: MIN_DATE, MAX_DATE: MAX_DATE };
})(window.Bourgeon = window.Bourgeon || {});
