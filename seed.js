(function () {
  "use strict";

  var seedBtn = document.getElementById("seedBtn");
  var seedReset = document.getElementById("seedReset");
  var seedStatus = document.getElementById("seedStatus");

  function updateStatus(message, isWarn) {
    seedStatus.textContent = message;
    seedStatus.className = isWarn ? "notice notice-warn" : "notice";
  }

  function matchStudent(existing, incoming) {
    if (incoming.nisn && existing.nisn === incoming.nisn) return true;
    if (incoming.nis && existing.nis === incoming.nis) return true;
    return existing.name === incoming.name && existing.className === incoming.className;
  }

  seedBtn.addEventListener("click", function () {
    if (!window.KBM_SEED_STUDENTS || !window.KBM_SEED_STUDENTS.length) {
      updateStatus("Data seed tidak ditemukan.", true);
      return;
    }

    var data = KBM.loadData();
    var added = 0;
    var updated = 0;

    window.KBM_SEED_STUDENTS.forEach(function (student) {
      if (!student.name || !student.className) return;

      var existing = data.students.find(function (item) {
        return matchStudent(item, student);
      });

      if (existing) {
        existing.name = student.name;
        existing.nis = student.nis || existing.nis;
        existing.nisn = student.nisn || existing.nisn;
        existing.className = student.className;
        updated += 1;
      } else {
        data.students.push({
          id: KBM.uid(),
          name: student.name,
          nis: student.nis || "",
          nisn: student.nisn || "",
          className: student.className
        });
        added += 1;
      }
    });

    KBM.saveData(data);
    updateStatus("Impor selesai. Ditambah: " + added + ", diperbarui: " + updated + ".");
  });

  seedReset.addEventListener("click", function () {
    if (!confirm("Hapus semua data siswa, nilai, dan kehadiran?")) return;

    KBM.updateData(function (data) {
      data.students = [];
      data.scores = {};
      data.attendance = {};
    });

    updateStatus("Data siswa, nilai, dan kehadiran sudah dibersihkan.", true);
  });
})();
