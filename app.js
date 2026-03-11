(function () {
  "use strict";

  if (typeof window !== "undefined") {
    // Hindari reload otomatis agar tidak terjebak loop.
    window.KBM_SUPABASE_AUTO_RELOAD = false;
  }

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
  var SUPABASE_PAGE_SIZE = 1000;
  var SUPABASE_TABLE = "kbm_data";
  var SUPABASE_TABLES = {
    students: "kbm_students",
    teachers: "kbm_teachers",
    homerooms: "kbm_homerooms",
    users: "kbm_users",
    assessments: "kbm_assessments",
    scoreLocks: "kbm_score_locks",
    scores: "kbm_scores",
    remedials: "kbm_remedials",
    attendance: "kbm_attendance"
  };
  var supabaseClient = null;
  var supabaseConfig = null;
  var supabaseChecked = false;
  var lastRemoteUpdatedAt = 0;
  var lastSavedSignature = null;
  var remoteSaveTimer = null;
  var remoteSyncPromise = null;
  var syncCompleted = false;
  var syncPollTimer = null;
  var tableFlushTimer = null;
  var pendingTableUpserts = {};
  var pendingTableDeletes = {};

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

  function nowIso() {
    return new Date().toISOString();
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
      rowId: window.KBM_SUPABASE_ROW_ID || "default",
      mode: window.KBM_SUPABASE_MODE || "tables",
      tables: Object.assign({}, SUPABASE_TABLES, window.KBM_SUPABASE_TABLES || {})
    };
  }

  function useTableStorage() {
    var cfg = getSupabaseConfig();
    return Boolean(cfg && cfg.mode === "tables");
  }

  function getTablesConfig() {
    var cfg = getSupabaseConfigCached();
    return cfg ? cfg.tables || SUPABASE_TABLES : SUPABASE_TABLES;
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

  function scheduleTableFlush() {
    if (!initSupabase()) return;
    if (tableFlushTimer) clearTimeout(tableFlushTimer);
    tableFlushTimer = setTimeout(function () {
      flushTableUpserts();
    }, 400);
  }

  function queueTableUpsert(tableName, row, onConflict, key) {
    if (!initSupabase()) return;
    if (!pendingTableUpserts[tableName]) {
      pendingTableUpserts[tableName] = { onConflict: onConflict || "id", rows: {} };
    }
    var entry = pendingTableUpserts[tableName];
    var rowKey = key || row.id || JSON.stringify(row);
    entry.rows[rowKey] = row;
    if (onConflict) entry.onConflict = onConflict;
    scheduleTableFlush();
  }

  function queueTableDelete(tableName, ids) {
    if (!initSupabase()) return;
    if (!pendingTableDeletes[tableName]) pendingTableDeletes[tableName] = {};
    ids.forEach(function (id) {
      pendingTableDeletes[tableName][id] = true;
    });
    scheduleTableFlush();
  }

  function flushTableUpserts() {
    if (!initSupabase()) return;
    var tables = Object.keys(pendingTableUpserts);
    var deleteTables = Object.keys(pendingTableDeletes);
    if (!tables.length && !deleteTables.length) return;
    markSyncPending();
    var client = initSupabase();
    var tasks = tables.map(function (tableName) {
      var entry = pendingTableUpserts[tableName];
      if (!entry) return Promise.resolve(true);
      var rows = Object.keys(entry.rows).map(function (key) {
        return entry.rows[key];
      });
      delete pendingTableUpserts[tableName];
      if (!rows.length) return Promise.resolve(true);
      return client
        .from(tableName)
        .upsert(rows, { onConflict: entry.onConflict || "id" })
        .then(function (result) {
          if (result.error) throw result.error;
          return true;
        });
    });

    var deleteTasks = deleteTables.map(function (tableName) {
      var entry = pendingTableDeletes[tableName];
      if (!entry) return Promise.resolve(true);
      var ids = Object.keys(entry);
      delete pendingTableDeletes[tableName];
      if (!ids.length) return Promise.resolve(true);
      return client
        .from(tableName)
        .delete()
        .in("id", ids)
        .then(function (result) {
          if (result.error) throw result.error;
          return true;
        });
    });

    Promise.all(tasks.concat(deleteTasks))
      .then(function () {
        setSyncStatus("Sync berhasil", "sync-success");
      })
      .catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("Supabase table sync error", err);
        }
        setSyncStatus("Sync gagal", "sync-error");
      });
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

  function diffById(prevList, nextList) {
    var prevMap = {};
    var nextMap = {};
    (prevList || []).forEach(function (item) {
      if (item && item.id) prevMap[item.id] = item;
    });
    (nextList || []).forEach(function (item) {
      if (item && item.id) nextMap[item.id] = item;
    });

    var added = [];
    var updated = [];
    var removed = [];

    Object.keys(nextMap).forEach(function (id) {
      if (!prevMap[id]) {
        added.push(nextMap[id]);
      } else if (JSON.stringify(prevMap[id]) !== JSON.stringify(nextMap[id])) {
        updated.push(nextMap[id]);
      }
    });

    Object.keys(prevMap).forEach(function (id) {
      if (!nextMap[id]) removed.push(prevMap[id]);
    });

    return { added: added, updated: updated, removed: removed };
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
    if (useTableStorage()) {
      scheduleTableFlush();
      return;
    }
    var signature = JSON.stringify(data);
    if (signature === lastSavedSignature) return;
    lastSavedSignature = signature;
    if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(function () {
      pushRemoteData(data);
    }, 400);
  }

  function fetchTableRows(tableName, selectColumns) {
    var client = initSupabase();
    if (!client) return Promise.resolve([]);
    var pageSize =
      typeof window !== "undefined" && typeof window.KBM_SUPABASE_PAGE_SIZE === "number"
        ? window.KBM_SUPABASE_PAGE_SIZE
        : SUPABASE_PAGE_SIZE;
    if (!pageSize || pageSize <= 0) pageSize = SUPABASE_PAGE_SIZE;

    var all = [];
    var start = 0;

    function fetchNext() {
      var end = start + pageSize - 1;
      return client
        .from(tableName)
        .select(selectColumns || "*")
        .range(start, end)
        .then(function (result) {
          if (result.error) throw result.error;
          var rows = result.data || [];
          all = all.concat(rows);
          if (rows.length === pageSize) {
            start += pageSize;
            return fetchNext();
          }
          return all;
        });
    }

    return fetchNext();
  }

  function hydrateScores(rows) {
    var scores = {};
    (rows || []).forEach(function (row) {
      if (!row) return;
      var studentId = row.student_id;
      if (!studentId) return;
      if (!scores[studentId]) scores[studentId] = { subjects: {} };
      if (!scores[studentId].subjects[row.subject]) scores[studentId].subjects[row.subject] = {};
      if (row.value === null || row.value === undefined) return;
      scores[studentId].subjects[row.subject][row.type_key] = row.value;
    });
    return scores;
  }

  function hydrateRemedials(rows) {
    var remedials = {};
    (rows || []).forEach(function (row) {
      if (!row) return;
      var studentId = row.student_id;
      if (!studentId) return;
      if (!remedials[studentId]) remedials[studentId] = { subjects: {} };
      if (!remedials[studentId].subjects[row.subject]) {
        remedials[studentId].subjects[row.subject] = {};
      }
      if (row.value === null || row.value === undefined) return;
      remedials[studentId].subjects[row.subject][row.type_key] = row.value;
    });
    return remedials;
  }

  function hydrateAttendance(rows) {
    var attendance = {};
    (rows || []).forEach(function (row) {
      if (!row || !row.student_id) return;
      attendance[row.student_id] = {
        hadir: row.hadir || 0,
        sakit: row.sakit || 0,
        izin: row.izin || 0,
        alpa: row.alpa || 0
      };
    });
    return attendance;
  }

  function hydrateScoreLocks(rows) {
    var locks = {};
    (rows || []).forEach(function (row) {
      if (!row) return;
      var key = row.class_name + "::" + row.subject;
      locks[key] = Boolean(row.locked);
    });
    return locks;
  }

  function buildDataFromTables(payload, updatedAt) {
    var data = seedData();
    data.students = (payload.students || []).map(function (row) {
      return {
        id: row.id,
        name: row.name || "",
        nis: row.nis || "",
        nisn: row.nisn || "",
        className: row.class_name || ""
      };
    });

    data.teachers = (payload.teachers || []).map(function (row) {
      return {
        id: row.id,
        name: row.name || "",
        nip: row.nip || "",
        subjectRaw: row.subject_raw || "",
        subjects: Array.isArray(row.subjects) ? row.subjects : [],
        roles: Array.isArray(row.roles) ? row.roles : [],
        waliClass: row.wali_class || null,
        username: row.username || "",
        password: row.password || ""
      };
    });

    data.homerooms = (payload.homerooms || []).map(function (row) {
      return {
        id: row.id,
        name: row.name || "",
        nip: row.nip || "",
        className: row.class_name || ""
      };
    });

    data.users = (payload.users || []).map(function (row) {
      return {
        id: row.id,
        username: row.username || "",
        password: row.password || "",
        role: row.role || ""
      };
    });

    var assessmentRow = (payload.assessments || []).find(function (row) {
      return row && row.id === (getSupabaseConfigCached() || {}).rowId;
    });
    if (!assessmentRow && payload.assessments && payload.assessments.length) {
      assessmentRow = payload.assessments[0];
    }
    data.assessments = {
      activeTypes: Array.isArray(assessmentRow && assessmentRow.active_types)
        ? assessmentRow.active_types
        : DEFAULT_ACTIVE_TYPES.slice(),
      weights:
        assessmentRow && assessmentRow.weights
          ? assessmentRow.weights
          : Object.assign({}, DEFAULT_WEIGHTS)
    };

    data.scoreLocks = hydrateScoreLocks(payload.scoreLocks || []);
    data.scores = hydrateScores(payload.scores || []);
    data.remedials = hydrateRemedials(payload.remedials || []);
    data.attendance = hydrateAttendance(payload.attendance || []);

    if (updatedAt) {
      data.meta.updatedAt = new Date(updatedAt).toISOString();
    }

    ensureIntegrity(data);
    return data;
  }

  function collectLatestUpdatedAt(payload) {
    var latest = 0;
    Object.keys(payload || {}).forEach(function (key) {
      (payload[key] || []).forEach(function (row) {
        if (row && row.updated_at) {
          var ms = parseUpdatedAt(row.updated_at);
          if (ms > latest) latest = ms;
        }
      });
    });
    return latest || null;
  }

  function pushAllTables(data) {
    var client = initSupabase();
    if (!client) return Promise.resolve(false);
    var tables = getTablesConfig();
    var tasks = [];

    if (data.students && data.students.length) {
      tasks.push(
        client.from(tables.students).upsert(
          data.students.map(function (student) {
            return {
              id: student.id,
              name: student.name,
              nis: student.nis,
              nisn: student.nisn,
              class_name: student.className,
              updated_at: nowIso()
            };
          }),
          { onConflict: "id" }
        )
      );
    }

    if (data.teachers && data.teachers.length) {
      tasks.push(
        client.from(tables.teachers).upsert(
          data.teachers.map(function (teacher) {
            return {
              id: teacher.id,
              name: teacher.name,
              nip: teacher.nip,
              subject_raw: teacher.subjectRaw || "",
              subjects: teacher.subjects || [],
              roles: teacher.roles || [],
              wali_class: teacher.waliClass || null,
              username: teacher.username || "",
              password: teacher.password || "",
              updated_at: nowIso()
            };
          }),
          { onConflict: "id" }
        )
      );
    }

    if (data.homerooms && data.homerooms.length) {
      tasks.push(
        client.from(tables.homerooms).upsert(
          data.homerooms.map(function (item) {
            return {
              id: item.id,
              name: item.name,
              nip: item.nip,
              class_name: item.className,
              updated_at: nowIso()
            };
          }),
          { onConflict: "id" }
        )
      );
    }

    if (data.users && data.users.length) {
      tasks.push(
        client.from(tables.users).upsert(
          data.users.map(function (item) {
            return {
              id: item.id,
              username: item.username,
              password: item.password,
              role: item.role,
              updated_at: nowIso()
            };
          }),
          { onConflict: "id" }
        )
      );
    }

    tasks.push(
      client.from(tables.assessments).upsert(
        {
          id: (getSupabaseConfigCached() || {}).rowId || "default",
          active_types: data.assessments.activeTypes || DEFAULT_ACTIVE_TYPES.slice(),
          weights: data.assessments.weights || Object.assign({}, DEFAULT_WEIGHTS),
          updated_at: nowIso()
        },
        { onConflict: "id" }
      )
    );

    var lockRows = Object.keys(data.scoreLocks || {}).map(function (key) {
      var parts = key.split("::");
      return {
        class_name: parts[0],
        subject: parts[1],
        locked: Boolean(data.scoreLocks[key]),
        updated_at: nowIso()
      };
    });
    if (lockRows.length) {
      tasks.push(
        client.from(tables.scoreLocks).upsert(lockRows, { onConflict: "class_name,subject" })
      );
    }

    var scoreRows = [];
    Object.keys(data.scores || {}).forEach(function (studentId) {
      var subjects = data.scores[studentId] && data.scores[studentId].subjects;
      if (!subjects) return;
      Object.keys(subjects).forEach(function (subject) {
        var types = subjects[subject] || {};
        Object.keys(types).forEach(function (typeKey) {
          var value = types[typeKey];
          if (value === null || value === undefined) return;
          scoreRows.push({
            student_id: studentId,
            subject: subject,
            type_key: typeKey,
            value: value,
            updated_at: nowIso()
          });
        });
      });
    });
    if (scoreRows.length) {
      tasks.push(client.from(tables.scores).upsert(scoreRows, { onConflict: "student_id,subject,type_key" }));
    }

    var remedialRows = [];
    Object.keys(data.remedials || {}).forEach(function (studentId) {
      var subjects = data.remedials[studentId] && data.remedials[studentId].subjects;
      if (!subjects) return;
      Object.keys(subjects).forEach(function (subject) {
        var types = subjects[subject] || {};
        Object.keys(types).forEach(function (typeKey) {
          var value = types[typeKey];
          if (value === null || value === undefined) return;
          remedialRows.push({
            student_id: studentId,
            subject: subject,
            type_key: typeKey,
            value: value,
            updated_at: nowIso()
          });
        });
      });
    });
    if (remedialRows.length) {
      tasks.push(
        client
          .from(tables.remedials)
          .upsert(remedialRows, { onConflict: "student_id,subject,type_key" })
      );
    }

    var attendanceRows = [];
    Object.keys(data.attendance || {}).forEach(function (studentId) {
      var item = data.attendance[studentId];
      if (!item) return;
      attendanceRows.push({
        student_id: studentId,
        hadir: item.hadir || 0,
        sakit: item.sakit || 0,
        izin: item.izin || 0,
        alpa: item.alpa || 0,
        updated_at: nowIso()
      });
    });
    if (attendanceRows.length) {
      tasks.push(client.from(tables.attendance).upsert(attendanceRows, { onConflict: "student_id" }));
    }

    return Promise.all(tasks)
      .then(function (results) {
        results.forEach(function (res) {
          if (res && res.error) throw res.error;
        });
        return true;
      })
      .catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("Supabase push all tables error", err);
        }
        return false;
      });
  }

  function initSyncTables() {
    if (!initSupabase()) return Promise.resolve(false);
    if (remoteSyncPromise) return remoteSyncPromise;
    markSyncPending();

    var tables = getTablesConfig();
    remoteSyncPromise = Promise.all([
      fetchTableRows(tables.students),
      fetchTableRows(tables.teachers),
      fetchTableRows(tables.homerooms),
      fetchTableRows(tables.users),
      fetchTableRows(tables.assessments),
      fetchTableRows(tables.scoreLocks),
      fetchTableRows(tables.scores),
      fetchTableRows(tables.remedials),
      fetchTableRows(tables.attendance)
    ])
      .then(function (results) {
        var payload = {
          students: results[0],
          teachers: results[1],
          homerooms: results[2],
          users: results[3],
          assessments: results[4],
          scoreLocks: results[5],
          scores: results[6],
          remedials: results[7],
          attendance: results[8]
        };

        var local = loadData();
        var localAt = parseUpdatedAt(local.meta && local.meta.updatedAt);

        var hasRemote =
          (payload.students && payload.students.length) ||
          (payload.teachers && payload.teachers.length) ||
          (payload.homerooms && payload.homerooms.length) ||
          (payload.scores && payload.scores.length) ||
          (payload.attendance && payload.attendance.length);

        if (!hasRemote) {
          if (isDataEmpty(local)) {
            var seeded = applySeedData(local);
            if (seeded) {
              saveData(local);
            }
          }
          return pushAllTables(loadData()).then(function () {
            return false;
          });
        }

        var latest = collectLatestUpdatedAt(payload);
        if (localAt && latest && localAt >= latest) {
          if (localAt > latest) {
            return pushAllTables(local).then(function () {
              return false;
            });
          }
          return false;
        }

        var data = buildDataFromTables(payload, latest);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
      })
      .then(function (replaced) {
        setSyncStatus("Sync berhasil", "sync-success");
        if (replaced && typeof window !== "undefined") {
          if (window.KBM_SUPABASE_AUTO_RELOAD === true) {
            window.location.reload();
          }
        }
        return replaced;
      })
      .catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("Supabase table init error", err);
        }
        setSyncStatus("Sync gagal", "sync-error");
        return false;
      })
      .finally(function () {
        syncCompleted = true;
        remoteSyncPromise = null;
      });

    return remoteSyncPromise;
  }

  function initSync() {
    if (!initSupabase()) return Promise.resolve(false);
    if (useTableStorage()) return initSyncTables();
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
          if (window.KBM_SUPABASE_AUTO_RELOAD === true) {
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

  function startSyncPolling() {
    if (!initSupabase()) return;
    if (syncPollTimer) return;
    var interval =
      typeof window !== "undefined" && typeof window.KBM_SUPABASE_POLL_MS === "number"
        ? window.KBM_SUPABASE_POLL_MS
        : 30000;
    if (interval <= 0) return;
    syncPollTimer = setInterval(function () {
      initSync();
    }, interval);
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
    var prevSnapshot = null;
    if (useTableStorage()) {
      prevSnapshot = {
        students: JSON.parse(JSON.stringify(data.students || [])),
        teachers: JSON.parse(JSON.stringify(data.teachers || [])),
        homerooms: JSON.parse(JSON.stringify(data.homerooms || [])),
        users: JSON.parse(JSON.stringify(data.users || [])),
        assessments: JSON.parse(JSON.stringify(data.assessments || {})),
        scoreLocks: JSON.parse(JSON.stringify(data.scoreLocks || {}))
      };
    }
    var result = mutator(data);
    if (result !== false) {
      saveData(data);
      if (useTableStorage()) {
        syncCoreTables(prevSnapshot, data);
      }
    }
    return data;
  }

  function syncCoreTables(prevSnapshot, data) {
    if (!prevSnapshot) return;
    var tables = getTablesConfig();
    var config = getSupabaseConfigCached() || {};

    var studentDiff = diffById(prevSnapshot.students || [], data.students || []);
    studentDiff.added.concat(studentDiff.updated).forEach(function (student) {
      queueTableUpsert(
        tables.students,
        {
          id: student.id,
          name: student.name || "",
          nis: student.nis || "",
          nisn: student.nisn || "",
          class_name: student.className || "",
          updated_at: nowIso()
        },
        "id"
      );
    });
    if (studentDiff.removed.length) {
      queueTableDelete(
        tables.students,
        studentDiff.removed.map(function (item) {
          return item.id;
        })
      );
    }

    var teacherDiff = diffById(prevSnapshot.teachers || [], data.teachers || []);
    teacherDiff.added.concat(teacherDiff.updated).forEach(function (teacher) {
      queueTableUpsert(
        tables.teachers,
        {
          id: teacher.id,
          name: teacher.name || "",
          nip: teacher.nip || "",
          subject_raw: teacher.subjectRaw || "",
          subjects: teacher.subjects || [],
          roles: teacher.roles || [],
          wali_class: teacher.waliClass || null,
          username: teacher.username || "",
          password: teacher.password || "",
          updated_at: nowIso()
        },
        "id"
      );
    });
    if (teacherDiff.removed.length) {
      queueTableDelete(
        tables.teachers,
        teacherDiff.removed.map(function (item) {
          return item.id;
        })
      );
    }

    var homeroomDiff = diffById(prevSnapshot.homerooms || [], data.homerooms || []);
    homeroomDiff.added.concat(homeroomDiff.updated).forEach(function (item) {
      queueTableUpsert(
        tables.homerooms,
        {
          id: item.id,
          name: item.name || "",
          nip: item.nip || "",
          class_name: item.className || "",
          updated_at: nowIso()
        },
        "id"
      );
    });
    if (homeroomDiff.removed.length) {
      queueTableDelete(
        tables.homerooms,
        homeroomDiff.removed.map(function (item) {
          return item.id;
        })
      );
    }

    var userDiff = diffById(prevSnapshot.users || [], data.users || []);
    userDiff.added.concat(userDiff.updated).forEach(function (item) {
      queueTableUpsert(
        tables.users,
        {
          id: item.id,
          username: item.username || "",
          password: item.password || "",
          role: item.role || "",
          updated_at: nowIso()
        },
        "id"
      );
    });
    if (userDiff.removed.length) {
      queueTableDelete(
        tables.users,
        userDiff.removed.map(function (item) {
          return item.id;
        })
      );
    }

    if (JSON.stringify(prevSnapshot.assessments) !== JSON.stringify(data.assessments)) {
      queueTableUpsert(
        tables.assessments,
        {
          id: config.rowId || "default",
          active_types: data.assessments.activeTypes || DEFAULT_ACTIVE_TYPES.slice(),
          weights: data.assessments.weights || Object.assign({}, DEFAULT_WEIGHTS),
          updated_at: nowIso()
        },
        "id"
      );
    }

    var prevLocks = prevSnapshot.scoreLocks || {};
    var nextLocks = data.scoreLocks || {};
    if (JSON.stringify(prevLocks) !== JSON.stringify(nextLocks)) {
      var lockRows = [];
      Object.keys(nextLocks).forEach(function (key) {
        var parts = key.split("::");
        lockRows.push({
          class_name: parts[0],
          subject: parts[1],
          locked: Boolean(nextLocks[key])
        });
      });
      Object.keys(prevLocks).forEach(function (key) {
        if (nextLocks[key] !== undefined) return;
        var parts = key.split("::");
        lockRows.push({
          class_name: parts[0],
          subject: parts[1],
          locked: false
        });
      });
      lockRows.forEach(function (row) {
        row.updated_at = nowIso();
        queueTableUpsert(
          tables.scoreLocks,
          row,
          "class_name,subject",
          row.class_name + "|" + row.subject
        );
      });
    }
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
    if (useTableStorage()) {
      queueTableUpsert(
        getTablesConfig().scores,
        {
          student_id: studentId,
          subject: subject,
          type_key: typeKey,
          value: value,
          updated_at: nowIso()
        },
        "student_id,subject,type_key",
        studentId + "|" + subject + "|" + typeKey
      );
    }
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
    if (useTableStorage()) {
      queueTableUpsert(
        getTablesConfig().remedials,
        {
          student_id: studentId,
          subject: subject,
          type_key: typeKey,
          value: value,
          updated_at: nowIso()
        },
        "student_id,subject,type_key",
        studentId + "|" + subject + "|" + typeKey
      );
    }
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
    if (useTableStorage()) {
      queueTableUpsert(
        getTablesConfig().attendance,
        {
          student_id: studentId,
          hadir: data.attendance[studentId].hadir || 0,
          sakit: data.attendance[studentId].sakit || 0,
          izin: data.attendance[studentId].izin || 0,
          alpa: data.attendance[studentId].alpa || 0,
          updated_at: nowIso()
        },
        "student_id",
        studentId
      );
    }
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
    if (useTableStorage()) {
      var didUpdate = false;
      updateData(function (draft) {
        didUpdate = applySeedData(draft);
        return didUpdate ? undefined : false;
      });
      return didUpdate;
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
    startSyncPolling: startSyncPolling,
    uid: uid,
    getDisplayNis: getDisplayNis
  };

  if (typeof window !== "undefined") {
    window.addEventListener("DOMContentLoaded", function () {
      initSync();
      startSyncPolling();
    });
  }
})();
