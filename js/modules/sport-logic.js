/*
 * Bourgeon — module SPORT : calculs de course à pied (sans affichage).
 *
 * Tout part de la VMA (vitesse maximale aérobie, en km/h).
 * Données : data.sport = {
 *   vma: 16.5,
 *   planning: [7 textes, lundi → dimanche],
 *   recordBlocks: [{ id, name }],                       — ex. « Course », « Poids du corps »
 *   records: [{ id, blockId, name, value, date, history: [{ value, date }] }],
 *   hrZones: [{ id, name, hr, speed, pace, usage }]     — fréquences cardiaques, saisies à la main
 * }
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

  /* ---------- Records ---------- */

  /*
   * Rien n'est propre à un sport : un BLOC (« Course », « Poids du corps »…)
   * regroupe des EXERCICES (« Test 3000 m », « Max pompes »…), chacun avec
   * son résultat en texte libre (« 11:42 », « 70 », « 100 kg ») et la date
   * du record. Changer le résultat garde l'ancien dans l'historique.
   */
  var MAX_VALUE = 50;

  /* Ordre alphabétique, sans tenir compte des majuscules ni des accents (« Série 2 » avant « Série 10 »). */
  function byName(a, b) { return a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }); }
  function sameName(a, b) { return a.localeCompare(b, 'fr', { sensitivity: 'base' }) === 0; }
  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0] || null; }

  function parseValue(raw) {
    var v = String(raw == null ? '' : raw).trim();
    if (v === '') return { ok: false, error: 'Merci d\'indiquer un résultat.' };
    if (v.length > MAX_VALUE) return { ok: false, error: 'Le résultat doit contenir au plus ' + MAX_VALUE + ' caractères.' };
    return { ok: true, value: v };
  }

  /* Date du record : valide et pas dans le futur. */
  function parseRecordDate(s, today) {
    var r = B.validate.date(s);
    if (!r.ok) return r;
    if (s > (today || D.today())) return { ok: false, error: 'La date ne peut pas être dans le futur.' };
    return r;
  }

  function blockName(data, rawName, exceptId) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom de bloc.');
    if (!name.ok) return name;
    if (data.sport.recordBlocks.some(function (b) { return b.id !== exceptId && sameName(b.name, name.value); })) {
      return { ok: false, error: 'Un bloc porte déjà ce nom.' };
    }
    return name;
  }

  function addBlock(data, rawName) {
    var name = blockName(data, rawName);
    if (!name.ok) return name;
    var block = { id: B.store.newId(), name: name.value };
    data.sport.recordBlocks.push(block);
    return { ok: true, block: block };
  }

  function renameBlock(data, id, rawName) {
    var name = blockName(data, rawName, id);
    if (!name.ok) return name;
    byId(data.sport.recordBlocks, id).name = name.value;
    return { ok: true };
  }

  /* Supprimer un bloc supprime ses exercices. */
  function deleteBlock(data, id) {
    data.sport.recordBlocks = data.sport.recordBlocks.filter(function (b) { return b.id !== id; });
    data.sport.records = data.sport.records.filter(function (r) { return r.blockId !== id; });
  }

  /* Vérifie nom, résultat et date d'un exercice. fields : { name, value, date }. */
  function checkRecord(data, blockId, fields, exceptId, today) {
    var name = B.validate.name(fields.name, 'Merci d\'indiquer un nom d\'exercice.');
    if (!name.ok) return name;
    if (data.sport.records.some(function (r) { return r.blockId === blockId && r.id !== exceptId && sameName(r.name, name.value); })) {
      return { ok: false, error: 'Ce bloc contient déjà un exercice de ce nom.' };
    }
    var value = parseValue(fields.value);
    if (!value.ok) return value;
    var date = parseRecordDate(fields.date, today);
    if (!date.ok) return date;
    return { ok: true, name: name.value, value: value.value, date: date.value };
  }

  function addRecord(data, blockId, fields, today) {
    var c = checkRecord(data, blockId, fields, null, today);
    if (!c.ok) return c;
    var rec = { id: B.store.newId(), blockId: blockId, name: c.name, value: c.value, date: c.date, history: [] };
    data.sport.records.push(rec);
    return { ok: true, record: rec };
  }

  /*
   * Modifie un exercice. Si le résultat change, l'ancien (avec sa date) part
   * dans l'historique ; sinon on corrige simplement le nom ou la date.
   */
  function updateRecord(data, id, fields, today) {
    var rec = byId(data.sport.records, id);
    var c = checkRecord(data, rec.blockId, fields, id, today);
    if (!c.ok) return c;
    if (c.value !== rec.value) {
      rec.history = (rec.history || []).concat([{ value: rec.value, date: rec.date }]);
    }
    rec.name = c.name;
    rec.value = c.value;
    rec.date = c.date;
    return { ok: true };
  }

  function deleteRecord(data, id) {
    data.sport.records = data.sport.records.filter(function (r) { return r.id !== id; });
  }

  /* Anciens résultats d'un exercice, du plus récent au plus ancien. */
  function recordHistory(rec) {
    return (rec.history || []).slice().reverse();
  }

  /* Blocs et leurs exercices, par ordre alphabétique. */
  function recordBoard(data) {
    return data.sport.recordBlocks.slice().sort(byName).map(function (b) {
      return { block: b, records: data.sport.records.filter(function (r) { return r.blockId === b.id; }).sort(byName) };
    });
  }

  /* ---------- Fréquences cardiaques ---------- */

  /*
   * Zones saisies à la main (« Endurance fondamentale », « 130–150 bpm »,
   * « 8,5–9,8 km/h », « 6'10–7'00/km », « ~80 % des séances »), gardées
   * dans l'ordre de saisie. Seul le nom est obligatoire.
   */
  var HR_LIMITS = { hr: ['La FC', 50], speed: ['La vitesse', 50], pace: ['L\'allure', 50], usage: ['L\'usage', 100] };

  function checkHrZone(data, fields, exceptId) {
    var name = B.validate.name(fields.name, 'Merci d\'indiquer un nom de zone.');
    if (!name.ok) return name;
    if (data.sport.hrZones.some(function (z) { return z.id !== exceptId && sameName(z.name, name.value); })) {
      return { ok: false, error: 'Une zone porte déjà ce nom.' };
    }
    var out = { ok: true, name: name.value };
    for (var key in HR_LIMITS) {
      var v = String(fields[key] == null ? '' : fields[key]).trim();
      if (v.length > HR_LIMITS[key][1]) {
        return { ok: false, error: HR_LIMITS[key][0] + ' doit contenir au plus ' + HR_LIMITS[key][1] + ' caractères.' };
      }
      out[key] = v;
    }
    return out;
  }

  /* fields : { name, hr, speed, pace, usage } */
  function addHrZone(data, fields) {
    var c = checkHrZone(data, fields, null);
    if (!c.ok) return c;
    var zone = { id: B.store.newId(), name: c.name, hr: c.hr, speed: c.speed, pace: c.pace, usage: c.usage };
    data.sport.hrZones.push(zone);
    return { ok: true, zone: zone };
  }

  function updateHrZone(data, id, fields) {
    var c = checkHrZone(data, fields, id);
    if (!c.ok) return c;
    var zone = byId(data.sport.hrZones, id);
    ['name', 'hr', 'speed', 'pace', 'usage'].forEach(function (k) { zone[k] = c[k]; });
    return { ok: true };
  }

  function deleteHrZone(data, id) {
    data.sport.hrZones = data.sport.hrZones.filter(function (z) { return z.id !== id; });
  }

  /* Monte (dir = -1) ou descend (dir = 1) une zone dans la liste. */
  function moveHrZone(data, id, dir) {
    var list = data.sport.hrZones;
    var i = list.indexOf(byId(list, id)), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    list.splice(j, 0, list.splice(i, 1)[0]);
  }

  B.sportLogic = {
    parseVma: parseVma, formatKmh: formatKmh, predictions: predictions, zones: zones,
    paceTable: paceTable, PERCENTS: PERCENTS, setVma: setVma, setPlanningDay: setPlanningDay,
    parseValue: parseValue, addBlock: addBlock, renameBlock: renameBlock, deleteBlock: deleteBlock,
    addRecord: addRecord, updateRecord: updateRecord, deleteRecord: deleteRecord,
    recordHistory: recordHistory, recordBoard: recordBoard, findRecord: function (data, id) { return byId(data.sport.records, id); },
    findBlock: function (data, id) { return byId(data.sport.recordBlocks, id); },
    addHrZone: addHrZone, updateHrZone: updateHrZone, deleteHrZone: deleteHrZone, moveHrZone: moveHrZone,
    findHrZone: function (data, id) { return byId(data.sport.hrZones, id); }
  };
})(window.Bourgeon = window.Bourgeon || {});
