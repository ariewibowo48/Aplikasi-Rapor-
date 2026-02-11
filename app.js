(function () {
  "use strict";

  var STORAGE_KEY = "kbm_data_v1";
  var SESSION_KEY = "kbm_session_v1";

  var APP_TITLE = "Kemajuan Belajar Murid";
  var APP_SUBTITLE = "UPTD SMP Negeri 5 Batu Ampar";

  var CLASSES = ["7A", "7B", "8", "9A", "9B"];
  var SUBJECTS = [
    "Pendidikan Agama Islam dan Budi Pekerti",
    "PPKn",
    "Bahasa Indonesia",
    "Matematika",
    "IPA",
    "IPS",
    "Bahasa Inggris",
    "Seni Budaya",
    "PJOK",
    "Informatika",
    "Pendidikan Al Qur'an"
  ];

  var ASSESSMENT_TYPES = [
    { key: "PH1", label: "PH 1", order: 1 },
    { key: "PH2", label: "PH 2", order: 2 },
    { key: "PH3", label: "PH 3", order: 3 },
    { key: "PTS", label: "PTS", order: 4 },
    { key: "PAS", label: "PAS", order: 5 },
    { key: "PAJ", label: "PAJ", order: 6 }
  ];

  var DEFAULT_ACTIVE_TYPES = ["PH1", "PH2", "PH3", "PTS", "PAS"];
  var DEFAULT_WEIGHTS = {
    PH1: 1,
    PH2: 1,
    PH3: 1,
    PTS: 2,
    PAS: 2,
    PAJ: 2
  };
  var SUPABASE_TABLE = "kbm_data";
  var supabaseClient = null;
  var supabaseConfig = null;
  var supabaseChecked = false;
  var lastRemoteUpdatedAt = 0;
  var lastSavedSignature = null;
  var remoteSaveTimer = null;
  var remoteSyncPromise = null;
  var syncCompleted = false;

  function uid() {
    return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function seedData() {
    return {
      version: 1,
      meta: {
        updatedAt: null
      },
      users: [],
      teachers: [],
      homerooms: [],
      students: [],
      assessments: {
        activeTypes: DEFAULT_ACTIVE_TYPES.slice(),
        weights: Object.assign({}, DEFAULT_WEIGHTS)
      },
      scoreLocks: {},
      remedials: {},
      scores: {},
      attendance: {}
    };
  }

  function touchMeta(data) {
    if (!data.meta) data.meta = {};
    data.meta.updatedAt = new Date().toISOString();
  }

  function getSyncStatusEl() {
    if (typeof document === "undefined") return null;
    return document.getElementById("syncStatus");
  }

  function setSyncStatus(message, variant) {
    var el = getSyncStatusEl();
    if (!el) return;
    if (!message) {
      el.textContent = "";
      el.classList.remove("sync-success", "sync-error", "sync-pending");
      el.style.display = "none";
      return;
    }
    el.textContent = message;
    el.style.display = "inline-flex";
    el.classList.remove("sync-success", "sync-error", "sync-pending");
    if (variant) el.classList.add(variant);
  }

  function markSyncPending() {
    setSyncStatus("Sync...", "sync-pending");
  }

  function getSupabaseConfig() {
    if (typeof window === "undefined") return null;
    var url = window.KBM_SUPABASE_URL;
    var key = window.KBM_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    if (String(url).indexOf("YOUR_PROJECT") !== -1) return null;
    if (String(key).indexOf("YOUR_ANON_KEY") !== -1) return null;
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;
    return {
      url: url,
      key: key,
      table: window.KBM_SUPABASE_TABLE || SUPABASE_TABLE,
      rowId: window.KBM_SUPABASE_ROW_ID || "default"
    };
  }

  function initSupabase() {
    if (supabaseChecked) return supabaseClient;
    supabaseChecked = true;
    supabaseConfig = getSupabaseConfig();
    if (!supabaseConfig) {
      setSyncStatus("");
      return null;
    }
    supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
    return supabaseClient;
  }

  function getSupabaseConfigCached() {
    if (!supabaseConfig) supabaseConfig = getSupabaseConfig();
    return supabaseConfig;
  }

  function parseUpdatedAt(value) {
    if (!value) return 0;
    var ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }

  function isDataEmpty(data) {
    if (!data) return true;
    if ((data.students || []).length) return false;
    if ((data.teachers || []).length) return false;
    if ((data.users || []).length) return false;
    if ((data.homerooms || []).length) return false;
    if (data.scores && Object.keys(data.scores).length) return false;
    if (data.attendance && Object.keys(data.attendance).length) return false;
    return true;
  }

  function fetchRemoteData() {
    var client = initSupabase();
    if (!client) return Promise.resolve(null);
    var config = getSupabaseConfigCached();
    if (!config) return Promise.resolve(null);
    return client
      .from(config.table)
      .select("id,data,updated_at")
      .eq("id", config.rowId)
      .maybeSingle()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data || null;
      })
      .catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("Supabase fetch error", err);
        }
        setSyncStatus("Sync gagal", "sync-error");
        return null;
      });
  }

  function pushRemoteData(data) {
    var client = initSupabase();
    if (!client) return Promise.resolve(false);
    var config = getSupabaseConfigCached();
    if (!config) return Promise.resolve(false);
    markSyncPending();
    var updatedAt = (data.meta && data.meta.updatedAt) || new Date().toISOString();
    var payload = { id: config.rowId, data: data, updated_at: updatedAt };
    return client
      .from(config.table)
      .upsert(payload, { onConflict: "id" })
      .select("updated_at")
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        var remoteAt = parseUpdatedAt(
          (result.data && result.data.updated_at) || payload.updated_at
        );
        if (remoteAt) lastRemoteUpdatedAt = remoteAt;
        setSyncStatus("Sync berhasil", "sync-success");
        return true;
      })
      .catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("Supabase sync error", err);
        }
        setSyncStatus("Sync gagal", "sync-error");
        return false;
      });
  }

  function scheduleRemoteSave(data) {
    if (!initSupabase()) return;
    var signature = JSON.stringify(data);
    if (signature === lastSavedSignature) return;
    lastSavedSignature = signature;
    if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(function () {
      pushRemoteData(data);
    }, 400);
  }

  function initSync() {
    if (!initSupabase()) return Promise.resolve(false);
    if (remoteSyncPromise) return remoteSyncPromise;
    markSyncPending();
    remoteSyncPromise = fetchRemoteData()
      .then(function (row) {
        var local = loadData();
        var localAt = parseUpdatedAt(local.meta && local.meta.updatedAt);

        if (!row || !row.data) {
          if (isDataEmpty(local)) {
            var seeded = applySeedData(local);
            if (seeded) {
              saveData(local);
              return false;
            }
          }
          if (!isDataEmpty(local)) {
            return pushRemoteData(local).then(function () {
              return false;
            });
          }
          return false;
        }

        var remoteData = row.data || seedData();
        if (!remoteData.meta) remoteData.meta = {};
        if (!remoteData.meta.updatedAt && row.updated_at) {
          remoteData.meta.updatedAt = row.updated_at;
        }
        ensureIntegrity(remoteData);

        var remoteAt = parseUpdatedAt(row.updated_at || remoteData.meta.updatedAt);
        if (remoteAt) lastRemoteUpdatedAt = remoteAt;

        if (!localAt || remoteAt > localAt) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteData));
          return true;
        }

        if (localAt > remoteAt) {
          return pushRemoteData(local).then(function () {
            return false;
          });
        }

        return false;
      })
      .then(function (replaced) {
        setSyncStatus("Sync berhasil", "sync-success");
        if (replaced && typeof window !== "undefined") {
          if (window.KBM_SUPABASE_AUTO_RELOAD !== false) {
            window.location.reload();
          }
        }
        return replaced;
      })
      .catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("Supabase init error", err);
        }
        return false;
      })
      .finally(function () {
        syncCompleted = true;
        remoteSyncPromise = null;
      });
    return remoteSyncPromise;
  }

  function loadData() {
    var raw = localStorage.getItem(STORAGE_KEY);
    var data = raw ? JSON.parse(raw) : seedData();
    ensureIntegrity(data);
    return data;
  }

  function saveData(data) {
    touchMeta(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    scheduleRemoteSave(data);
  }

  function updateData(mutator) {
    var data = loadData();
    mutator(data);
    saveData(data);
    return data;
  }

  function ensureIntegrity(data) {
    if (!data.meta) data.meta = { updatedAt: null };
    if (!data.assessments) {
      data.assessments = {
        activeTypes: DEFAULT_ACTIVE_TYPES.slice(),
        weights: Object.assign({}, DEFAULT_WEIGHTS)
      };
    }
    if (!Array.isArray(data.assessments.activeTypes)) {
      data.assessments.activeTypes = DEFAULT_ACTIVE_TYPES.slice();
    }
    if (!data.assessments.weights) {
      data.assessments.weights = Object.assign({}, DEFAULT_WEIGHTS);
    }
    if (!Array.isArray(data.users)) data.users = [];
    if (!Array.isArray(data.teachers)) data.teachers = [];
    if (!Array.isArray(data.homerooms)) data.homerooms = [];
    if (!Array.isArray(data.students)) data.students = [];
    if (!data.scoreLocks) data.scoreLocks = {};
    if (!data.remedials) data.remedials = {};
    if (!data.scores) data.scores = {};
    if (!data.attendance) data.attendance = {};
  }

  function getSession() {
    var raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function setSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function requireRole(role) {
    var session = getSession();
    if (!session || (role && session.role !== role)) {
      window.location.href = "login.html";
      return null;
    }
    return session;
  }

  function formatDate(date) {
    var day = String(date.getDate()).padStart(2, "0");
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var year = date.getFullYear();
    return day + "/" + month + "/" + year;
  }

  function normalizeNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function isClass9(className) {
    return String(className).startsWith("9");
  }

  function getActiveTypes(data) {
    var list = data.assessments.activeTypes || [];
    if (!Array.isArray(list) || list.length === 0) {
      list = [DEFAULT_ACTIVE_TYPES[0]];
      data.assessments.activeTypes = list;
    }
    return list;
  }

  function setActiveTypes(data, list) {
    data.assessments.activeTypes = list.length ? list : [DEFAULT_ACTIVE_TYPES[0]];
  }

  function getAllowedTypesForClass(activeTypes, className) {
    if (isClass9(className)) return activeTypes.slice();
    return activeTypes.filter(function (type) {
      return type !== "PAJ";
    });
  }

  function getTypeMeta(typeKey) {
    return ASSESSMENT_TYPES.find(function (type) {
      return type.key === typeKey;
    });
  }

  function getPreviousType(typeKey) {
    var idx = ASSESSMENT_TYPES.findIndex(function (type) {
      return type.key === typeKey;
    });
    if (idx <= 0) return null;
    return ASSESSMENT_TYPES[idx - 1].key;
  }

  function getWaliByClass(data, className) {
    var wali = data.homerooms.find(function (item) {
      return item.className === className;
    });
    if (wali) return wali;
    var teacher = (data.teachers || []).find(function (item) {
      return item.waliClass === className;
    });
    if (teacher) {
      return { name: teacher.name, nip: teacher.nip, className: className };
    }
    return null;
  }

  function isSpecialReligionStudent(name) {
    if (!name) return false;
    return /\b(dastan|valen)\b/i.test(String(name));
  }

  function getSubjectLabel(subject, studentName) {
    if (!isSpecialReligionStudent(studentName)) return subject;
    if (subject === "Pendidikan Agama Islam dan Budi Pekerti") {
      return "Pendidikan Agama Kristen";
    }
    if (subject === "Pendidikan Al Qur'an") {
      return "Pendidikan Alkitab";
    }
    return subject;
  }

  function getScore(data, studentId, subject, typeKey) {
    var studentScores = data.scores[studentId];
    if (!studentScores || !studentScores.subjects) return null;
    var subjectScores = studentScores.subjects[subject];
    if (!subjectScores) return null;
    return normalizeNumber(subjectScores[typeKey]);
  }

  function setScore(data, studentId, subject, typeKey, value) {
    if (!data.scores[studentId]) data.scores[studentId] = { subjects: {} };
    if (!data.scores[studentId].subjects[subject]) {
      data.scores[studentId].subjects[subject] = {};
    }
    if (value === null) {
      delete data.scores[studentId].subjects[subject][typeKey];
      return;
    }
    data.scores[studentId].subjects[subject][typeKey] = value;
  }

  function getRemedial(data, studentId, subject, typeKey) {
    var studentRemedials = data.remedials[studentId];
    if (!studentRemedials || !studentRemedials.subjects) return null;
    var subjectRemedials = studentRemedials.subjects[subject];
    if (!subjectRemedials) return null;
    return normalizeNumber(subjectRemedials[typeKey]);
  }

  function setRemedial(data, studentId, subject, typeKey, value) {
    if (!data.remedials[studentId]) data.remedials[studentId] = { subjects: {} };
    if (!data.remedials[studentId].subjects[subject]) {
      data.remedials[studentId].subjects[subject] = {};
    }
    if (value === null) {
      delete data.remedials[studentId].subjects[subject][typeKey];
      return;
    }
    data.remedials[studentId].subjects[subject][typeKey] = value;
  }

  function getEffectiveScore(data, studentId, subject, typeKey) {
    var current = getScore(data, studentId, subject, typeKey);
    if (typeKey !== "PH1" && typeKey !== "PH2" && typeKey !== "PH3") return current;
    var remedial = getRemedial(data, studentId, subject, typeKey);
    if (current === null && remedial === null) return null;
    if (current === null) return remedial;
    if (remedial === null) return current;
    return Math.max(current, remedial);
  }

  function getAttendance(data, studentId) {
    return data.attendance[studentId] || {
      hadir: 0,
      sakit: 0,
      izin: 0,
      alpa: 0
    };
  }

  function getDisplayNis(student) {
    if (!student) return "-";
    return student.nis || student.nisn || "-";
  }

  function setAttendance(data, studentId, field, value) {
    if (!data.attendance[studentId]) {
      data.attendance[studentId] = { hadir: 0, sakit: 0, izin: 0, alpa: 0 };
    }
    data.attendance[studentId][field] = value;
  }

  function computeTrend(current, previous) {
    if (current === null || previous === null) return "none";
    if (current > previous) return "up";
    if (current < previous) return "down";
    return "same";
  }

  function calcWeightedAverage(subjectScores, types, weights) {
    var total = 0;
    var sumWeights = 0;
    types.forEach(function (type) {
      var value = normalizeNumber(subjectScores[type]);
      var weight = normalizeNumber(weights[type]);
      if (value === null) return;
      if (weight === null || weight <= 0) weight = 1;
      total += value * weight;
      sumWeights += weight;
    });
    if (!sumWeights) return null;
    return Math.round((total / sumWeights) * 100) / 100;
  }

  function seedTeachers(data, seedList) {
    if (!seedList || !seedList.length) return false;
    if (!Array.isArray(data.teachers)) data.teachers = [];
    var updated = false;

    seedList.forEach(function (seed) {
      var existing =
        data.teachers.find(function (t) {
          return t.username === seed.username;
        }) ||
        data.teachers.find(function (t) {
          return t.nip && seed.nip && t.nip === seed.nip;
        }) ||
        data.teachers.find(function (t) {
          return t.name === seed.name;
        });

      if (existing) {
        ["name", "nip", "subjectRaw", "subjects", "roles", "waliClass", "username", "password"].forEach(
          function (key) {
            if (JSON.stringify(existing[key]) !== JSON.stringify(seed[key])) {
              existing[key] = seed[key];
              updated = true;
            }
          }
        );
      } else {
        data.teachers.push(Object.assign({ id: uid() }, seed));
        updated = true;
      }
    });

    data.teachers.forEach(function (teacher) {
      if (!teacher.waliClass) return;
      var exists = data.homerooms.find(function (item) {
        return item.className === teacher.waliClass;
      });
      if (!exists) {
        data.homerooms.push({
          id: uid(),
          name: teacher.name,
          nip: teacher.nip,
          className: teacher.waliClass
        });
        updated = true;
      } else {
        if (exists.name !== teacher.name || exists.nip !== teacher.nip) {
          exists.name = teacher.name;
          exists.nip = teacher.nip;
          updated = true;
        }
      }
    });

    return updated;
  }

  function seedStudents(data, seedList) {
    if (!seedList || !seedList.length) return false;
    if (!Array.isArray(data.students)) data.students = [];
    if (data.students.length) return false;
    data.students = seedList.map(function (student) {
      return {
        id: uid(),
        name: student.name || "",
        nis: student.nis || "",
        nisn: student.nisn || "",
        className: student.className || ""
      };
    });
    return true;
  }

  function applySeedData(data) {
    var updated = false;
    if (typeof window !== "undefined") {
      if (window.KBM_TEACHERS_SEED) {
        updated = seedTeachers(data, window.KBM_TEACHERS_SEED) || updated;
      }
      if (window.KBM_SEED_STUDENTS) {
        updated = seedStudents(data, window.KBM_SEED_STUDENTS) || updated;
      }
    }
    return updated;
  }

  function autoSeed() {
    var data = loadData();
    if (initSupabase() && !syncCompleted && isDataEmpty(data)) {
      return false;
    }
    var updated = applySeedData(data);
    if (updated) saveData(data);
    return updated;
  }

  window.KBM = {
    STORAGE_KEY: STORAGE_KEY,
    SESSION_KEY: SESSION_KEY,
    APP_TITLE: APP_TITLE,
    APP_SUBTITLE: APP_SUBTITLE,
    CLASSES: CLASSES,
    SUBJECTS: SUBJECTS,
    ASSESSMENT_TYPES: ASSESSMENT_TYPES,
    DEFAULT_ACTIVE_TYPES: DEFAULT_ACTIVE_TYPES,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    loadData: loadData,
    saveData: saveData,
    updateData: updateData,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    requireRole: requireRole,
    formatDate: formatDate,
    normalizeNumber: normalizeNumber,
    isClass9: isClass9,
    getActiveTypes: getActiveTypes,
    setActiveTypes: setActiveTypes,
    getAllowedTypesForClass: getAllowedTypesForClass,
    getTypeMeta: getTypeMeta,
    getPreviousType: getPreviousType,
    getWaliByClass: getWaliByClass,
    getSubjectLabel: getSubjectLabel,
    getScore: getScore,
    setScore: setScore,
    getRemedial: getRemedial,
    setRemedial: setRemedial,
    getEffectiveScore: getEffectiveScore,
    getAttendance: getAttendance,
    setAttendance: setAttendance,
    computeTrend: computeTrend,
    calcWeightedAverage: calcWeightedAverage,
    seedTeachers: seedTeachers,
    seedStudents: seedStudents,
    autoSeed: autoSeed,
    initSync: initSync,
    uid: uid,
    getDisplayNis: getDisplayNis
  };

  if (typeof window !== "undefined") {
    window.addEventListener("DOMContentLoaded", function () {
      initSync();
    });
  }
})();
