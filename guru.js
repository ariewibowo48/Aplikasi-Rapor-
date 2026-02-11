(function () {
  "use strict";

  var session = KBM.requireRole("guru");
  if (!session) return;

  if (KBM.autoSeed) KBM.autoSeed();

  var userInfo = document.getElementById("userInfo");
  var logoutBtn = document.getElementById("logoutBtn");
  var assessmentControls = document.getElementById("assessmentControls");
  var classSelect = document.getElementById("classSelect");
  var assessmentFilter = document.getElementById("assessmentFilter");
  var subjectSelect = document.getElementById("subjectSelect");
  var scoreTable = document.getElementById("scoreTable");
  var subjectNotice = document.getElementById("subjectNotice");
  var submitScoresBtn = document.getElementById("submitScoresBtn");
  var editScoresBtn = document.getElementById("editScoresBtn");
  var lockStatus = document.getElementById("lockStatus");
  var saveWeightsBtn = document.getElementById("saveWeightsBtn");
  var weightsStatus = document.getElementById("weightsStatus");

  userInfo.textContent = session.teacherName ? session.teacherName : session.username;

  logoutBtn.addEventListener("click", function () {
    KBM.clearSession();
    window.location.href = "login.html";
  });

  function fillSelect(selectEl, options) {
    selectEl.innerHTML = "";
    options.forEach(function (optionValue) {
      var option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      selectEl.appendChild(option);
    });
  }

  fillSelect(classSelect, KBM.CLASSES);

  var hasRestriction = Array.isArray(session.subjects);
  var allowedSubjects = hasRestriction
    ? session.subjects.filter(function (subject) {
        return Boolean(subject) && KBM.SUBJECTS.indexOf(subject) !== -1;
      })
    : KBM.SUBJECTS.slice();

  fillSelect(subjectSelect, allowedSubjects);

  if (hasRestriction && allowedSubjects.length === 0) {
    subjectNotice.textContent =
      "Mapel tidak terdaftar untuk akun ini. Hubungi admin untuk memperbarui data guru.";
    subjectNotice.style.display = "block";
    subjectSelect.disabled = true;
    submitScoresBtn.disabled = true;
    editScoresBtn.disabled = true;
    lockStatus.textContent = "";
  } else {
    subjectNotice.style.display = "none";
    subjectSelect.disabled = false;
  }

  function renderAssessmentControls() {
    var data = KBM.loadData();
    var activeTypes = KBM.getActiveTypes(data);
    assessmentControls.innerHTML = "";

    KBM.ASSESSMENT_TYPES.forEach(function (type) {
      var wrapper = document.createElement("div");
      wrapper.className = "field";

      var label = document.createElement("label");
      label.textContent = type.label + (type.key === "PAJ" ? " (Kelas 9)" : "");

      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = activeTypes.indexOf(type.key) !== -1;

      var weight = document.createElement("input");
      weight.type = "number";
      weight.min = "0";
      weight.value = data.assessments.weights[type.key] || 0;
      weight.className = "table-input";
      weight.dataset.type = type.key;

      checkbox.addEventListener("change", function () {
        var next = activeTypes.slice();
        if (checkbox.checked) {
          if (next.indexOf(type.key) === -1) next.push(type.key);
        } else {
          next = next.filter(function (item) {
            return item !== type.key;
          });
        }

        KBM.updateData(function (draft) {
          KBM.setActiveTypes(draft, next);
        });
        updateFilterOptions();
        renderAssessmentControls();
        renderScoreTable();
      });

      wrapper.appendChild(label);
      wrapper.appendChild(checkbox);
      wrapper.appendChild(weight);
      assessmentControls.appendChild(wrapper);
    });
  }

  function saveWeights() {
    KBM.updateData(function (data) {
      var inputs = assessmentControls.querySelectorAll("input[data-type]");
      inputs.forEach(function (input) {
        var typeKey = input.dataset.type;
        var value = KBM.normalizeNumber(input.value);
        data.assessments.weights[typeKey] = value === null ? 0 : value;
      });
    });
    weightsStatus.textContent = "Bobot disimpan.";
  }

  function updateFilterOptions() {
    var data = KBM.loadData();
    var className = classSelect.value;
    var allowedTypes = KBM.getAllowedTypesForClass(KBM.getActiveTypes(data), className);
    var current = assessmentFilter.value || "all";

    assessmentFilter.innerHTML = "";
    var allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "Semua";
    assessmentFilter.appendChild(allOption);

    allowedTypes.forEach(function (typeKey) {
      var meta = KBM.getTypeMeta(typeKey);
      var option = document.createElement("option");
      option.value = typeKey;
      option.textContent = meta ? meta.label : typeKey;
      assessmentFilter.appendChild(option);
    });

    if (current && allowedTypes.indexOf(current) !== -1) {
      assessmentFilter.value = current;
    } else {
      assessmentFilter.value = "all";
    }
  }

  function renderScoreTable() {
    var data = KBM.loadData();
    var className = classSelect.value;
    var subject = subjectSelect.value;
    if (!subject) return;
    var lockKey = className + "::" + subject;
    var isLocked = Boolean(data.scoreLocks && data.scoreLocks[lockKey]);
    var activeTypes = KBM.getAllowedTypesForClass(KBM.getActiveTypes(data), className);
    var filterType = assessmentFilter.value;
    var displayTypes =
      filterType && filterType !== "all" && activeTypes.indexOf(filterType) !== -1
        ? [filterType]
        : activeTypes;

    var thead = scoreTable.querySelector("thead");
    var tbody = scoreTable.querySelector("tbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";

    if (!displayTypes.length) {
      var noRow = document.createElement("tr");
      var noCell = document.createElement("td");
      noCell.colSpan = 3;
      noCell.className = "muted";
      noCell.textContent = "Aktifkan jenis penilaian terlebih dahulu.";
      noRow.appendChild(noCell);
      tbody.appendChild(noRow);
      submitScoresBtn.disabled = true;
      editScoresBtn.disabled = true;
      lockStatus.textContent = "";
      return;
    }

    var columns = [];
    displayTypes.forEach(function (typeKey) {
      columns.push({ kind: "score", typeKey: typeKey });
      if (typeKey === "PH1" || typeKey === "PH2" || typeKey === "PH3") {
        columns.push({ kind: "remedial", typeKey: typeKey });
      }
    });

    var headRow = document.createElement("tr");
    ["Nama", "NIS", "NISN"]
      .concat(
        columns.map(function (col) {
          if (col.kind === "score") return col.typeKey;
          return "Remedial " + col.typeKey;
        })
      )
      .forEach(function (title) {
        var th = document.createElement("th");
        var meta = KBM.getTypeMeta(title);
        th.textContent = meta ? meta.label : title;
        headRow.appendChild(th);
      });
    thead.appendChild(headRow);

    var students = data.students
      .filter(function (student) {
        return student.className === className;
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });

    if (!students.length) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 3 + columns.length;
      emptyCell.className = "muted";
      emptyCell.textContent = "Belum ada siswa di kelas ini.";
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
      submitScoresBtn.disabled = true;
      editScoresBtn.disabled = true;
      lockStatus.textContent = "";
      return;
    }

    students.forEach(function (student) {
      var row = document.createElement("tr");
      row.innerHTML =
        "<td>" +
        student.name +
        "</td><td>" +
        KBM.getDisplayNis(student) +
        "</td><td>" +
        (student.nisn || "-") +
        "</td>";

      var remedialRefs = {};

      function updateRemedialVisibility(typeKey, baseValue) {
        var ref = remedialRefs[typeKey];
        if (!ref) return;
        var show = baseValue !== null && baseValue < 60;
        ref.input.style.display = show ? "block" : "none";
        ref.placeholder.style.display = show ? "none" : "inline";
        ref.badge.style.display = show ? "inline-flex" : "none";
      }

      columns.forEach(function (column) {
        var cell = document.createElement("td");

        if (column.kind === "score") {
          var input = document.createElement("input");
          input.type = "number";
          input.min = "0";
          input.max = "100";
          input.className = "table-input";
          input.disabled = isLocked;
          var currentValue = KBM.getScore(data, student.id, subject, column.typeKey);
          if (currentValue !== null) input.value = currentValue;

          input.addEventListener("input", function () {
            var value = KBM.normalizeNumber(input.value);
            KBM.updateData(function (draft) {
              KBM.setScore(draft, student.id, subject, column.typeKey, value);
            });
            updateRemedialVisibility(column.typeKey, value);
          });

          cell.appendChild(input);
        } else if (column.kind === "remedial") {
          var badge = document.createElement("span");
          badge.className = "remedial-badge";
          badge.textContent = "Remedial";

          var remInput = document.createElement("input");
          remInput.type = "number";
          remInput.min = "0";
          remInput.max = "100";
          remInput.className = "table-input";
          remInput.disabled = isLocked;

          var placeholder = document.createElement("span");
          placeholder.textContent = "-";
          placeholder.className = "muted";

          var remValue = KBM.getRemedial(data, student.id, subject, column.typeKey);
          if (remValue !== null) remInput.value = remValue;

          remInput.addEventListener("input", function () {
            var value = KBM.normalizeNumber(remInput.value);
            KBM.updateData(function (draft) {
              KBM.setRemedial(draft, student.id, subject, column.typeKey, value);
            });
          });

          remedialRefs[column.typeKey] = { input: remInput, placeholder: placeholder, badge: badge };
          cell.appendChild(badge);
          cell.appendChild(placeholder);
          cell.appendChild(remInput);

          var baseScore = KBM.getScore(data, student.id, subject, column.typeKey);
          updateRemedialVisibility(column.typeKey, baseScore);
        }

        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    submitScoresBtn.disabled = isLocked;
    editScoresBtn.disabled = !isLocked;
    lockStatus.textContent = isLocked
      ? "Nilai terkunci. Klik Edit Nilai untuk membuka."
      : "Nilai bisa diedit. Klik Kirim Nilai untuk mengunci.";
  }

  classSelect.addEventListener("change", function () {
    updateFilterOptions();
    renderScoreTable();
  });

  subjectSelect.addEventListener("change", function () {
    renderScoreTable();
  });

  assessmentFilter.addEventListener("change", function () {
    renderScoreTable();
  });

  saveWeightsBtn.addEventListener("click", function () {
    saveWeights();
  });

  submitScoresBtn.addEventListener("click", function () {
    var className = classSelect.value;
    var subject = subjectSelect.value;
    if (!className || !subject) return;
    KBM.updateData(function (data) {
      if (!data.scoreLocks) data.scoreLocks = {};
      data.scoreLocks[className + "::" + subject] = true;
    });
    renderScoreTable();
  });

  editScoresBtn.addEventListener("click", function () {
    var className = classSelect.value;
    var subject = subjectSelect.value;
    if (!className || !subject) return;
    KBM.updateData(function (data) {
      if (!data.scoreLocks) data.scoreLocks = {};
      delete data.scoreLocks[className + "::" + subject];
    });
    renderScoreTable();
  });

  renderAssessmentControls();
  updateFilterOptions();
  renderScoreTable();
})();
