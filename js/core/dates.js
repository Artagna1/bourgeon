/*
 * Bourgeon — outils de dates et de durées.
 *
 * Convention : dans toute l'application, un jour est une chaîne "AAAA-MM-JJ"
 * (ex. "2026-03-02") exprimée en heure LOCALE, et un mois une chaîne
 * "AAAA-MM". On évite volontairement toISOString(), qui travaille en UTC et
 * décalerait les dates d'un jour selon l'heure.
 * Les semaines commencent le lundi.
 */
(function (B) {
  'use strict';

  var JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* Date JavaScript -> "AAAA-MM-JJ" (heure locale). */
  function toStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* "AAAA-MM-JJ" -> Date locale à midi (midi évite les pièges du changement d'heure). */
  function parse(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12);
  }

  /* Vrai si la chaîne est une date "AAAA-MM-JJ" qui existe vraiment. */
  function isValidStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return toStr(parse(s)) === s;
  }

  function today() { return toStr(new Date()); }

  function addDays(s, n) {
    var d = parse(s);
    d.setDate(d.getDate() + n);
    return toStr(d);
  }

  /* Nombre de jours entre a et b (b − a). Positif si b est après a. */
  function diffDays(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    var ta = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]);
    var tb = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
    return Math.round((tb - ta) / 86400000);
  }

  /* Jour de la semaine, 0 = lundi … 6 = dimanche. */
  function weekdayIndex(s) { return (parse(s).getDay() + 6) % 7; }

  /* Lundi de la semaine du jour donné. */
  function startOfWeek(s) { return addDays(s, -weekdayIndex(s)); }

  /* --- Mois ("AAAA-MM") --- */

  function monthKey(s) { return s.slice(0, 7); }
  function currentMonth() { return monthKey(today()); }

  /* Nombre de jours du mois "AAAA-MM". */
  function daysInMonth(key) {
    return new Date(+key.slice(0, 4), +key.slice(5, 7), 0).getDate();
  }

  function addMonths(key, n) {
    var y = +key.slice(0, 4);
    var m = +key.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }

  /* Jour "AAAA-MM-JJ" à partir d'un mois et d'un numéro de jour. */
  function dayOfMonth(key, day) { return key + '-' + pad(day); }

  /* --- Affichage --- */

  /* "2026-03-02" -> "02/03/2026" */
  function formatShort(s) {
    var p = s.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  /* "2026-03-02" -> "Lundi 2 mars 2026" */
  function formatLong(s) {
    var d = parse(s);
    return cap(JOURS[weekdayIndex(s)]) + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* "2026-03" -> "Mars 2026" */
  function monthLabel(key) {
    return cap(MOIS[+key.slice(5, 7) - 1]) + ' ' + key.slice(0, 4);
  }

  /* "jj/mm/aaaa" -> "AAAA-MM-JJ", ou null si la date n'existe pas. */
  function parseFR(str) {
    var m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(str || '');
    if (!m) return null;
    var s = m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    return isValidStr(s) ? s : null;
  }

  /*
   * « Journée logique » : avant l'heure de début de journée (0 à 11 h), on est
   * encore la veille. Utilisé uniquement par le module Révisions.
   */
  function logicalToday(dayStartHour, now) {
    var d = now ? new Date(now.getTime()) : new Date();
    if (d.getHours() < (dayStartHour || 0)) d.setDate(d.getDate() - 1);
    return toStr(d);
  }

  /* --- Durées (en secondes) --- */

  /* 2700 -> "45 min", 7500 -> "2h05" */
  function formatDuration(sec) {
    var min = Math.floor(Math.max(0, sec) / 60);
    if (min < 60) return min + ' min';
    return Math.floor(min / 60) + 'h' + pad(min % 60);
  }

  /* 87 -> "1:27", 2424 -> "40:24", 3725 -> "1:02:05" */
  function formatClock(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  B.dates = {
    JOURS: JOURS, MOIS: MOIS, pad: pad,
    toStr: toStr, parse: parse, isValidStr: isValidStr, today: today,
    addDays: addDays, diffDays: diffDays, weekdayIndex: weekdayIndex, startOfWeek: startOfWeek,
    monthKey: monthKey, currentMonth: currentMonth, daysInMonth: daysInMonth,
    addMonths: addMonths, dayOfMonth: dayOfMonth,
    formatShort: formatShort, formatLong: formatLong, monthLabel: monthLabel, parseFR: parseFR,
    logicalToday: logicalToday, formatDuration: formatDuration, formatClock: formatClock
  };
})(window.Bourgeon = window.Bourgeon || {});
