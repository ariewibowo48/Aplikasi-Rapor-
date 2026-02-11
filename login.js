(function () {
  "use strict";

  var staffLoginForm = document.getElementById("staffLoginForm");
  var studentLoginForm = document.getElementById("studentLoginForm");
  var loginRole = document.getElementById("loginRole");
  var loginWaliInfo = document.getElementById("loginWaliInfo");
  var loginError = document.getElementById("loginError");
  var studentLoginError = document.getElementById("studentLoginError");
  var loginNotice = document.getElementById("loginNotice");

  var tabs = document.querySelectorAll(".tab");

  function setActiveTab(tabName) {
    tabs.forEach(function (tab) {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    });
    staffLoginForm.classList.toggle("active", tabName === "staff");
    studentLoginForm.classList.toggle("active", tabName === "student");
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      setActiveTab(tab.dataset.tab);
    });
  });

  function showError(el, message) {
    el.textContent = message;
    el.classList.remove("hidden");
  }

  function hideError(el) {
    el.classList.add("hidden");
  }

  function updateNotice() {
    loginNotice.textContent = "Login guru/admin/wali menggunakan akun dari data guru.";
  }

  function findTeacherByUsername(data, username) {
    return (data.teachers || []).find(function (teacher) {
      return teacher.username === username;
    });
  }

  function updateWaliInfo() {
    var data = KBM.loadData();
    var username = document.getElementById("loginUsername").value.trim();
    var role = loginRole.value;
    loginWaliInfo.classList.add("hidden");
    if (!username || role !== "wali") return;

    var teacher = findTeacherByUsername(data, username);
    if (teacher && teacher.waliClass) {
      loginWaliInfo.textContent = "Kelas otomatis: " + teacher.waliClass;
    } else {
      loginWaliInfo.textContent = "Kelas wali belum terdaftar untuk akun ini.";
    }
    loginWaliInfo.classList.remove("hidden");
  }

  updateNotice();
  if (KBM.autoSeed) KBM.autoSeed();
  updateWaliInfo();

  loginRole.addEventListener("change", updateWaliInfo);
  document.getElementById("loginUsername").addEventListener("input", updateWaliInfo);

  staffLoginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    hideError(loginError);

    var username = document.getElementById("loginUsername").value.trim();
    var password = document.getElementById("loginPassword").value.trim();
    var role = loginRole.value;

    var data = KBM.loadData();
    if (KBM.autoSeed) KBM.autoSeed();

    var user = data.users.find(function (item) {
      return item.username === username && item.password === password && item.role === role;
    });

    if (user) {
      KBM.setSession({
        username: user.username,
        role: role
      });
      window.location.href = role === "admin" ? "admin.html" : role === "guru" ? "guru.html" : "wali.html";
      return;
    }

    var teacher = (data.teachers || []).find(function (item) {
      return item.username === username && item.password === password;
    });

    if (!teacher) {
      showError(loginError, "Akun tidak ditemukan. Cek username, password, atau peran.");
      return;
    }

    if (!teacher.roles || teacher.roles.indexOf(role) === -1) {
      showError(loginError, "Peran tidak tersedia untuk akun ini.");
      return;
    }

    if (role === "wali" && !teacher.waliClass) {
      showError(loginError, "Akun ini belum terdaftar sebagai wali kelas.");
      return;
    }

    KBM.setSession({
      username: teacher.username,
      role: role,
      className: role === "wali" ? teacher.waliClass : null,
      subjects: role === "guru" ? teacher.subjects || [] : [],
      teacherName: teacher.name,
      teacherNip: teacher.nip
    });

    window.location.href = role === "admin" ? "admin.html" : role === "guru" ? "guru.html" : "wali.html";
  });

  studentLoginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    hideError(studentLoginError);

    var nisn = document.getElementById("studentNisn").value.trim();
    var password = document.getElementById("studentPassword").value.trim();

    if (!nisn || !password) {
      showError(studentLoginError, "NISN dan password wajib diisi.");
      return;
    }

    if (password !== "123456") {
      showError(studentLoginError, "Password salah.");
      return;
    }

    var data = KBM.loadData();
    var student = data.students.find(function (item) {
      return item.nisn === nisn;
    });

    if (!student) {
      showError(studentLoginError, "NISN tidak ditemukan.");
      return;
    }

    KBM.setSession({
      role: "student",
      studentId: student.id,
      nisn: student.nisn
    });

    window.location.href = "student.html";
  });
})();
