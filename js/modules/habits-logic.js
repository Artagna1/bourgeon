/*
 * Bourgeon — module HABITUDES : règles de calcul (sans affichage).
 *
 * Données :
 *   data.habits.items   = [{ id, name, position, baseTarget, createdAt, archivedAt }]
 *   data.habits.targets = [{ habitId, month: "AAAA-MM", target }]
 *       Un changement d'objectif vaut pour son mois ET les suivants, jusqu'au
 *       prochain changement. baseTarget vaut depuis la création.
 *   data.habits.checks  = { habitId: { "AAAA-MM-JJ": true } }
 *
 * Toutes ces fonctions sont testées dans tests/tests.js.
 */
(function (B) {
  'use strict';

  var D = B.dates;

  /* ---------- Outils ---------- */

  function lastDay(month) { return D.dayOfMonth(month, D.daysInMonth(month)); }

  function findHabit(data, id) {
    return data.habits.items.filter(function (x) { return x.id === id; })[0];
  }

  function checksOf(data, id) { return data.habits.checks[id] || {}; }

  /* Nombre de coches entre deux dates incluses. */
  function countBetween(checks, from, to) {
    var n = 0;
    Object.keys(checks).forEach(function (d) { if (checks[d] && d >= from && d <= to) n++; });
    return n;
  }

  /* Niveau de réussite : ≥ 80 % vert, ≥ 50 % orange, sinon rouge. */
  function level(pct) { return pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'danger'; }

  /* ---------- Création, modification ---------- */

  /* Nouvelle habitude : cible par défaut = nombre de jours du mois de création. */
  function addHabit(data, rawName, today) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom d\'habitude.');
    if (!name.ok) return name;
    var items = data.habits.items;
    var position = items.reduce(function (max, x) { return Math.max(max, x.position + 1); }, 0);
    var habit = {
      id: B.store.newId(), name: name.value, position: position,
      baseTarget: D.daysInMonth(D.monthKey(today)), createdAt: today, archivedAt: null
    };
    items.push(habit);
    return { ok: true, habit: habit };
  }

  function renameHabit(data, id, rawName) {
    var name = B.validate.name(rawName, 'Merci d\'indiquer un nom d\'habitude.');
    if (!name.ok) return name;
    findHabit(data, id).name = name.value;
    return { ok: true };
  }

  /* Objectif du mois : le dernier changement fait ce mois-ci ou avant. */
  function targetFor(data, habit, month) {
    var best = null;
    data.habits.targets.forEach(function (t) {
      if (t.habitId === habit.id && t.month <= month && (!best || t.month > best.month)) best = t;
    });
    return best ? best.target : habit.baseTarget;
  }

  /* Change l'objectif du mois affiché (et des suivants jusqu'au prochain changement). */
  function setTarget(data, id, month, raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!/^\d{1,3}$/.test(s)) return { ok: false, error: 'La cible doit être un nombre entier entre 0 et 999.' };
    var value = parseInt(s, 10);
    var existing = data.habits.targets.filter(function (t) { return t.habitId === id && t.month === month; })[0];
    if (existing) existing.target = value;
    else data.habits.targets.push({ habitId: id, month: month, target: value });
    return { ok: true, value: value };
  }

  /* Coche / décoche un jour. Les jours futurs sont bloqués. Renvoie le nouvel état. */
  function toggleCheck(data, id, date, today) {
    var checks = data.habits.checks[id] || (data.habits.checks[id] = {});
    if (date > today) return !!checks[date];
    if (checks[date]) delete checks[date];
    else checks[date] = true;
    return !!checks[date];
  }

  function archiveHabit(data, id, today) {
    findHabit(data, id).archivedAt = today;
  }

  /* Suppression définitive : l'habitude, ses coches et ses changements d'objectif. */
  function deleteHabit(data, id) {
    data.habits.items = data.habits.items.filter(function (x) { return x.id !== id; });
    data.habits.targets = data.habits.targets.filter(function (t) { return t.habitId !== id; });
    delete data.habits.checks[id];
  }

  /* ---------- Onglet MOIS ---------- */

  /*
   * Habitudes d'un mois : créées avant la fin du mois ET non archivées avant
   * la fin du mois (une habitude archivée disparaît du mois de son archivage).
   */
  function habitsForMonth(data, month) {
    var end = lastDay(month);
    return data.habits.items
      .filter(function (x) {
        if (x.createdAt > end) return false;
        if (x.archivedAt && D.monthKey(x.archivedAt) <= month) return false;
        return true;
      })
      .sort(function (a, b) { return a.position - b.position; });
  }

  /* Chiffres d'une habitude pour un mois : fait, cible, reste, %. */
  function monthStats(data, habit, month) {
    var done = countBetween(checksOf(data, habit.id), D.dayOfMonth(month, 1), lastDay(month));
    var target = targetFor(data, habit, month);
    return {
      done: done,
      target: target,
      rest: Math.max(target - done, 0),
      pct: target > 0 ? Math.round(done / target * 100) : 0
    };
  }

  /* Complétion du mois : somme des « fait » ÷ somme des cibles. */
  function monthCompletion(data, month) {
    var done = 0, target = 0;
    habitsForMonth(data, month).forEach(function (x) {
      var s = monthStats(data, x, month);
      done += s.done;
      target += s.target;
    });
    return {
      done: done, target: target, rest: Math.max(target - done, 0),
      pct: target > 0 ? Math.round(done / target * 100) : 0
    };
  }

  /* Classement : habitudes du mois par % décroissant. */
  function ranking(data, month) {
    return habitsForMonth(data, month)
      .map(function (x) { return { habit: x, stats: monthStats(data, x, month) }; })
      .sort(function (a, b) { return b.stats.pct - a.stats.pct || a.habit.position - b.habit.position; });
  }

  /*
   * Aperçu mensuel : pour chaque jour, % des habitudes cochées. Pour le mois
   * en cours, la courbe s'arrête à aujourd'hui.
   */
  function dailyCurve(data, month, today) {
    var habits = habitsForMonth(data, month);
    var n = D.daysInMonth(month);
    var last = month === D.monthKey(today) ? +today.slice(8, 10) : (month > D.monthKey(today) ? 0 : n);
    var points = [];
    for (var day = 1; day <= last; day++) {
      var date = D.dayOfMonth(month, day);
      var count = habits.filter(function (x) { return checksOf(data, x.id)[date]; }).length;
      points.push({ day: day, date: date, pct: habits.length ? Math.round(count / habits.length * 100) : 0 });
    }
    return points;
  }

  /* Semaines calendaires (lundi → dimanche) coupées aux bords du mois. */
  function weeksOfMonth(month) {
    var n = D.daysInMonth(month), weeks = [], start = 1;
    for (var day = 1; day <= n; day++) {
      if (day === n || D.weekdayIndex(D.dayOfMonth(month, day)) === 6) {
        weeks.push({ from: start, to: day });
        start = day + 1;
      }
    }
    return weeks;
  }

  /* Récap hebdomadaire : coches de la semaine ÷ (habitudes × jours de la semaine dans le mois). */
  function weeklyRecap(data, month) {
    var habits = habitsForMonth(data, month);
    return weeksOfMonth(month).map(function (w) {
      var from = D.dayOfMonth(month, w.from), to = D.dayOfMonth(month, w.to);
      var count = habits.reduce(function (sum, x) { return sum + countBetween(checksOf(data, x.id), from, to); }, 0);
      var slots = habits.length * (w.to - w.from + 1);
      return {
        from: w.from, to: w.to,
        label: w.from === w.to ? String(w.from) : w.from + '–' + w.to,
        pct: slots ? Math.round(count / slots * 100) : 0
      };
    });
  }

  /* ---------- Onglet GLOBAL ---------- */

  /*
   * Série actuelle : jours consécutifs cochés se terminant aujourd'hui. Si
   * aujourd'hui n'est pas encore coché, on compte jusqu'à hier (la série
   * n'est pas cassée tant que la journée n'est pas finie).
   */
  function currentStreak(checks, today) {
    var d = checks[today] ? today : D.addDays(today, -1);
    var n = 0;
    while (checks[d]) { n++; d = D.addDays(d, -1); }
    return n;
  }

  /* Record : plus longue suite de jours consécutifs cochés. */
  function bestStreak(checks) {
    var dates = Object.keys(checks).filter(function (d) { return checks[d]; }).sort();
    var best = 0, run = 0, prev = null;
    dates.forEach(function (d) {
      run = prev && D.diffDays(prev, d) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    });
    return best;
  }

  /*
   * Total attendu : somme des objectifs de chaque mois, du mois de création au
   * mois en cours inclus, chacun avec l'objectif qui était le sien.
   * Habitude archivée : on s'arrête au mois précédant l'archivage (elle
   * n'apparaît plus à partir du mois de son archivage).
   */
  function expectedTotal(data, habit, currentMonth) {
    var start = D.monthKey(habit.createdAt);
    var end = currentMonth;
    if (habit.archivedAt) {
      var beforeArchive = D.addMonths(D.monthKey(habit.archivedAt), -1);
      if (beforeArchive < end) end = beforeArchive;
    }
    var total = 0;
    for (var m = start; m <= end; m = D.addMonths(m, 1)) total += targetFor(data, habit, m);
    return total;
  }

  /* Taux de réussite plafonné à 100 %. */
  function successRate(done, expected) {
    if (expected <= 0) return done > 0 ? 100 : 0;
    return Math.min(100, Math.round(done / expected * 100));
  }

  /* 12 derniers mois : % de l'objectif de CE mois-là, plafonné à 100 %. */
  function last12Months(data, habit, currentMonth) {
    var checks = checksOf(data, habit.id);
    var created = D.monthKey(habit.createdAt);
    var months = [];
    for (var i = 11; i >= 0; i--) {
      var m = D.addMonths(currentMonth, -i);
      var done = countBetween(checks, D.dayOfMonth(m, 1), lastDay(m));
      var target = m >= created ? targetFor(data, habit, m) : 0;
      months.push({
        month: m, done: done,
        pct: m < created ? 0 : successRate(done, target),
        label: D.monthLabel(m) + ' — ' + B.ui.plural(done, 'fois', 'fois')
      });
    }
    return months;
  }

  /* Bilan depuis toujours, habitudes archivées comprises. */
  function globalStats(data, today) {
    var currentMonth = D.monthKey(today);
    var totalDone = 0, totalExpected = 0, bestCurrent = 0;
    var rows = data.habits.items.map(function (x) {
      var checks = checksOf(data, x.id);
      var done = countBetween(checks, '0000-00-00', '9999-99-99');
      var expected = expectedTotal(data, x, currentMonth);
      var streak = currentStreak(checks, today);
      totalDone += done;
      totalExpected += expected;
      bestCurrent = Math.max(bestCurrent, streak);
      return {
        habit: x, streak: streak, record: bestStreak(checks), done: done,
        expected: expected, rate: successRate(done, expected),
        months: last12Months(data, x, currentMonth)
      };
    });
    rows.sort(function (a, b) { return b.rate - a.rate || a.habit.position - b.habit.position; });
    return {
      count: rows.length,
      bestCurrentStreak: bestCurrent,
      totalDone: totalDone,
      globalRate: successRate(totalDone, totalExpected),
      rows: rows
    };
  }

  B.habitsLogic = {
    level: level, findHabit: findHabit, checksOf: checksOf,
    addHabit: addHabit, renameHabit: renameHabit, targetFor: targetFor, setTarget: setTarget,
    toggleCheck: toggleCheck, archiveHabit: archiveHabit, deleteHabit: deleteHabit,
    habitsForMonth: habitsForMonth, monthStats: monthStats, monthCompletion: monthCompletion,
    ranking: ranking, dailyCurve: dailyCurve, weeksOfMonth: weeksOfMonth, weeklyRecap: weeklyRecap,
    currentStreak: currentStreak, bestStreak: bestStreak, expectedTotal: expectedTotal,
    successRate: successRate, last12Months: last12Months, globalStats: globalStats
  };
})(window.Bourgeon = window.Bourgeon || {});
