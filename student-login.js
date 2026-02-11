(function () {
  "use strict";

  var form = document.getElementById("studentLoginForm");
  var errorEl = document.getElementById("studentLoginError");

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }

  function hideError() {
    errorEl.classList.add("hidden");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    hideError();

    var nisn = document.getElementById("studentNisn").value.trim();
    var password = document.getElementById("studentPassword").value.trim();

    if (!nisn || !password) {
      showError("NISN dan password wajib diisi.");
      return;
    }

    if (password !== "123456") {
      showError("Password salah.");
      return;
    }

    var data = KBM.loadData();
    var student = data.students.find(function (item) {
      return item.nisn === nisn;
    });

    if (!student) {
      showError("NISN tidak ditemukan.");
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
