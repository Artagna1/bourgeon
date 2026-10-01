/*
 * Bourgeon — module SPORT : calculs de course à pied (sans affichage).
 *
 * Tout part de la VMA (vitesse maximale aérobie, en km/h).
 * Données : data.sport = { vma: 16.5, planning: [7 textes, lundi → dimanche] }
 */
(function (B) {
  'use strict';

  var D = B.dates;

  /* « 16,5 » ou « 16.5 » -> 16.5. Renvoie { ok, value } ou { ok: false, error }. */
  function parseVma(raw) {
    var s = String(raw == null ? '' : raw).trim().replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'Merci de saisir un nombre valide.' };
    var v = parseFloat(s);
    if (!(v > 0)) return { ok: false, error: 'La VMA doit être positive.' };
    return { ok: true, value: v };
  }

  /* 16.5 -> « 16,5 » ; 10.725 -> « 10,7 » */
  function formatKmh(v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }

  /* Temps (secondes) pour couvrir distanceKm à vitesseKmh. */
  function timeFor(distanceKm, speedKmh) { return distanceKm / speedKmh * 3600; }

  /*
   * Prédiction de chronos (Riegel) :
   *   1. allure de référence 10 km = 90 % de la VMA ;
   *   2. T = T(10 km) × (distance ÷ 10) ^ 1,06.
   */
  var RACES = [
    { label: '5 km', km: 5 },
    { label: '10 km', km: 10 },
    { label: 'Semi-marathon', km: 21.0975 },
    { label: 'Marathon', km: 42.195 }
  ];
  function predictions(vma) {
    var t10 = timeFor(10, vma * 0.9);
    return RACES.map(function (r) {
      var sec = t10 * Math.pow(r.km / 10, 1.06);
      return { label: r.label, km: r.km, seconds: sec, text: D.formatClock(sec), speed: r.km / sec * 3600 };
    });
  }

  /* Zones d'effort : vitesse et allure calculées au MILIEU de la fourchette. */
  var ZONES = [
    { name: 'Endurance fondamentale', lo: 60, hi: 70, usage: 'Sorties longues, récupération active' },
    { name: 'Endurance active', lo: 70, hi: 80, usage: 'Footing soutenu, sorties actives' },
    { name: 'Seuil / Tempo', lo: 80, hi: 90, usage: 'Allure semi-marathon, tempo run' },
    { name: 'VMA longue', lo: 90, hi: 100, usage: 'Fractionné long (1000-2000 m)' },
    { name: 'VMA courte / Sprint', lo: 100, hi: 110, usage: 'Fractionné court (30/30, 200-400 m)' }
  ];
  function zones(vma) {
    return ZONES.map(function (z) {
      var speed = vma * (z.lo + z.hi) / 2 / 100;
      var pace = 3600 / speed;
      return { name: z.name, range: z.lo + '–' + z.hi + ' %', usage: z.usage, speed: speed,
        speedText: formatKmh(speed), paceText: D.formatClock(pace) + '/km' };
    });
  }

  /* Tableau croisé : temps = distance ÷ (VMA × %). */
  var DISTANCES = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 5000, 10000];
  var PERCENTS = [110, 105, 100, 95, 90, 85, 80, 75, 70];
  function distanceLabel(m) { return m < 1000 ? m + ' m' : (m / 1000) + ' km'; }
  function paceTable(vma) {
    return DISTANCES.map(function (m) {
      return {
        label: distanceLabel(m),
        times: PERCENTS.map(function (p) { return D.formatClock(timeFor(m / 1000, vma * p / 100)); })
      };
    });
  }

  function setVma(data, raw) {
    var r = parseVma(raw);
    if (r.ok) data.sport.vma = r.value;
    return r;
  }

  function setPlanningDay(data, dayIndex, raw) {
    data.sport.planning[dayIndex] = String(raw == null ? '' : raw).trim();
  }

  B.sportLogic = {
    parseVma: parseVma, formatKmh: formatKmh, predictions: predictions, zones: zones,
    paceTable: paceTable, PERCENTS: PERCENTS, setVma: setVma, setPlanningDay: setPlanningDay
  };
})(window.Bourgeon = window.Bourgeon || {});
