/*
 * Bourgeon — tests automatiques des règles de calcul.
 * Ouvrir tests/tests.html dans le navigateur pour les lancer.
 * Chaque nouveau module ajoutera ici les exemples chiffrés du document de
 * référence.
 */
(function (B) {
  'use strict';

  var tests = [];
  function test(name, fn) { tests.push({ name: name, fn: fn }); }

  function eq(actual, expected, label) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error((label ? label + ' : ' : '') + 'obtenu ' + a + ', attendu ' + e);
  }
  function throwsCode(fn, code) {
    try { fn(); } catch (err) { eq(err.code, code, 'code d\'erreur'); return; }
    throw new Error('aucune erreur levée, attendu « ' + code + ' »');
  }

  var D = B.dates, V = B.validate;

  /* ---------- Dates ---------- */

  test('Jour de la semaine (lundi = 0)', function () {
    eq(D.weekdayIndex('2026-08-01'), 5, '1er août 2026 = samedi');
    eq(D.weekdayIndex('2026-03-02'), 0, '2 mars 2026 = lundi');
    eq(D.weekdayIndex('2026-03-08'), 6, '8 mars 2026 = dimanche');
  });

  test('Début de semaine (lundi)', function () {
    eq(D.startOfWeek('2026-03-08'), '2026-03-02');
    eq(D.startOfWeek('2026-03-02'), '2026-03-02');
    eq(D.startOfWeek('2026-01-01'), '2025-12-29');
  });

  test('Ajout et écart de jours (y compris changement d\'heure)', function () {
    eq(D.addDays('2026-03-01', 1), '2026-03-02');
    eq(D.addDays('2026-02-28', 1), '2026-03-01');
    eq(D.addDays('2026-03-28', 2), '2026-03-30');
    eq(D.addDays('2026-10-24', 2), '2026-10-26');
    eq(D.addDays('2026-01-01', -1), '2025-12-31');
    eq(D.diffDays('2026-03-28', '2026-03-30'), 2);
    eq(D.diffDays('2026-03-05', '2026-03-02'), -3);
    eq(D.diffDays('2026-01-01', '2027-01-01'), 365);
  });

  test('Mois : longueur et navigation', function () {
    eq(D.daysInMonth('2026-02'), 28);
    eq(D.daysInMonth('2028-02'), 29);
    eq(D.daysInMonth('2026-08'), 31);
    eq(D.addMonths('2026-01', -1), '2025-12');
    eq(D.addMonths('2026-12', 1), '2027-01');
    eq(D.addMonths('2026-03', 14), '2027-05');
  });

  test('Affichage des dates en français', function () {
    eq(D.formatShort('2026-03-02'), '02/03/2026');
    eq(D.formatLong('2026-03-02'), 'Lundi 2 mars 2026');
    eq(D.monthLabel('2026-08'), 'Août 2026');
    eq(D.parseFR('3/3/2026'), '2026-03-03');
    eq(D.parseFR('31/02/2026'), null);
    eq(D.parseFR('bonjour'), null);
  });

  test('Journée logique (heure de début de journée)', function () {
    var deuxHeures = new Date(2026, 2, 3, 2, 0);
    eq(D.logicalToday(4, deuxHeures), '2026-03-02', 'réglage 4 h, il est 2 h');
    eq(D.logicalToday(0, deuxHeures), '2026-03-03', 'réglage minuit');
    eq(D.logicalToday(4, new Date(2026, 2, 3, 4, 0)), '2026-03-03', 'pile 4 h');
  });

  test('Durées', function () {
    eq(D.formatDuration(2700), '45 min');
    eq(D.formatDuration(7500), '2h05');
    eq(D.formatDuration(4800), '1h20');
    eq(D.formatDuration(59), '0 min');
    eq(D.formatClock(87), '1:27');
    eq(D.formatClock(2424), '40:24');
    eq(D.formatClock(3725), '1:02:05');
  });

  /* ---------- Validation ---------- */

  test('Validation des noms', function () {
    eq(V.name('  Lire  ').value, 'Lire');
    eq(V.name('a').ok, false);
    eq(V.name('   ', 'Merci d\'indiquer un nom d\'objectif.').error, 'Merci d\'indiquer un nom d\'objectif.');
    eq(V.name(new Array(101).join('x')).ok, true, '100 caractères');
    eq(V.name(new Array(102).join('x')).ok, false, '101 caractères');
  });

  test('Validation des dates (2000 → 2100)', function () {
    eq(V.date('2000-01-01').ok, true);
    eq(V.date('2100-12-31').ok, true);
    eq(V.date('1999-12-31').ok, false);
    eq(V.date('2101-01-01').ok, false);
    eq(V.date('2026-02-30').ok, false);
  });

  /* ---------- Stockage ---------- */

  var TEST_KEY = 'bourgeon.test';

  test('Stockage : premier lancement = données par défaut', function () {
    localStorage.removeItem(TEST_KEY);
    var data = B.store.load({ key: TEST_KEY });
    eq(data.version, B.store.VERSION);
    eq(data.sport.vma, 16.5);
    eq(data.revisions.settings.defaultSteps, [1, 7, 30, 90]);
    eq(localStorage.getItem(TEST_KEY) !== null, true, 'enregistré');
  });

  test('Stockage : une modification est enregistrée', function () {
    localStorage.removeItem(TEST_KEY);
    B.store.load({ key: TEST_KEY });
    B.store.update(function (d) { d.sport.vma = 17; });
    eq(B.store.load({ key: TEST_KEY }).sport.vma, 17);
  });

  test('Stockage : rubriques manquantes complétées', function () {
    localStorage.setItem(TEST_KEY, JSON.stringify({ version: 1, sport: { vma: 15 }, revisions: { settings: { dayStartHour: 4 } } }));
    var data = B.store.load({ key: TEST_KEY });
    eq(data.sport.vma, 15, 'valeur existante gardée');
    eq(data.revisions.settings.dayStartHour, 4, 'réglage existant gardé');
    eq(data.revisions.settings.defaultSteps, [1, 7, 30, 90], 'réglage manquant ajouté');
    eq(data.journal.entries, {}, 'rubrique manquante ajoutée');
  });

  test('Stockage : données illisibles jamais écrasées', function () {
    localStorage.setItem(TEST_KEY, '{ pas du json');
    throwsCode(function () { B.store.load({ key: TEST_KEY }); }, 'corrupt');
    eq(localStorage.getItem(TEST_KEY), '{ pas du json');
    localStorage.setItem(TEST_KEY, JSON.stringify({ version: 999 }));
    throwsCode(function () { B.store.load({ key: TEST_KEY }); }, 'tooNew');
    localStorage.removeItem(TEST_KEY);
  });

  /* ---------- Journal ---------- */

  var J = B.modules.journal.logic;
  function journalData(entries) { var d = B.store.defaultData(); d.journal.entries = entries || {}; return d; }

  test('Journal : texte nettoyé, remplacé, supprimé si vide', function () {
    var d = journalData();
    eq(J.setText(d, '2026-03-02', '  Bonne journée \n'), true);
    eq(J.getText(d, '2026-03-02'), 'Bonne journée');
    eq(J.setText(d, '2026-03-02', 'Bonne journée'), false, 'texte identique = pas de changement');
    J.setText(d, '2026-03-02', 'Autre texte');
    eq(J.getText(d, '2026-03-02'), 'Autre texte', 'une seule entrée par date');
    eq(Object.keys(d.journal.entries).length, 1);
    J.setText(d, '2026-03-02', '   ');
    eq('2026-03-02' in d.journal.entries, false, 'texte vide = entrée retirée');
    eq(J.setText(d, '2026-03-05', ''), false, 'rien à enregistrer');
  });

  test('Journal : aperçu de 240 caractères', function () {
    var long = new Array(301).join('a');
    eq(J.preview(long).length, 241);
    eq(J.preview(long).slice(-1), '…');
    eq(J.preview('Court'), 'Court');
    eq(J.preview(new Array(241).join('b')).length, 240, '240 pile : pas de « … »');
  });

  test('Journal : historique trié, sans le jour ouvert ni les jours vides', function () {
    var d = journalData({
      '2026-03-01': { text: 'Un' },
      '2026-03-03': { text: 'Trois' },
      '2026-03-02': { text: 'Deux' },
      '2026-02-27': { text: '' }
    });
    eq(J.history(d, '2026-03-03').map(function (x) { return x.date; }), ['2026-03-02', '2026-03-01']);
    eq(J.history(d, '2026-03-10').length, 3);
  });

  test('Journal : pas de futur', function () {
    eq(J.clampToToday('2026-03-04', '2026-03-03'), '2026-03-03');
    eq(J.clampToToday('2026-03-01', '2026-03-03'), '2026-03-01');
    eq(J.relativeLabel('2026-03-03', '2026-03-03'), 'Aujourd\'hui');
    eq(J.relativeLabel('2026-03-02', '2026-03-03'), 'Hier');
    eq(J.relativeLabel('2026-02-26', '2026-03-03'), 'Il y a 5 jours');
  });

  /* ---------- Objectifs ---------- */

  var G = B.modules.goals.logic;

  test('Objectifs : ajout et validation', function () {
    var d = B.store.defaultData();
    eq(G.addGoal(d, '   ', '2026-06-15', '2026-03-03').error, 'Merci d\'indiquer un nom d\'objectif.');
    eq(G.addGoal(d, 'X', '2026-06-15', '2026-03-03').error, 'Le nom doit contenir entre 2 et 100 caractères.');
    eq(G.addGoal(d, 'Semi', '', '2026-03-03').ok, false, 'date vide');
    eq(G.addGoal(d, 'Semi', '2101-01-01', '2026-03-03').ok, false, 'date hors bornes');
    eq(d.goals.items.length, 0, 'rien ajouté en cas d\'erreur');
    var r = G.addGoal(d, '  Courir un semi ', '2026-06-15', '2026-03-03');
    eq(r.ok, true);
    eq([r.goal.name, r.goal.status, r.goal.note], ['Courir un semi', 'active', '']);
  });

  test('Objectifs : tri par échéance', function () {
    var d = B.store.defaultData();
    G.addGoal(d, 'Tard', '2026-12-01', '2026-03-01');
    G.addGoal(d, 'Tôt', '2026-04-01', '2026-03-02');
    G.addGoal(d, 'Tôt bis', '2026-04-01', '2026-03-03');
    eq(G.sortedGoals(d).map(function (g) { return g.name; }), ['Tôt', 'Tôt bis', 'Tard']);
  });

  test('Objectifs : décompte des jours (singulier / pluriel)', function () {
    var g = { deadline: '2026-06-15', status: 'active' };
    eq(G.deadlineInfo(g, '2026-03-03').date, 'Échéance : 15/06/2026');
    eq(G.deadlineInfo(g, '2026-03-03').countdown, '104 jours restants');
    eq(G.deadlineInfo(g, '2026-06-14').countdown, '1 jour restant');
    eq(G.deadlineInfo(g, '2026-06-15').countdown, 'échéance aujourd\'hui');
    eq(G.deadlineInfo(g, '2026-06-16').countdown, 'échéance dépassée depuis 1 jour');
    var late = G.deadlineInfo({ deadline: '2026-02-01', status: 'active' }, '2026-03-03');
    eq([late.countdown, late.overdue], ['échéance dépassée depuis 30 jours', true]);
    eq(G.deadlineInfo({ deadline: '2026-02-01', status: 'done' }, '2026-03-03').countdown, '', 'pas de décompte si atteint');
    eq(G.deadlineInfo({ deadline: '2026-02-01', status: 'abandoned' }, '2026-03-03').overdue, false);
  });

  test('Objectifs : reporter l\'échéance', function () {
    var d = B.store.defaultData();
    var id = G.addGoal(d, 'Dossier', '2026-09-27', '2026-09-01').goal.id;
    eq(G.setDeadline(d, id, '2026-10-15').ok, true);
    eq(d.goals.items[0].deadline, '2026-10-15');
    eq(G.setDeadline(d, id, '').ok, false, 'date vide refusée');
    eq(G.setDeadline(d, id, '2101-01-01').ok, false);
    eq(d.goals.items[0].deadline, '2026-10-15', 'inchangée après refus');
  });

  test('Objectifs : statut, note, suppression', function () {
    var d = B.store.defaultData();
    var id = G.addGoal(d, 'Lire 10 livres', '2026-12-31', '2026-03-03').goal.id;
    G.setStatus(d, id, 'done');
    G.setNote(d, id, '  7 lus  ');
    eq([d.goals.items[0].status, d.goals.items[0].note], ['done', '7 lus']);
    G.removeGoal(d, id);
    eq(d.goals.items.length, 0);
  });

  /* ---------- Habitudes ---------- */

  var HL = B.habitsLogic;

  /* Crée une habitude à une date donnée et coche les jours indiqués. */
  function habitWith(d, name, createdAt, days) {
    var x = HL.addHabit(d, name, createdAt).habit;
    (days || []).forEach(function (day) { HL.toggleCheck(d, x.id, day, '2099-12-31'); });
    return x;
  }

  test('Habitudes : cible par défaut = jours du mois de création', function () {
    var d = B.store.defaultData();
    eq(HL.addHabit(d, 'Lire', '2026-02-10').habit.baseTarget, 28);
    eq(HL.addHabit(d, 'Méditer', '2026-08-31').habit.baseTarget, 31);
    eq(HL.addHabit(d, ' ', '2026-08-31').error, 'Merci d\'indiquer un nom d\'habitude.');
    eq(d.habits.items.map(function (x) { return x.position; }), [0, 1]);
  });

  test('Habitudes : objectif mensuel par mois (exemple du document)', function () {
    var d = B.store.defaultData();
    var x = HL.addHabit(d, 'Lire', '2026-01-05').habit;
    HL.setTarget(d, x.id, '2026-01', '20');
    HL.setTarget(d, x.id, '2026-03', '10');
    HL.setTarget(d, x.id, '2026-05', '15');
    var months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
    eq(months.map(function (m) { return HL.targetFor(d, x, m); }), [20, 20, 10, 10, 15, 15]);
    HL.setTarget(d, x.id, '2026-04', '12');
    eq(months.map(function (m) { return HL.targetFor(d, x, m); }), [20, 20, 10, 12, 15, 15], 'modifier avril ne change qu\'avril');
    eq(HL.setTarget(d, x.id, '2026-04', '1000').ok, false);
    eq(HL.setTarget(d, x.id, '2026-04', '2,5').ok, false);
    eq(HL.setTarget(d, x.id, '2026-04', '').ok, false);
  });

  test('Habitudes : total attendu janvier → avril = 60', function () {
    var d = B.store.defaultData();
    var x = HL.addHabit(d, 'Lire', '2026-01-05').habit;
    HL.setTarget(d, x.id, '2026-01', '20');
    HL.setTarget(d, x.id, '2026-03', '10');
    HL.setTarget(d, x.id, '2026-05', '15');
    eq(HL.expectedTotal(d, x, '2026-04'), 60);
    x.archivedAt = '2026-03-15';
    eq(HL.expectedTotal(d, x, '2026-04'), 40, 'archivée en mars : on s\'arrête à février');
  });

  test('Habitudes : présence dans un mois (création, archivage)', function () {
    var d = B.store.defaultData();
    var a = HL.addHabit(d, 'Créée le 20', '2026-03-20').habit;
    var b = HL.addHabit(d, 'Archivée en mars', '2026-01-01').habit;
    HL.archiveHabit(d, b.id, '2026-03-10');
    var names = function (m) { return HL.habitsForMonth(d, m).map(function (x) { return x.name; }); };
    eq(names('2026-02'), ['Archivée en mars']);
    eq(names('2026-03'), ['Créée le 20'], 'créée le 20 : visible tout le mois ; archivée : disparaît');
    eq(names('2026-04'), ['Créée le 20']);
  });

  test('Habitudes : chiffres du mois (fait, reste, %)', function () {
    var d = B.store.defaultData();
    var x = habitWith(d, 'Lire', '2026-03-01', ['2026-03-01', '2026-03-02', '2026-03-03', '2026-02-28']);
    HL.setTarget(d, x.id, '2026-03', '2');
    eq(HL.monthStats(d, x, '2026-03'), { done: 3, target: 2, rest: 0, pct: 150 }, 'peut dépasser 100 %');
    HL.setTarget(d, x.id, '2026-03', '0');
    eq(HL.monthStats(d, x, '2026-03').pct, 0, 'cible 0 → 0 %');
    HL.setTarget(d, x.id, '2026-03', '4');
    var y = habitWith(d, 'Eau', '2026-03-01', ['2026-03-01']);
    HL.setTarget(d, y.id, '2026-03', '4');
    eq(HL.monthCompletion(d, '2026-03'), { done: 4, target: 8, rest: 4, pct: 50 });
    eq(HL.ranking(d, '2026-03').map(function (r) { return r.habit.name; }), ['Lire', 'Eau']);
  });

  test('Habitudes : jours futurs bloqués', function () {
    var d = B.store.defaultData();
    var x = HL.addHabit(d, 'Lire', '2026-03-01').habit;
    eq(HL.toggleCheck(d, x.id, '2026-03-04', '2026-03-03'), false);
    eq(HL.toggleCheck(d, x.id, '2026-03-03', '2026-03-03'), true);
    eq(HL.toggleCheck(d, x.id, '2026-03-03', '2026-03-03'), false, 'décocher');
  });

  test('Habitudes : semaines calendaires (août 2026)', function () {
    eq(HL.weeksOfMonth('2026-08').map(function (w) { return w.from + '-' + w.to; }),
      ['1-2', '3-9', '10-16', '17-23', '24-30', '31-31']);
    var d = B.store.defaultData();
    habitWith(d, 'Aa', '2026-08-01', ['2026-08-01']);
    habitWith(d, 'Bb', '2026-08-01', ['2026-08-01', '2026-08-02', '2026-08-31']);
    var recap = HL.weeklyRecap(d, '2026-08');
    eq(recap[0], { from: 1, to: 2, label: '1–2', pct: 75 }, '3 coches / (2 habitudes × 2 jours)');
    eq([recap[5].label, recap[5].pct], ['31', 50]);
  });

  test('Habitudes : aperçu mensuel qui s\'arrête à aujourd\'hui', function () {
    var d = B.store.defaultData();
    habitWith(d, 'Aa', '2026-03-01', ['2026-03-02']);
    habitWith(d, 'Bb', '2026-03-01', []);
    var curve = HL.dailyCurve(d, '2026-03', '2026-03-05');
    eq(curve.length, 5);
    eq(curve.map(function (p) { return p.pct; }), [0, 50, 0, 0, 0]);
    eq(HL.dailyCurve(d, '2026-02', '2026-03-05').length, 28, 'mois passé complet');
  });

  test('Habitudes : séries (en cours et record)', function () {
    var c = { '2026-03-01': true, '2026-03-02': true, '2026-03-04': true, '2026-03-05': true, '2026-03-06': true };
    eq(HL.currentStreak(c, '2026-03-06'), 3, 'aujourd\'hui coché');
    eq(HL.currentStreak(c, '2026-03-07'), 3, 'aujourd\'hui pas encore coché : on compte jusqu\'à hier');
    eq(HL.currentStreak(c, '2026-03-08'), 0, 'hier manqué : série cassée');
    eq(HL.bestStreak(c), 3);
    eq(HL.bestStreak({ '2026-02-27': true, '2026-02-28': true, '2026-03-01': true }), 3, 'à cheval sur deux mois');
    eq(HL.bestStreak({}), 0);
  });

  test('Habitudes : réussite plafonnée et 12 derniers mois', function () {
    eq(HL.successRate(70, 60), 100);
    eq(HL.successRate(30, 60), 50);
    eq(HL.successRate(0, 0), 0);
    var d = B.store.defaultData();
    var x = habitWith(d, 'Lire', '2026-02-10', ['2026-02-11', '2026-03-01', '2026-03-02']);
    HL.setTarget(d, x.id, '2026-02', '4');
    var months = HL.last12Months(d, x, '2026-03');
    eq(months.length, 12);
    eq(months[11].label, 'Mars 2026 — 2 fois');
    eq([months[10].pct, months[11].pct, months[9].pct], [25, 50, 0]);
    var g = HL.globalStats(d, '2026-03-02');
    eq([g.count, g.totalDone, g.bestCurrentStreak, g.globalRate], [1, 3, 2, 38], '3 / (4 + 4)');
  });

  test('Habitudes : suppression définitive en cascade', function () {
    var d = B.store.defaultData();
    var x = habitWith(d, 'Lire', '2026-03-01', ['2026-03-01']);
    HL.setTarget(d, x.id, '2026-03', '5');
    HL.deleteHabit(d, x.id);
    eq([d.habits.items.length, d.habits.targets.length, x.id in d.habits.checks], [0, 0, false]);
  });

  /* ---------- Révisions ---------- */

  var RL = B.revisionsLogic;

  /* Matière « Maths » > chapitre « Intégrales » > concept ajouté le 1er mars. */
  function revData(addedAt) {
    var d = B.store.defaultData();
    var s = RL.addSubject(d, 'Maths').subject;
    var ch = RL.addChapter(d, s.id, 'Intégrales').chapter;
    var c = RL.addConcept(d, ch.id, 'Intégration par parties', addedAt || '2026-03-01').concept;
    return { d: d, s: s, ch: ch, c: c };
  }
  function states(st) { return st.cells.map(function (x) { return x.state; }).join(' '); }

  test('Révisions : paliers saisis (virgules, doublons, tri, erreurs)', function () {
    eq(RL.parseSteps(' 30, 1,7, 7 ,90').steps, [1, 7, 30, 90]);
    eq(RL.parseSteps('').error, 'Il faut au moins un palier.');
    eq(RL.parseSteps(' , ').error, 'Il faut au moins un palier.');
    eq(RL.parseSteps('0,5').error, 'Les paliers doivent être des nombres de jours strictement positifs.');
    eq(RL.parseSteps('1,a').ok, false);
    eq(RL.parseSteps('2.5').ok, false);
  });

  test('Révisions : chapitres et concepts classés par ordre alphabétique', function () {
    var t = revData();
    ['chap 10 Séries', 'Chap 2 Suites', 'Équations'].forEach(function (n) { RL.addChapter(t.d, t.s.id, n); });
    eq(RL.chaptersOf(t.d, t.s.id).map(function (c) { return c.name; }),
      ['Chap 2 Suites', 'chap 10 Séries', 'Équations', 'Intégrales'], 'nombres lus comme des nombres, sans tenir compte des majuscules ni des accents');
    ['cours 10', 'Arithmétique', 'cours 02'].forEach(function (n) { RL.addConcept(t.d, t.ch.id, n, '2026-03-01'); });
    eq(RL.conceptsOf(t.d, t.ch.id).map(function (c) { return c.name; }),
      ['Arithmétique', 'cours 02', 'cours 10', 'Intégration par parties']);
  });

  test('Révisions : tags (création, doublons, renommage, suppression)', function () {
    var t = revData();
    eq(RL.addTag(t.d, ' ').ok, false, 'nom vide refusé');
    var soir = RL.addTag(t.d, 'Soir').tag;
    RL.addTag(t.d, 'Bibliothèque');
    eq(RL.addTag(t.d, 'soir').error, 'Un tag porte déjà ce nom.');
    eq(RL.sortedTags(t.d).map(function (x) { return x.name; }), ['Bibliothèque', 'Soir'], 'ordre alphabétique');
    eq(RL.renameTag(t.d, soir.id, 'Bibliothèque').ok, false, 'renommage en doublon refusé');
    RL.renameTag(t.d, soir.id, 'Matin');
    RL.setConceptTag(t.d, t.c.id, soir.id);
    eq(RL.tagOf(t.d, t.c).name, 'Matin');
    RL.deleteTag(t.d, soir.id);
    eq([RL.tagOf(t.d, t.c), t.c.tagId, t.d.revisions.tags.length], [null, null, 1], 'supprimé : retiré des cours');
  });

  test('Révisions : le tag reste jusqu\'à la validation du cours', function () {
    var t = revData();
    var tag = RL.addTag(t.d, 'Matin').tag;
    RL.setConceptTag(t.d, t.c.id, tag.id);
    RL.undo(t.d, t.c.id, '2026-03-02');
    eq(t.c.tagId, tag.id, 'gardé tant que le cours n\'est pas validé');
    RL.validate(t.d, t.c.id, '2026-03-02');
    eq(t.c.tagId, null, 'retiré à la validation');
  });

  test('Révisions : « Aujourd\'hui » regroupé par tag (alphabétique, sans tag à la fin)', function () {
    var t = revData();
    var c2 = RL.addConcept(t.d, t.ch.id, 'Changement de variable', '2026-03-01').concept;
    var c3 = RL.addConcept(t.d, t.ch.id, 'Primitives', '2026-03-01').concept;
    var soir = RL.addTag(t.d, 'Soir').tag, matin = RL.addTag(t.d, 'Matin').tag;
    RL.addTag(t.d, 'Vide');
    RL.setConceptTag(t.d, c2.id, soir.id);
    RL.setConceptTag(t.d, c3.id, matin.id);
    var groups = RL.groupByTag(t.d, RL.todayList(t.d, '2026-03-05'));
    eq(groups.map(function (g) { return (g.tag ? g.tag.name : '—') + ':' + g.items.map(function (i) { return i.concept.name; }).join(','); }),
      ['Matin:Primitives', 'Soir:Changement de variable', '—:Intégration par parties'], 'groupes vides omis');
  });

  test('Révisions : premier palier = date d\'ajout + J+1', function () {
    var t = revData();
    var st = RL.stateOf(t.d, t.c, '2026-03-01');
    eq([st.due, st.label, st.isDue, states(st)], ['2026-03-02', 'J+1', false, 'todo locked locked locked']);
    eq(RL.stateOf(t.d, t.c, '2026-03-02').isDue, true, 'dû aujourd\'hui');
    eq(RL.stateOf(t.d, t.c, '2026-03-02').late, false, 'dû aujourd\'hui = pas encore en retard');
    eq(RL.stateOf(t.d, t.c, '2026-03-03').late, true);
  });

  test('Révisions : échéances ancrées sur la date réelle de validation', function () {
    var t = revData();
    RL.validate(t.d, t.c.id, '2026-03-02');
    eq(RL.stateOf(t.d, t.c, '2026-03-02').due, '2026-03-08', 'à l\'heure : 1er + 7');
    var u = revData();
    RL.validate(u.d, u.c.id, '2026-03-05');
    var st = RL.stateOf(u.d, u.c, '2026-03-05');
    eq([st.due, st.label], ['2026-03-11', 'J+7'], 'en retard : 5 + 6 = 11 mars');
    var e = revData();
    RL.validate(e.d, e.c.id, '2026-03-01');
    eq(RL.stateOf(e.d, e.c, '2026-03-01').due, '2026-03-07', 'en avance : ancré sur le jour même');
  });

  test('Révisions : ordre imposé et annulation du dernier palier', function () {
    var t = revData();
    RL.validate(t.d, t.c.id, '2026-03-02');
    RL.validate(t.d, t.c.id, '2026-03-08');
    var st = RL.stateOf(t.d, t.c, '2026-03-10');
    eq(states(st), 'done done todo locked');
    eq(st.cells.map(function (x) { return x.canUndo; }), [false, true, false, false], 'seul le dernier validé est annulable');
    eq(RL.undo(t.d, t.c.id, '2026-03-10'), true);
    st = RL.stateOf(t.d, t.c, '2026-03-10');
    eq([states(st), st.due, st.late], ['done late locked locked', '2026-03-08', true], 'retrouve son ancienne échéance');
  });

  test('Révisions : entretien (dernier palier répété)', function () {
    var t = revData();
    ['2026-03-02', '2026-03-08', '2026-03-31', '2026-05-30'].forEach(function (day) { RL.validate(t.d, t.c.id, day); });
    var st = RL.stateOf(t.d, t.c, '2026-06-01');
    eq([st.inMaintenance, st.due, states(st), t.c.lastMaintenance], [true, '2026-08-28', 'done done done done', '2026-05-30']);
    eq(st.cells[3].canUndo, true, 'erreur corrigeable juste après l\'entrée en entretien');
    eq(RL.validate(t.d, t.c.id, '2026-06-01'), false, 'pas avant l\'échéance');
    st = RL.stateOf(t.d, t.c, '2026-08-28');
    eq([states(st), st.isDue], ['done done done todo', true], 'la case se « décoche » à l\'échéance');
    RL.validate(t.d, t.c.id, '2026-08-30');
    st = RL.stateOf(t.d, t.c, '2026-08-30');
    eq([st.due, states(st), st.cells[3].canUndo], ['2026-11-28', 'done done done done', false], 'cochée : plus décochable');
    eq(t.c.validations.length, 4);
  });

  test('Révisions : changer de rythme garde la progression', function () {
    var t = revData();
    RL.validate(t.d, t.c.id, '2026-03-02');
    RL.validate(t.d, t.c.id, '2026-03-08');
    var type = RL.addStepType(t.d, 'Intensif', '1,3,7,14').type;
    RL.setSubjectStepType(t.d, t.s.id, type.id);
    var st = RL.stateOf(t.d, t.c, '2026-03-08');
    eq([states(st), st.label, st.due], ['done done todo locked', 'J+7', '2026-03-12'], '2 paliers gardés');
    var court = RL.addStepType(t.d, 'Court', '1,2').type;
    RL.setSubjectStepType(t.d, t.s.id, court.id);
    st = RL.stateOf(t.d, t.c, '2026-03-08');
    eq([st.inMaintenance, st.due], [true, '2026-03-10'], 'plus de paliers validés que le rythme : entretien');
    RL.deleteStepType(t.d, court.id);
    eq(t.s.stepTypeId, null, 'type supprimé : retour au rythme par défaut');
    eq(RL.stepsForSubject(t.d, t.s), [1, 7, 30, 90]);
    eq(RL.addStepType(t.d, 'intensif', '2').error, 'Un type de palier porte déjà ce nom.');
  });

  test('Révisions : liste du jour (tri, gel, retard)', function () {
    var t = revData('2026-03-01');
    var c2 = RL.addConcept(t.d, t.ch.id, 'Changement de variable', '2026-03-03').concept;
    RL.addConcept(t.d, t.ch.id, 'Pas encore dû', '2026-03-05');
    var list = RL.todayList(t.d, '2026-03-04');
    eq(list.map(function (x) { return x.concept.name; }), ['Intégration par parties', 'Changement de variable']);
    eq(list.map(function (x) { return x.state.lateDays; }), [2, 0]);
    RL.toggleFreeze(t.d, 'subject', t.s.id, '2026-03-04');
    eq(RL.todayList(t.d, '2026-03-04').length, 0, 'matière gelée : rien');
    RL.toggleFreeze(t.d, 'subject', t.s.id, '2026-03-04');
    RL.toggleFreeze(t.d, 'concept', c2.id, '2026-03-04');
    eq(RL.todayList(t.d, '2026-03-04').length, 1, 'concept gelé');
    RL.toggleFreeze(t.d, 'concept', c2.id, '2026-03-04');
    eq(RL.todayList(t.d, '2026-03-20')[0].state.lateDays, 18, 'le gel ne suspend pas le calendrier');
  });

  test('Révisions : taille du titre selon le retard', function () {
    eq([0, 1, 2, 3, 4, 12].map(function (n) { var s = RL.lateStyle(n); return s.size + '/' + s.weight; }),
      ['13/400', '17/600', '19/600', '21/700', '22/700', '22/700']);
  });

  test('Révisions : noms uniques et suppressions en cascade', function () {
    var t = revData();
    eq(RL.addSubject(t.d, ' maths ').error, 'Une matière porte déjà ce nom.');
    var other = RL.addSubject(t.d, 'Chimie').subject;
    eq(RL.rename(t.d, 'subject', other.id, 'MATHS').error, 'Une matière porte déjà ce nom.');
    eq(RL.rename(t.d, 'subject', t.s.id, 'Maths').ok, true, 'garder son propre nom');
    RL.deleteSubject(t.d, t.s.id);
    var r = t.d.revisions;
    eq([r.subjects.length, r.chapters.length, r.concepts.length], [1, 0, 0]);
  });

  /* ---------- Focus ---------- */

  var FL = B.focusLogic;
  var MIN = 60000;   // une minute en millisecondes
  var T0 = new Date(2026, 2, 3, 14, 30).getTime();   // 03/03/2026 14:30

  test('Focus : vérification des réglages', function () {
    eq(FL.validateConfig({ target: 'chapter', mode: 'chrono' }).error, 'Merci de choisir une matière.');
    eq(FL.validateConfig({ target: 'chapter', subjectId: 's', mode: 'chrono' }).error, 'Merci de choisir un chapitre.');
    eq(FL.validateConfig({ target: 'subject', mode: 'chrono' }).config.subjectId, null, 'sans matière autorisé');
    eq(FL.validateConfig({ target: 'subject', mode: 'sablier', hours: '', minutes: '45' }).config.plannedSec, 2700, 'champ vide = 0');
    eq(FL.validateConfig({ target: 'subject', mode: 'sablier', hours: '0', minutes: '0' }).error, 'Merci de vérifier les durées saisies.');
    eq(FL.validateConfig({ target: 'subject', mode: 'sablier', hours: '24', minutes: '0' }).ok, false);
    eq(FL.validateConfig({ target: 'subject', mode: 'sablier', hours: '1', minutes: '60' }).ok, false);
    eq(FL.validateConfig({ target: 'subject', mode: 'pomodoro', work: '25', brk: '5' }).config.breakSec, 300);
    eq(FL.validateConfig({ target: 'subject', mode: 'pomodoro', work: '0', brk: '5' }).ok, false);
    eq(FL.validateConfig({ target: 'subject', mode: 'pomodoro', work: '301', brk: '5' }).ok, false);
  });

  test('Focus : la pause n\'est jamais comptée', function () {
    var a = FL.startSession({ mode: 'chrono' }, T0);
    FL.pause(a, T0 + 10 * MIN);
    eq(FL.elapsedSec(a, T0 + 13 * MIN), 600, 'figé pendant la pause');
    FL.resume(a, T0 + 15 * MIN);
    FL.pause(a, T0 + 18 * MIN);
    FL.resume(a, T0 + 19 * MIN);
    eq(FL.elapsedSec(a, T0 + 25 * MIN), 19 * 60, '25 min − 5 − 1 de pauses');
    var s = FL.stopSession(a, T0 + 25 * MIN);
    eq([s.duration, s.completed, s.day], [19 * 60, true, '2026-03-03'], 'chrono arrêté = Terminée');
  });

  test('Focus : pomodoro 25/5 arrêté après 1 h 10 (exemple du document)', function () {
    var a = FL.startSession({ mode: 'pomodoro', workSec: 1500, breakSec: 300 }, T0);
    var p = FL.pomodoro(a, T0 + 27 * MIN);
    eq([p.phase, p.remaining, p.cycle, p.workDone], ['break', 180, 1, 1500]);
    p = FL.pomodoro(a, T0 + 70 * MIN);
    eq([p.phase, p.remaining, p.cycle], ['work', 900, 3]);
    var s = FL.stopSession(a, T0 + 70 * MIN);
    eq([s.duration, s.workCycles, s.completed], [3600, 2, true], '25 + 25 + 10 = 60 min, 2 cycles');
  });

  test('Focus : sablier terminé ou interrompu', function () {
    var a = FL.startSession({ mode: 'sablier', plannedSec: 2700 }, T0);
    eq(FL.display(a, T0 + 15 * MIN).seconds, 1800, 'temps restant');
    var early = FL.stopSession(a, T0 + 20 * MIN);
    eq([early.completed, early.duration], [false, 1200], 'arrêté avant la fin = Interrompue');
    var b = FL.startSession({ mode: 'sablier', plannedSec: 2700 }, T0);
    FL.pause(b, T0 + 10 * MIN); FL.resume(b, T0 + 12 * MIN);
    eq(FL.display(b, T0 + 46 * MIN).finished, false, 'la pause repousse la fin');
    var full = FL.stopSession(b, T0 + 50 * MIN);
    eq([full.completed, full.duration, full.endedAt], [true, 2700, T0 + 47 * MIN]);
  });

  test('Focus : session rattachée au jour de son début', function () {
    var night = new Date(2026, 2, 3, 23, 50).getTime();
    var s = FL.stopSession(FL.startSession({ mode: 'chrono' }, night), night + 30 * MIN);
    eq(s.day, '2026-03-03');
  });

  test('Focus : matière ou chapitre supprimés pendant la session', function () {
    var t = revData();
    var s = { subjectId: t.s.id, chapterId: t.ch.id };
    eq(FL.targetLabel(t.d, s.subjectId, s.chapterId), 'Maths · Intégrales');
    RL.deleteChapter(t.d, t.ch.id);
    eq(FL.targetLabel(t.d, s.subjectId, s.chapterId, true), 'Maths · Chapitre supprimé');
    FL.attachToExisting(t.d, s);
    eq([s.subjectId, s.chapterId], [t.s.id, null], 'gardée sur la matière');
    RL.deleteSubject(t.d, t.s.id);
    eq(FL.targetLabel(t.d, s.subjectId, null, true), 'Matière supprimée');
    FL.attachToExisting(t.d, s);
    eq(FL.targetLabel(t.d, s.subjectId, s.chapterId), 'Sans matière');
  });

  test('Focus : récap par matière et période', function () {
    var t = revData();
    var chimie = RL.addSubject(t.d, 'Chimie').subject;
    function add(subjectId, day, min) { t.d.focus.sessions.push({ subjectId: subjectId, day: day, duration: min * 60, startedAt: 0 }); }
    add(t.s.id, '2026-03-02', 30);      // lundi
    add(t.s.id, '2026-03-04', 45);
    add(chimie.id, '2026-03-03', 100);
    add(null, '2026-03-01', 20);        // dimanche précédent
    add('supprimee', '2026-03-03', 10);
    var week = FL.recapBySubject(t.d, 'week', '2026-03-04');
    eq(week.map(function (r) { return r.name + ':' + D.formatDuration(r.seconds); }), ['Chimie:1h40', 'Maths:1h15', 'Sans matière:10 min']);
    eq(week[1].ratio, 0.75);
    eq(FL.recapBySubject(t.d, 'month', '2026-03-04').length, 3);
    eq(FL.recapBySubject(t.d, 'all', '2026-03-04')[2].seconds, 30 * 60, 'sans matière + matière supprimée');
    eq(FL.recapBySubject(t.d, 'week', '2026-03-09').length, 0);
  });

  test('Focus : carte de chaleur 8 semaines', function () {
    var d = B.store.defaultData();
    d.focus.sessions.push({ day: '2026-03-03', duration: 4800 }, { day: '2026-03-02', duration: 9000 });
    var hm = FL.heatmap(d, '2026-03-04');
    eq([hm.length, hm[7].length], [8, 7]);
    eq(hm[7][0].date, '2026-03-02', 'dernière colonne = semaine en cours');
    eq(hm[0][0].date, '2026-01-12');
    eq([hm[7][1].label, hm[7][1].intensity], ['03/03/2026 — 1h20', 4800 / 7200]);
    eq(hm[7][0].intensity, 1, 'plafond à 2 h');
    eq(hm[7][2].label, '04/03/2026 — aucune session');
    eq(hm[7][3], null, 'jour futur non affiché');
  });

  test('Focus : affichage du temps', function () {
    eq([FL.formatTimer(90), FL.formatTimer(3725), FL.formatTimer(0)], ['01:30', '1:02:05', '00:00']);
    eq(FL.formatStart(T0), '03/03 14:30');
  });

  /* ---------- Eisenhower ---------- */

  var EL = B.eisenhowerLogic;
  function zoneTexts(d, z) { return EL.tasksIn(d, z).map(function (t) { return t.text + t.rank; }).join(' '); }

  test('Eisenhower : ajout uniquement dans « Non triées »', function () {
    var d = B.store.defaultData();
    eq(EL.addTask(d, ' ', '').error, 'Merci d\'indiquer une tâche.');
    eq(EL.addTask(d, 'x', '').ok, false);
    var t = EL.addTask(d, '  Réviser les intégrales ', ' avant l\'exam ').task;
    eq([t.zone, t.rank, t.text, t.deadline, t.done], [0, 0, 'Réviser les intégrales', 'avant l\'exam', false]);
    eq(EL.addTask(d, 'Appeler Léa', '').task.rank, 1, 'ajoutée à la fin');
  });

  test('Eisenhower : déplacer et réordonner (rangs recalculés)', function () {
    var d = B.store.defaultData();
    var a = EL.addTask(d, 'Aa', '').task, b = EL.addTask(d, 'Bb', '').task, c = EL.addTask(d, 'Cc', '').task;
    EL.moveTask(d, b.id, 1, null);
    eq([zoneTexts(d, 0), zoneTexts(d, 1)], ['Aa0 Cc1', 'Bb0'], 'vers un quadrant, zone d\'origine renumérotée');
    EL.moveTask(d, c.id, 1, b.id);
    eq(zoneTexts(d, 1), 'Cc0 Bb1', 'la position de lâcher détermine l\'ordre');
    EL.moveTask(d, c.id, 1, null);
    eq(zoneTexts(d, 1), 'Bb0 Cc1', 'réordonner dans la même zone');
    EL.moveTask(d, b.id, 0, a.id);
    eq([zoneTexts(d, 0), zoneTexts(d, 1)], ['Bb0 Aa1', 'Cc0'], 'retour dans « Non triées »');
    eq(EL.moveTask(d, a.id, 0, a.id), false, 'avant elle-même : rien');
  });

  test('Eisenhower : faite, édition, suppression', function () {
    var d = B.store.defaultData();
    var a = EL.addTask(d, 'Aa', '').task, b = EL.addTask(d, 'Bb', '').task;
    EL.moveTask(d, a.id, 2, null);
    eq(EL.toggleDone(d, a.id), true);
    eq(a.zone, 2, 'une tâche faite reste à sa place');
    eq(EL.editTask(d, b.id, '', 'lundi').ok, false);
    EL.editTask(d, b.id, 'Bb modifiée', ' lundi ');
    eq([b.text, b.deadline], ['Bb modifiée', 'lundi']);
    var c = EL.addTask(d, 'Cc', '').task;
    EL.deleteTask(d, b.id);
    eq([d.eisenhower.tasks.length, c.rank], [2, 0]);
  });

  test('Eisenhower : monter / descendre', function () {
    eq(EL.neighbourTarget(['a', 'b', 'c'], 'b', -1), { beforeId: 'a' });
    eq(EL.neighbourTarget(['a', 'b', 'c'], 'a', -1), null);
    eq(EL.neighbourTarget(['a', 'b', 'c'], 'a', 1), { beforeId: 'c' });
    eq(EL.neighbourTarget(['a', 'b', 'c'], 'b', 1), { beforeId: null });
    eq(EL.neighbourTarget(['a', 'b', 'c'], 'c', 1), null);
  });

  /* ---------- Sport ---------- */

  var SL = B.sportLogic;

  test('Sport : saisie de la VMA', function () {
    eq(SL.parseVma('16,5').value, 16.5);
    eq(SL.parseVma(' 17.25 ').value, 17.25);
    eq(SL.parseVma('abc').error, 'Merci de saisir un nombre valide.');
    eq(SL.parseVma('').error, 'Merci de saisir un nombre valide.');
    eq(SL.parseVma('0').error, 'La VMA doit être positive.');
    eq(SL.parseVma('-3').error, 'La VMA doit être positive.');
  });

  test('Sport : prédictions de Riegel (VMA 16,5 → 10 km en 40:24)', function () {
    var p = SL.predictions(16.5);
    eq(p.map(function (x) { return x.label + ' ' + x.text; }),
      ['5 km 19:23', '10 km 40:24', 'Semi-marathon 1:29:09', 'Marathon 3:05:52']);
  });

  test('Sport : zones d\'effort au milieu de la fourchette', function () {
    var z = SL.zones(16.5);
    eq([z[0].name, z[0].range, z[0].speedText, z[0].paceText], ['Endurance fondamentale', '60–70 %', '10,7', '5:36/km']);
    eq([z[4].speedText, z[4].paceText], ['17,3', '3:28/km'], 'VMA courte : 105 %');
  });

  test('Sport : tableau des temps de passage', function () {
    var t = SL.paceTable(16.5);
    eq([t.length, t[0].times.length], [13, 9]);
    eq([t[3].label, t[3].times[2]], ['400 m', '1:27'], '400 m à 100 %');
    eq([t[12].label, t[12].times[4]], ['10 km', '40:24'], '10 km à 90 % = référence Riegel');
    eq(t[9].label, '1 km');
  });

  test('Sport : planning de la semaine type', function () {
    var d = B.store.defaultData();
    SL.setPlanningDay(d, 3, '  Fractionné 10×400  ');
    eq(d.sport.planning, ['', '', '', 'Fractionné 10×400', '', '', '']);
    eq(SL.setVma(d, '17,5').ok, true);
    eq(d.sport.vma, 17.5);
    SL.setVma(d, 'x');
    eq(d.sport.vma, 17.5, 'valeur invalide : inchangée');
  });

  test('Sport : blocs de records (créer, renommer, supprimer)', function () {
    var d = B.store.defaultData();
    eq([d.sport.recordBlocks, d.sport.records], [[], []]);
    var course = SL.addBlock(d, '  Course ').block;
    eq(course.name, 'Course');
    eq(SL.addBlock(d, 'course').error, 'Un bloc porte déjà ce nom.');
    eq(SL.addBlock(d, '').error, 'Merci d\'indiquer un nom de bloc.');
    var pdc = SL.addBlock(d, 'Poids du corps').block;
    eq(SL.renameBlock(d, pdc.id, 'COURSE').error, 'Un bloc porte déjà ce nom.');
    eq(SL.renameBlock(d, pdc.id, 'Gainage').ok, true);
    eq(SL.recordBoard(d).map(function (g) { return g.block.name; }), ['Course', 'Gainage'], 'ordre alphabétique');
    SL.addRecord(d, course.id, { name: 'Test 3000 m', value: '11:42', date: '2026-10-01' }, '2026-10-06');
    SL.addRecord(d, pdc.id, { name: 'Max pompes', value: '70', date: '2026-10-01' }, '2026-10-06');
    SL.deleteBlock(d, course.id);
    eq(d.sport.recordBlocks.length, 1);
    eq(d.sport.records.map(function (r) { return r.name; }), ['Max pompes'], 'exercices du bloc supprimés avec lui');
  });

  test('Sport : records (saisie, mise à jour, historique)', function () {
    var d = B.store.defaultData();
    var b = SL.addBlock(d, 'Poids du corps').block;
    var today = '2026-10-06';
    var r = SL.addRecord(d, b.id, { name: 'Max pompes', value: ' 70 ', date: '2026-10-01' }, today);
    eq([r.ok, r.record.value, r.record.date, r.record.history], [true, '70', '2026-10-01', []]);
    eq(SL.addRecord(d, b.id, { name: 'max POMPES', value: '1', date: today }, today).error, 'Ce bloc contient déjà un exercice de ce nom.');
    eq(SL.addRecord(d, b.id, { name: 'Tractions', value: '', date: today }, today).error, 'Merci d\'indiquer un résultat.');
    eq(SL.addRecord(d, b.id, { name: 'Tractions', value: '12', date: '2026-10-07' }, today).error, 'La date ne peut pas être dans le futur.');
    eq(SL.addRecord(d, b.id, { name: 'Tractions', value: '12', date: '' }, today).error, 'Merci d\'indiquer une date valide.');
    eq(SL.parseValue(new Array(52).join('x')).error, 'Le résultat doit contenir au plus 50 caractères.');
    var id = r.record.id;
    // Nouveau résultat : l'ancien part dans l'historique
    SL.updateRecord(d, id, { name: 'Max pompes', value: '75', date: today }, today);
    // Même résultat, date corrigée : pas d'historique en plus
    SL.updateRecord(d, id, { name: 'Pompes (max)', value: '75', date: '2026-10-05' }, today);
    SL.updateRecord(d, id, { name: 'Pompes (max)', value: '80', date: today }, today);
    var rec = SL.findRecord(d, id);
    eq([rec.name, rec.value, rec.date], ['Pompes (max)', '80', today]);
    eq(SL.recordHistory(rec), [{ value: '75', date: '2026-10-05' }, { value: '70', date: '2026-10-01' }], 'plus récent d\'abord');
    SL.addRecord(d, b.id, { name: 'Gainage', value: '2 min 30', date: today }, today);
    eq(SL.recordBoard(d)[0].records.map(function (x) { return x.name; }), ['Gainage', 'Pompes (max)']);
    SL.deleteRecord(d, id);
    eq(d.sport.records.length, 1);
  });

  test('Sport : records ajoutés aux anciennes données', function () {
    var old = { version: 1, sport: { vma: 15, planning: ['', '', '', '', '', '', ''] } };
    var d = B.store.parse(JSON.stringify(old)).data;
    eq([d.sport.vma, d.sport.recordBlocks, d.sport.records, d.sport.hrZones], [15, [], [], []]);
  });

  test('Sport : fréquences cardiaques (saisie, ordre, suppression)', function () {
    var d = B.store.defaultData();
    eq(d.sport.hrZones, []);
    var ef = SL.addHrZone(d, { name: ' Endurance fondamentale (EF) ', hr: ' 130–150 bpm ', speed: '8,5–9,8 km/h', pace: '6\'10–7\'00/km', usage: '~80 % de tes séances' });
    eq([ef.ok, ef.zone.name, ef.zone.hr], [true, 'Endurance fondamentale (EF)', '130–150 bpm']);
    eq(SL.addHrZone(d, { name: '' }).error, 'Merci d\'indiquer un nom de zone.');
    eq(SL.addHrZone(d, { name: 'endurance FONDAMENTALE (ef)' }).error, 'Une zone porte déjà ce nom.');
    eq(SL.addHrZone(d, { name: 'Seuil', hr: new Array(52).join('x') }).error, 'La FC doit contenir au plus 50 caractères.');
    var vma = SL.addHrZone(d, { name: 'VMA', hr: '> 180 bpm' }).zone;
    eq([vma.speed, vma.pace, vma.usage], ['', '', ''], 'champs facultatifs');
    var seuil = SL.addHrZone(d, { name: 'Seuil', hr: '165–175 bpm' }).zone;
    SL.moveHrZone(d, seuil.id, -1);
    eq(d.sport.hrZones.map(function (z) { return z.name; }), ['Endurance fondamentale (EF)', 'Seuil', 'VMA']);
    SL.moveHrZone(d, ef.zone.id, -1);
    eq(d.sport.hrZones[0].name, 'Endurance fondamentale (EF)', 'déjà en tête : inchangé');
    eq(SL.updateHrZone(d, vma.id, { name: 'Seuil' }).error, 'Une zone porte déjà ce nom.');
    SL.updateHrZone(d, vma.id, { name: 'VMA', hr: '> 182 bpm', usage: 'Fractionné court' });
    eq([SL.findHrZone(d, vma.id).hr, SL.findHrZone(d, vma.id).usage], ['> 182 bpm', 'Fractionné court']);
    SL.deleteHrZone(d, seuil.id);
    eq(d.sport.hrZones.length, 2);
  });

  /* ---------- Synchronisation ---------- */

  var SY = B.sync.logic;

  test('Synchro : modules modifiés repérés', function () {
    var d = B.store.defaultData();
    var snaps = {};
    SY.SECTIONS.forEach(function (s) { snaps[s] = JSON.stringify(d[s]); });
    eq(SY.changedSections(d, snaps), []);
    d.sport.vma = 15;
    d.journal.entries['2026-10-01'] = { text: 'x' };
    eq(SY.changedSections(d, snaps), ['journal', 'sport']);
  });

  test('Synchro : journal fusionné jour par jour', function () {
    var local = { entries: { '2026-09-30': { text: 'ici', updatedAt: '2026-10-01T08:00:00Z' }, '2026-09-29': { text: 'A', updatedAt: '2026-09-29T20:00:00Z' } } };
    var remote = { entries: { '2026-09-30': { text: 'là-bas', updatedAt: '2026-10-01T09:00:00Z' }, '2026-09-28': { text: 'B', updatedAt: '2026-09-28T20:00:00Z' } } };
    var m = SY.mergeJournal(local, remote);
    eq(Object.keys(m.entries).sort(), ['2026-09-28', '2026-09-29', '2026-09-30']);
    eq(m.entries['2026-09-30'].text, 'là-bas', 'le plus récent gagne');
  });

  test('Synchro : arbitrage des conflits', function () {
    eq(SY.resolveConflict('journal', '2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z'), 'merge');
    eq(SY.resolveConflict('habits', '2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z'), 'remote');
    eq(SY.resolveConflict('habits', '2026-10-01T10:00:00Z', '2026-10-01T09:00:00Z'), 'local');
  });

  test('Synchro : appareil vide ou non', function () {
    var d = B.store.defaultData();
    eq(SY.isEmpty(d), true);
    d.focus.settings.alerts = false;
    eq(SY.isEmpty(d), true, 'un réglage ne compte pas');
    d.goals.items.push({});
    eq(SY.isEmpty(d), false);
  });

  /* ---------- Lancement ---------- */

  function run() {
    var results = tests.map(function (t) {
      try { t.fn(); return { name: t.name, ok: true }; }
      catch (err) { return { name: t.name, ok: false, error: err.message }; }
    });
    localStorage.removeItem(TEST_KEY);
    return results;
  }

  B.tests = { run: run };
})(window.Bourgeon = window.Bourgeon || {});
