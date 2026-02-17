(function () {
  "use strict";

  var session = KBM.requireRole("admin");
  if (!session) return;

  var roleBadge = document.getElementById("roleBadge");
  var userInfo = document.getElementById("userInfo");
  var logoutBtn = document.getElementById("logoutBtn");

  roleBadge.textContent = "Admin";
  userInfo.textContent = session.teacherName ? session.teacherName : session.username;

  if (window.KBM_TEACHERS_SEED) {
    KBM.updateData(function (data) {
      return KBM.seedTeachers(data, window.KBM_TEACHERS_SEED);
    });
  }

  logoutBtn.addEventListener("click", function () {
    KBM.clearSession();
    window.location.href = "login.html";
  });

  var waliForm = document.getElementById("waliForm");
  var waliName = document.getElementById("waliName");
  var waliNip = document.getElementById("waliNip");
  var waliClass = document.getElementById("waliClass");
  var waliList = document.getElementById("waliList");
  var waliSubmit = document.getElementById("waliSubmit");
  var waliCancel = document.getElementById("waliCancel");

  var studentForm = document.getElementById("studentForm");
  var studentName = document.getElementById("studentName");
  var studentNis = document.getElementById("studentNis");
  var studentNisn = document.getElementById("studentNisn");
  var studentClass = document.getElementById("studentClass");
  var studentTableBody = document.querySelector("#studentTable tbody");
  var studentSubmit = document.getElementById("studentSubmit");
  var studentCancel = document.getElementById("studentCancel");

  var importBtn = document.getElementById("importBtn");
  var importFile = document.getElementById("importFile");
  var importSeedBtn = document.getElementById("importSeedBtn");

  var editingWaliId = null;
  var editingStudentId = null;

  function fillClassSelect(selectEl) {
    selectEl.innerHTML = "";
    KBM.CLASSES.forEach(function (className) {
      var option = document.createElement("option");
      option.value = className;
      option.textContent = className;
      selectEl.appendChild(option);
    });
  }

  fillClassSelect(waliClass);
  fillClassSelect(studentClass);

  function resetWaliForm() {
    editingWaliId = null;
    waliForm.reset();
    waliSubmit.textContent = "Tambahkan Wali Kelas";
    waliCancel.style.display = "none";
  }

  function resetStudentForm() {
    editingStudentId = null;
    studentForm.reset();
    studentSubmit.textContent = "Tambahkan Siswa";
    studentCancel.style.display = "none";
  }

  function renderWaliList() {
    var data = KBM.loadData();
    waliList.innerHTML = "";

    if (!data.homerooms.length) {
      var empty = document.createElement("div");
      empty.className = "notice";
      empty.textContent = "Belum ada wali kelas yang ditambahkan.";
      waliList.appendChild(empty);
      return;
    }

    data.homerooms
      .slice()
      .sort(function (a, b) {
        return a.className.localeCompare(b.className);
      })
      .forEach(function (item) {
        var li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML =
          "<div><strong>" +
          item.className +
          "</strong> • " +
          item.name +
          "</div><div class=\"muted\">NIP: " +
          item.nip +
          "</div>";

        var actions = document.createElement("div");
        actions.className = "list-actions";

        var editBtn = document.createElement("button");
        editBtn.className = "btn btn-secondary";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () {
          editingWaliId = item.id;
          waliName.value = item.name;
          waliNip.value = item.nip;
          waliClass.value = item.className;
          waliSubmit.textContent = "Simpan Perubahan";
          waliCancel.style.display = "inline-flex";
        });

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-danger";
        deleteBtn.textContent = "Hapus";
        deleteBtn.addEventListener("click", function () {
          KBM.updateData(function (dataUpdate) {
            dataUpdate.homerooms = dataUpdate.homerooms.filter(function (itemUpdate) {
              return itemUpdate.id !== item.id;
            });
          });
          renderWaliList();
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        li.appendChild(actions);
        waliList.appendChild(li);
      });
  }

  function renderStudentTable() {
    var data = KBM.loadData();
    studentTableBody.innerHTML = "";

    if (!data.students.length) {
      var row = document.createElement("tr");
      var cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "muted";
      cell.textContent = "Belum ada data siswa.";
      row.appendChild(cell);
      studentTableBody.appendChild(row);
      return;
    }

    data.students
      .slice()
      .sort(function (a, b) {
        return a.className.localeCompare(b.className) || a.name.localeCompare(b.name);
      })
      .forEach(function (student) {
      var row = document.createElement("tr");
      row.innerHTML =
        "<td>" +
        student.name +
        "</td><td>" +
        (student.nis || "-") +
        "</td><td>" +
        (student.nisn || "-") +
        "</td><td>" +
        student.className +
        "</td>";

        var actionCell = document.createElement("td");
        var editBtn = document.createElement("button");
        editBtn.className = "btn btn-secondary";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () {
          editingStudentId = student.id;
          studentName.value = student.name;
          studentNis.value = student.nis || "";
          studentNisn.value = student.nisn || "";
          studentClass.value = student.className;
          studentSubmit.textContent = "Simpan Perubahan";
          studentCancel.style.display = "inline-flex";
        });

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-danger";
        deleteBtn.textContent = "Hapus";
        deleteBtn.addEventListener("click", function () {
          KBM.updateData(function (dataUpdate) {
            dataUpdate.students = dataUpdate.students.filter(function (item) {
              return item.id !== student.id;
            });
            delete dataUpdate.scores[student.id];
            delete dataUpdate.attendance[student.id];
          });
          renderStudentTable();
        });

        actionCell.appendChild(editBtn);
        actionCell.appendChild(deleteBtn);
        row.appendChild(actionCell);
        studentTableBody.appendChild(row);
      });
  }

  waliForm.addEventListener("submit", function (event) {
    event.preventDefault();

    var name = waliName.value.trim();
    var nip = waliNip.value.trim();
    var className = waliClass.value;

    if (!name || !nip) return;

    KBM.updateData(function (data) {
      if (editingWaliId) {
        var target = data.homerooms.find(function (item) {
          return item.id === editingWaliId;
        });
        if (target) {
          target.name = name;
          target.nip = nip;
          target.className = className;
        }
      } else {
        var existing = data.homerooms.find(function (item) {
          return item.className === className;
        });
        if (existing) {
          existing.name = name;
          existing.nip = nip;
        } else {
          data.homerooms.push({
            id: KBM.uid(),
            name: name,
            nip: nip,
            className: className
          });
        }
      }
    });

    resetWaliForm();
    renderWaliList();
  });

  waliCancel.addEventListener("click", function () {
    resetWaliForm();
  });

  studentForm.addEventListener("submit", function (event) {
    event.preventDefault();

    var name = studentName.value.trim();
    var nis = studentNis.value.trim();
    var nisn = studentNisn.value.trim();
    var className = studentClass.value;
    if (!name || (!nis && !nisn)) return;

    KBM.updateData(function (data) {
      if (editingStudentId) {
        var target = data.students.find(function (item) {
          return item.id === editingStudentId;
        });
        if (target) {
          target.name = name;
          target.nis = nis;
          target.nisn = nisn;
          target.className = className;
        }
      } else {
        data.students.push({
          id: KBM.uid(),
          name: name,
          nis: nis,
          nisn: nisn,
          className: className
        });
      }
    });

    resetStudentForm();
    renderStudentTable();
  });

  studentCancel.addEventListener("click", function () {
    resetStudentForm();
  });

  function matchSubject(subjectName) {
    return KBM.SUBJECTS.find(function (subject) {
      return subject.toLowerCase() === subjectName.toLowerCase();
    }) || null;
  }

  function parseScoreColumns(row, data, studentId) {
    Object.keys(row).forEach(function (key) {
      var rawKey = String(key).trim();
      if (!rawKey) return;

      var match = rawKey.match(/^(.*)\s+(PH\s*1|PH\s*2|PH\s*3|PTS|PAS|PAJ)$/i);
      if (!match) return;

      var subjectName = match[1].trim();
      var typeLabel = match[2].toUpperCase().replace(/\s+/g, "");
      var subject = matchSubject(subjectName);
      if (!subject) return;

      var typeKey = typeLabel;
      if (typeKey === "PH1" || typeKey === "PH2" || typeKey === "PH3" || typeKey === "PTS" || typeKey === "PAS" || typeKey === "PAJ") {
        var value = KBM.normalizeNumber(row[key]);
        if (value !== null) {
          KBM.setScore(data, studentId, subject, typeKey, value);
        }
      }
    });
  }

  function parseAttendance(row, data, studentId) {
    var fields = {
      hadir: row["Hadir"],
      sakit: row["Sakit"],
      izin: row["Izin"],
      alpa: row["Alpa"]
    };
    Object.keys(fields).forEach(function (key) {
      var value = KBM.normalizeNumber(fields[key]);
      if (value !== null) {
        KBM.setAttendance(data, studentId, key, value);
      }
    });
  }

  function handleImport(workbook) {
    var sheetName = workbook.SheetNames[0];
    var sheet = workbook.Sheets[sheetName];
    var rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rows.length) return;

    KBM.updateData(function (data) {
      rows.forEach(function (row) {
        var name = String(row.Nama || row.nama || "").trim();
        var nis = String(row.NIS || row.nis || "").trim();
        var nisn = String(row.NISN || row.nisn || "").trim();
        var combo = String(row["NIS/NISN"] || row["nis/nisn"] || "").trim();
        var className = String(row.Kelas || row.kelas || "").trim();

        if (combo && (!nis || !nisn)) {
          var parts = combo.split("/").map(function (item) {
            return item.trim();
          }).filter(Boolean);
          if (parts.length === 1) {
            if (!nisn) nisn = parts[0];
          } else if (parts.length >= 2) {
            if (!nis) nis = parts[0];
            if (!nisn) nisn = parts[parts.length - 1];
          }
        }

        if (!name || (!nis && !nisn) || !className) return;

        var student = data.students.find(function (item) {
          return (nisn && item.nisn === nisn) || (nis && item.nis === nis);
        });

        if (!student) {
          student = {
            id: KBM.uid(),
            name: name,
            nis: nis,
            nisn: nisn,
            className: className
          };
          data.students.push(student);
        } else {
          student.name = name;
          student.nis = nis || student.nis;
          student.nisn = nisn || student.nisn;
          student.className = className;
        }

        parseScoreColumns(row, data, student.id);
        parseAttendance(row, data, student.id);
      });
    });

    renderStudentTable();
  }

  function importSeedStudents() {
    if (!window.KBM_SEED_STUDENTS || !window.KBM_SEED_STUDENTS.length) return;

    KBM.updateData(function (data) {
      window.KBM_SEED_STUDENTS.forEach(function (student) {
        if (!student.name || !student.className) return;

        var existing =
          data.students.find(function (item) {
            return student.nisn && item.nisn === student.nisn;
          }) ||
          data.students.find(function (item) {
            return student.nis && item.nis === student.nis;
          });

        if (!existing) {
          data.students.push({
            id: KBM.uid(),
            name: student.name,
            nis: student.nis || "",
            nisn: student.nisn || "",
            className: student.className
          });
        }
      });
    });

    renderStudentTable();
  }

  importBtn.addEventListener("click", function () {
    if (!importFile.files.length) return;
    var file = importFile.files[0];
    var reader = new FileReader();
    reader.onload = function (event) {
      var data = new Uint8Array(event.target.result);
      var workbook = XLSX.read(data, { type: "array" });
      handleImport(workbook);
    };
    reader.readAsArrayBuffer(file);
  });

  importSeedBtn.addEventListener("click", function () {
    importSeedStudents();
  });

  renderWaliList();
  renderStudentTable();
})();
