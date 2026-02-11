(function () {
  "use strict";

  var session = KBM.requireRole("admin");
  if (!session) return;

  var userInfo = document.getElementById("userInfo");
  var logoutBtn = document.getElementById("logoutBtn");
  var assessmentSelect = document.getElementById("assessmentSelect");
  var progressTable = document.getElementById("progressTable");
  var attendanceTableBody = document.querySelector("#attendanceProgress tbody");

  userInfo.textContent = session.teacherName ? session.teacherName : session.username;

  logoutBtn.addEventListener("click", function () {
    KBM.clearSession();
    window.location.href = "login.html";
  });

  if (window.KBM_TEACHERS_SEED) {
    KBM.updateData(function (data) {
      KBM.seedTeachers(data, window.KBM_TEACHERS_SEED);
    });
  }

  function fillAssessmentSelect() {
    var data = KBM.loadData();
    var activeTypes = KBM.getActiveTypes(data);
    assessmentSelect.innerHTML = "";

    if (!activeTypes.length) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Belum ada penilaian aktif";
      assessmentSelect.appendChild(opt);
      assessmentSelect.disabled = true;
      return;
    }

    activeTypes.forEach(function (typeKey) {
      var meta = KBM.getTypeMeta(typeKey);
      var option = document.createElement("option");
      option.value = typeKey;
      option.textContent = meta ? meta.label : typeKey;
      assessmentSelect.appendChild(option);
    });
    assessmentSelect.disabled = false;
  }

  function renderProgressTable() {
    var data = KBM.loadData();
    var typeKey = assessmentSelect.value;
    var thead = progressTable.querySelector("thead");
    var tbody = progressTable.querySelector("tbody");
    thead.innerHTML = "";
    tbody.innerHTML = "";

    if (!typeKey) {
      return;
    }

    var headRow = document.createElement("tr");
    var first = document.createElement("th");
    first.textContent = "Mata Pelajaran";
    headRow.appendChild(first);

    KBM.CLASSES.forEach(function (className) {
      var th = document.createElement("th");
      th.textContent = className;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    KBM.SUBJECTS.forEach(function (subject) {
      var row = document.createElement("tr");
      var subjectCell = document.createElement("td");
      subjectCell.textContent = subject;
      row.appendChild(subjectCell);

      KBM.CLASSES.forEach(function (className) {
        var cell = document.createElement("td");
        var allowedTypes = KBM.getAllowedTypesForClass(KBM.getActiveTypes(data), className);
        if (allowedTypes.indexOf(typeKey) === -1) {
          cell.textContent = "-";
          row.appendChild(cell);
          return;
        }

        var students = data.students.filter(function (student) {
          return student.className === className;
        });
        var total = students.length;
        if (!total) {
          cell.textContent = "-";
          row.appendChild(cell);
          return;
        }

        var filled = students.filter(function (student) {
          return KBM.getScore(data, student.id, subject, typeKey) !== null;
        }).length;

        var percent = Math.round((filled / total) * 100);
        cell.textContent = filled + "/" + total + " (" + percent + "%)";
        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });
  }

  function hasAttendance(att) {
    if (!att) return false;
    return ["hadir", "sakit", "izin", "alpa"].some(function (field) {
      return att[field] !== undefined && att[field] !== null;
    });
  }

  function renderAttendanceProgress() {
    var data = KBM.loadData();
    attendanceTableBody.innerHTML = "";

    KBM.CLASSES.forEach(function (className) {
      var students = data.students.filter(function (student) {
        return student.className === className;
      });
      var total = students.length;
      var filled = students.filter(function (student) {
        return hasAttendance(data.attendance[student.id]);
      }).length;
      var percent = total ? Math.round((filled / total) * 100) : 0;

      var row = document.createElement("tr");
      row.innerHTML =
        "<td>" +
        className +
        "</td><td>" +
        filled +
        "</td><td>" +
        total +
        "</td><td>" +
        (total ? percent + "%" : "-") +
        "</td>";
      attendanceTableBody.appendChild(row);
    });
  }

  assessmentSelect.addEventListener("change", renderProgressTable);

  fillAssessmentSelect();
  renderProgressTable();
  renderAttendanceProgress();
})();
