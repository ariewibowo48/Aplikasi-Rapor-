(function () {
  "use strict";

  var session = KBM.requireRole("admin");
  if (!session) return;

  var userInfo = document.getElementById("userInfo");
  var logoutBtn = document.getElementById("logoutBtn");
  var teacherTableBody = document.querySelector("#teacherTable tbody");

  userInfo.textContent = session.teacherName ? session.teacherName : session.username;

  logoutBtn.addEventListener("click", function () {
    KBM.clearSession();
    window.location.href = "login.html";
  });

  if (window.KBM_TEACHERS_SEED) {
    KBM.updateData(function (data) {
      return KBM.seedTeachers(data, window.KBM_TEACHERS_SEED);
    });
  }

  function formatRoles(roles, waliClass) {
    if (!roles || !roles.length) return "-";
    return roles
      .map(function (role) {
        if (role === "admin") return "Admin";
        if (role === "guru") return "Guru";
        if (role === "wali") return "Wali Kelas" + (waliClass ? " " + waliClass : "");
        return role;
      })
      .join(", ");
  }

  function renderTable() {
    var data = KBM.loadData();
    teacherTableBody.innerHTML = "";

    if (!data.teachers.length) {
      var row = document.createElement("tr");
      var cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "muted";
      cell.textContent = "Belum ada data guru.";
      row.appendChild(cell);
      teacherTableBody.appendChild(row);
      return;
    }

    data.teachers.forEach(function (teacher) {
      var row = document.createElement("tr");
      var subjects = teacher.subjects && teacher.subjects.length
        ? teacher.subjects.join(", ")
        : teacher.subjectRaw || "-";
      row.innerHTML =
        "<td>" +
        teacher.name +
        "</td><td>" +
        (teacher.nip || "-") +
        "</td><td>" +
        subjects +
        "</td><td>" +
        formatRoles(teacher.roles || [], teacher.waliClass) +
        "</td><td>" +
        (teacher.waliClass || "-") +
        "</td><td>" +
        teacher.username +
        "</td><td>" +
        teacher.password +
        "</td>";
      teacherTableBody.appendChild(row);
    });
  }

  renderTable();
})();
