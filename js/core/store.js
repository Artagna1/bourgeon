/*
 * Bourgeon — stockage des données.
 *
 * Toutes les données tiennent dans un seul objet JSON, enregistré dans le
 * navigateur (localStorage). Pas de compte, pas de serveur.
 *
 * Règles d'usage pour les modules :
 *   - lire avec B.store.get() AU MOMENT de l'action (ne pas garder de copie) ;
 *   - modifier via B.store.update(function (data) { ... }), qui enregistre
 *     immédiatement.
 *
 * Le champ "version" permet de faire évoluer le format : pour passer de la
 * version N à N+1, on ajoute une fonction migrations[N + 1] qui transforme les
 * anciennes données, puis on augmente VERSION.
 */
(function (B) {
  'use strict';

  var DEFAULT_KEY = 'bourgeon.data';
  var VERSION = 1;

  function defaultData() {
    return {
      version: VERSION,
      journal: {
        entries: {}              // "AAAA-MM-JJ" -> { text, updatedAt }
      },
      habits: {
        items: [],               // { id, name, position, baseTarget, createdAt, archivedAt }
        targets: [],             // { habitId, month: "AAAA-MM", target } — changements d'objectif
        checks: {}               // habitId -> { "AAAA-MM-JJ": true }
      },
      focus: {
        sessions: [],            // sessions terminées (voir module Focus)
        active: null,            // session en cours, pour la reprendre après rechargement
        settings: { alerts: true },  // son + notification en fin de phase
        lastConfig: null         // derniers réglages utilisés
      },
      goals: {
        items: []                // { id, name, deadline, status, createdAt, note }
      },
      eisenhower: {
        tasks: []                // { id, text, deadline, done, zone: 0..4, rank }
      },
      revisions: {
        settings: { defaultSteps: [1, 7, 30, 90], dayStartHour: 0 },
        stepTypes: [],           // { id, name, steps: [..] }
        subjects: [],            // { id, name, frozenAt, stepTypeId }
        chapters: [],            // { id, subjectId, name, frozenAt }
        concepts: [],            // { id, chapterId, name, addedAt, validations: [..], lastMaintenance, frozenAt, tagId }
        tags: []                 // { id, name } — étiquettes de l'onglet « Aujourd'hui »
      },
      sport: {
        vma: 16.5,
        planning: ['', '', '', '', '', '', '']   // lundi -> dimanche
      }
    };
  }

  var migrations = {
    // 2: function (data) { ... transformer data de la version 1 vers la 2 ... }
  };

  /* Erreur de chargement, avec un code pour adapter le message affiché. */
  function StoreError(code, message, raw) {
    this.name = 'StoreError';
    this.code = code;       // 'unavailable' | 'corrupt' | 'tooNew'
    this.message = message;
    this.raw = raw;         // contenu brut, pour pouvoir le récupérer
  }
  StoreError.prototype = Object.create(Error.prototype);

  var key = DEFAULT_KEY;
  var data = null;
  var listeners = [];

  /* Ajoute les rubriques absentes (ex. données créées par une version plus ancienne). */
  function fillDefaults(target, defaults) {
    Object.keys(defaults).forEach(function (k) {
      if (!(k in target)) {
        target[k] = defaults[k];
      } else if (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) &&
                 target[k] && typeof target[k] === 'object' && !Array.isArray(target[k]) &&
                 Object.keys(defaults[k]).length > 0) {
        fillDefaults(target[k], defaults[k]);
      }
    });
    return target;
  }

  /*
   * Charge les données. Lève une StoreError si elles sont illisibles : dans ce
   * cas on n'écrit RIEN, pour ne jamais écraser les données de l'utilisateur.
   */
  function load(options) {
    key = (options && options.key) || DEFAULT_KEY;
    var raw;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      throw new StoreError('unavailable', 'Le stockage du navigateur est inaccessible.');
    }

    if (raw === null) {
      data = defaultData();
      save();
      return data;
    }

    var result = parse(raw);
    data = result.data;
    if (result.migrated) save();
    return data;
  }

  /*
   * Lit un texte JSON de données Bourgeon : vérifie le format, applique les
   * migrations et complète les rubriques manquantes. Lève une StoreError.
   */
  function parse(raw) {
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new StoreError('corrupt', 'Les données sont illisibles (fichier JSON invalide).', raw);
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number') {
      throw new StoreError('corrupt', 'Ce fichier ne contient pas de données Bourgeon.', raw);
    }
    if (parsed.version > VERSION) {
      throw new StoreError('tooNew', 'Les données ont été créées par une version plus récente de Bourgeon.', raw);
    }
    var migrated = parsed.version < VERSION;
    while (parsed.version < VERSION) {
      migrations[parsed.version + 1](parsed);
      parsed.version += 1;
    }
    return { data: fillDefaults(parsed, defaultData()), migrated: migrated };
  }

  /* Remplace TOUTES les données par celles d'un fichier exporté (texte JSON). */
  function importData(raw) {
    data = parse(raw).data;
    save();
    return data;
  }

  /* Texte JSON de toutes les données, pour une sauvegarde. */
  function exportData() {
    return JSON.stringify(data, null, 1);
  }

  function get() { return data; }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      throw new Error('Impossible d\'enregistrer les données : l\'espace de stockage du navigateur ' +
        'est peut-être plein ou bloqué. La dernière modification n\'a pas été sauvegardée.');
    }
    listeners.forEach(function (fn) { fn(); });
  }

  /* Appelle fn après chaque enregistrement (ex. mettre à jour les compteurs). */
  function onChange(fn) { listeners.push(fn); }

  /* Modifie les données puis les enregistre immédiatement. */
  function update(fn) {
    var result = fn(data);
    save();
    return result;
  }

  /* Identifiant unique court (ex. "m1x2k3ab4cd"). */
  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  B.store = {
    VERSION: VERSION, DEFAULT_KEY: DEFAULT_KEY, StoreError: StoreError,
    defaultData: defaultData, load: load, get: get, save: save, update: update, newId: newId, onChange: onChange,
    parse: parse, importData: importData, exportData: exportData
  };
})(window.Bourgeon = window.Bourgeon || {});
