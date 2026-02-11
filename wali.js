(function () {
  "use strict";

  var session = KBM.requireRole("wali");
  if (!session) return;

  if (KBM.autoSeed) KBM.autoSeed();

  var className = session.className;
  if (!className) {
    KBM.clearSession();
    window.location.href = "login.html";
    return;
  }

  var userInfo = document.getElementById("userInfo");
  var logoutBtn = document.getElementById("logoutBtn");
  var classBadge = document.getElementById("classBadge");

  var attendanceBody = document.querySelector("#attendanceTable tbody");
  var assessmentSelect = document.getElementById("assessmentSelect");
  var rekapAssessmentSelect = document.getElementById("rekapAssessmentSelect");
  var performanceAssessmentSelect = document.getElementById("performanceAssessmentSelect");
  var rekapTable = document.getElementById("rekapTable");
  var rekapTableBody = document.querySelector("#rekapTable tbody");
  var performanceList = document.getElementById("performanceList");
  var studentSelect = document.getElementById("studentSelect");
  var printStudentBtn = document.getElementById("printStudent");
  var printClassBtn = document.getElementById("printClass");

  var reportTitle = document.getElementById("reportTitle");
  var reportSubtitle = document.getElementById("reportSubtitle");
  var reportStudentInfo = document.getElementById("reportStudentInfo");
  var reportDate = document.getElementById("reportDate");
  var reportTableBody = document.querySelector("#reportTable tbody");

  var navButtons = document.querySelectorAll(".nav-btn");
  var sections = {
    attendance: document.getElementById("section-attendance"),
    recap: document.getElementById("section-recap"),
    report: document.getElementById("section-report"),
    performance: document.getElementById("section-performance")
  };

  userInfo.textContent = session.teacherName ? session.teacherName : session.username;
  classBadge.textContent = "Kelas " + className;

  logoutBtn.addEventListener("click", function () {
    KBM.clearSession();
    window.location.href = "login.html";
  });

  navButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var target = button.getAttribute("data-target");
      Object.keys(sections).forEach(function (key) {
        var section = sections[key];
        if (!section) return;
        section.classList.toggle("section-hidden", section.id !== target);
      });
      navButtons.forEach(function (btn) {
        btn.classList.toggle("active", btn === button);
      });
    });
  });

  function getStudentsByClass(data) {
    return data.students.filter(function (student) {
      return student.className === className;
    });
  }

  function fillAssessmentSelect() {
    var data = KBM.loadData();
    var activeTypes = KBM.getAllowedTypesForClass(KBM.getActiveTypes(data), className);
    var selects = [assessmentSelect, rekapAssessmentSelect, performanceAssessmentSelect];
    selects.forEach(function (select) {
      if (!select) return;
      select.innerHTML = "";
      if (!activeTypes.length) {
        var emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "Belum ada penilaian aktif";
        select.appendChild(emptyOption);
      } else {
        activeTypes.forEach(function (typeKey) {
          var meta = KBM.getTypeMeta(typeKey);
          var option = document.createElement("option");
          option.value = typeKey;
          option.textContent = meta ? meta.label : typeKey;
          select.appendChild(option);
        });
      }

      select.disabled = !activeTypes.length;
    });

    printStudentBtn.disabled = !activeTypes.length;
    printClassBtn.disabled = !activeTypes.length;
  }

  function fillStudentSelect() {
    var data = KBM.loadData();
    var students = getStudentsByClass(data);
    studentSelect.innerHTML = "";

    if (!students.length) {
      var emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "Belum ada siswa";
      studentSelect.appendChild(emptyOption);
      studentSelect.disabled = true;
      printStudentBtn.disabled = true;
      printClassBtn.disabled = true;
      return;
    }

    studentSelect.disabled = false;
    printStudentBtn.disabled = false;
    printClassBtn.disabled = false;
    students.forEach(function (student) {
      var option = document.createElement("option");
      option.value = student.id;
      option.textContent = student.name + " (" + KBM.getDisplayNis(student) + ")";
      studentSelect.appendChild(option);
    });
  }

  function renderAttendanceTable() {
    var data = KBM.loadData();
    var students = getStudentsByClass(data);
    attendanceBody.innerHTML = "";

    if (!students.length) {
      var row = document.createElement("tr");
      var cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "muted";
      cell.textContent = "Belum ada siswa di kelas ini.";
      row.appendChild(cell);
      attendanceBody.appendChild(row);
      return;
    }

    students.forEach(function (student) {
      var attendance = KBM.getAttendance(data, student.id);
      var row = document.createElement("tr");
      row.innerHTML =
        "<td>" +
        student.name +
        "</td><td>" +
        KBM.getDisplayNis(student) +
        "</td><td>" +
        (student.nisn || "-") +
        "</td>";

      ["hadir", "sakit", "izin", "alpa"].forEach(function (field) {
        var cell = document.createElement("td");
        var input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.className = "table-input";
        input.value = attendance[field] || 0;
        input.addEventListener("input", function () {
          var value = KBM.normalizeNumber(input.value);
          KBM.updateData(function (draft) {
            KBM.setAttendance(draft, student.id, field, value === null ? 0 : value);
          });
        });
        cell.appendChild(input);
        row.appendChild(cell);
      });

      attendanceBody.appendChild(row);
    });
  }

  function buildTrendElement(trend) {
    var span = document.createElement("span");
    span.className = "trend " + trend;

    if (trend === "up") span.textContent = "↑ Naik";
    else if (trend === "down") span.textContent = "↓ Turun";
    else if (trend === "same") span.textContent = "→ Stabil";
    else span.textContent = "-";

    return span;
  }

  function renderReportPreview() {
    var data = KBM.loadData();
    var students = getStudentsByClass(data);
    var student = students.find(function (item) {
      return item.id === studentSelect.value;
    });

    var typeKey = assessmentSelect.value;
    if (!typeKey) {
      reportTitle.textContent = "KEMAJUAN BELAJAR MURID";
      reportSubtitle.textContent = "Aktifkan jenis penilaian untuk melihat rapor.";
      reportStudentInfo.textContent = "";
      reportDate.textContent = "";
      reportTableBody.innerHTML = "";
      return;
    }
    var typeMeta = KBM.getTypeMeta(typeKey);
    var previousType = KBM.getPreviousType(typeKey);

    reportTitle.textContent = "KEMAJUAN BELAJAR MURID";
    reportSubtitle.textContent = (typeMeta ? typeMeta.label : typeKey) + " - " + (student ? student.name : "-");
    reportStudentInfo.textContent = student
      ? "NIS: " + (student.nis || "-") + " • NISN: " + (student.nisn || "-")
      : "";
    reportDate.textContent = "Tanggal Cetak: " + KBM.formatDate(new Date());

    reportTableBody.innerHTML = "";

    KBM.SUBJECTS.forEach(function (subject) {
      var label = student ? KBM.getSubjectLabel(subject, student.name) : subject;
      var row = document.createElement("tr");
      var current = student ? KBM.getEffectiveScore(data, student.id, subject, typeKey) : null;
      var previous =
        previousType && student
          ? KBM.getEffectiveScore(data, student.id, subject, previousType)
          : null;
      var trend = KBM.computeTrend(current, previous);

      var valueCell = document.createElement("td");
      valueCell.textContent = current !== null ? current : "-";

      var trendCell = document.createElement("td");
      trendCell.appendChild(buildTrendElement(trend));

      row.innerHTML = "<td>" + label + "</td>";
      row.appendChild(valueCell);
      row.appendChild(trendCell);
      reportTableBody.appendChild(row);
    });
  }

  function calculateAverage(data, student, typeKey) {
    var values = KBM.SUBJECTS.map(function (subject) {
      return KBM.getEffectiveScore(data, student.id, subject, typeKey);
    }).filter(function (value) {
      return value !== null;
    });

    if (!values.length) return null;
    var total = values.reduce(function (a, b) {
      return a + b;
    }, 0);
    return Math.round((total / values.length) * 100) / 100;
  }

  function renderRecapTable() {
    var data = KBM.loadData();
    var students = getStudentsByClass(data);
    var typeKey = rekapAssessmentSelect.value;
    var rekapHead = rekapTable.querySelector("thead");
    rekapHead.innerHTML = "";
    rekapTableBody.innerHTML = "";

    if (!typeKey) return;

    function getSubjectAbbr(subject) {
      var map = {
        "Pendidikan Agama Islam dan Budi Pekerti": "PAI-BP",
        PPKn: "PPKn",
        "Bahasa Indonesia": "B.Ind",
        Matematika: "Mat",
        IPA: "IPA",
        IPS: "IPS",
        "Bahasa Inggris": "B.Ing",
        "Seni Budaya": "SB",
        PJOK: "PJOK",
        Informatika: "Inf",
        "Pendidikan Al Qur'an": "Al Qur'an"
      };
      return map[subject] || subject;
    }

    var headRow = document.createElement("tr");
    ["Nama", "NIS", "NISN"]
      .concat(
        KBM.SUBJECTS.map(function (subject) {
          return getSubjectAbbr(subject);
        })
      )
      .concat(["Total", "Rata-rata"])
      .forEach(function (title) {
        var th = document.createElement("th");
        th.textContent = title;
        headRow.appendChild(th);
      });
    rekapHead.appendChild(headRow);

    if (!students.length) {
      var row = document.createElement("tr");
      var cell = document.createElement("td");
      cell.colSpan = 3 + KBM.SUBJECTS.length + 2;
      cell.className = "muted";
      cell.textContent = "Belum ada siswa di kelas ini.";
      row.appendChild(cell);
      rekapTableBody.appendChild(row);
      return;
    }

    students
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      })
      .forEach(function (student) {
        var values = KBM.SUBJECTS.map(function (subject) {
          return KBM.getEffectiveScore(data, student.id, subject, typeKey);
        });
        var filtered = values.filter(function (value) {
          return value !== null;
        });
        var total = filtered.length
          ? Math.round(
              filtered.reduce(function (a, b) {
                return a + b;
              }, 0) * 100
            ) / 100
          : null;
        var avg = filtered.length ? Math.round((total / filtered.length) * 100) / 100 : null;

        var row = document.createElement("tr");
        row.innerHTML =
          "<td>" +
          student.name +
          "</td><td>" +
          KBM.getDisplayNis(student) +
          "</td><td>" +
          (student.nisn || "-") +
          "</td>";

        values.forEach(function (value) {
          var cell = document.createElement("td");
          cell.textContent = value !== null ? value : "-";
          row.appendChild(cell);
        });

        var totalCell = document.createElement("td");
        totalCell.textContent = total !== null ? total : "-";
        row.appendChild(totalCell);

        var avgCell = document.createElement("td");
        avgCell.textContent = avg !== null ? avg : "-";
        row.appendChild(avgCell);

        rekapTableBody.appendChild(row);
      });
  }

  function renderPerformance() {
    var data = KBM.loadData();
    var students = getStudentsByClass(data);
    var typeKey = performanceAssessmentSelect.value;
    performanceList.innerHTML = "";

    if (!typeKey) return;

    var ranked = students
      .map(function (student) {
        return {
          student: student,
          avg: calculateAverage(data, student, typeKey)
        };
      })
      .filter(function (item) {
        return item.avg !== null;
      })
      .sort(function (a, b) {
        return b.avg - a.avg;
      })
      .slice(0, 3);

    if (!ranked.length) {
      var empty = document.createElement("div");
      empty.className = "notice";
      empty.textContent = "Belum ada nilai untuk penilaian ini.";
      performanceList.appendChild(empty);
      return;
    }

    ranked.forEach(function (item, index) {
      var li = document.createElement("li");
      li.className = "performance-item";
      li.innerHTML =
        "<div><div class=\"performance-rank\">#" +
        (index + 1) +
        "</div><div>" +
        item.student.name +
        "</div><div class=\"muted\">" +
        KBM.getDisplayNis(item.student) +
        "</div></div>" +
        "<div><strong>" +
        item.avg +
        "</strong></div>";
      performanceList.appendChild(li);
    });
  }

  function buildPdfTrendLabel(trend) {
    if (trend === "up") return "↑ Naik";
    if (trend === "down") return "↓ Turun";
    if (trend === "same") return "→ Stabil";
    return "-";
  }

  function generateStudentPdf() {
    var data = KBM.loadData();
    var students = getStudentsByClass(data);
    var student = students.find(function (item) {
      return item.id === studentSelect.value;
    });
    if (!student) return;

    var typeKey = assessmentSelect.value;
    if (!typeKey) return;
    var typeMeta = KBM.getTypeMeta(typeKey);
    var previousType = KBM.getPreviousType(typeKey);
    var wali = KBM.getWaliByClass(data, className);
    var attendance = KBM.getAttendance(data, student.id);

    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "b5" });
    var centerX = 88;
    var y = 14;
    var leftMargin = 14;
    var rightMargin = 162;

    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text("KEMAJUAN BELAJAR MURID", centerX, y, { align: "center" });
    y += 6;
    doc.text("UPTD SMP Negeri 5 Batu Ampar", centerX, y, { align: "center" });
    y += 6;
    doc.text("TAHUN AJARAN 2025/2026", centerX, y, { align: "center" });
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    function drawAligned(label, value) {
      var labelWidth = 38;
      var colonX = leftMargin + labelWidth;
      doc.text(label, leftMargin, y);
      doc.text(":", colonX, y);
      doc.text(String(value), colonX + 3, y);
      y += 6;
    }

    drawAligned("Nama", student.name);
    drawAligned("NIS", student.nis || "-");
    drawAligned("NISN", student.nisn || "-");
    drawAligned("Kelas", student.className);
    drawAligned("Jenis Penilaian", typeMeta ? typeMeta.label : typeKey);
    y += 2;

    var rows = KBM.SUBJECTS.map(function (subject) {
      var label = KBM.getSubjectLabel(subject, student.name);
      var current = KBM.getEffectiveScore(data, student.id, subject, typeKey);
      var previous = previousType
        ? KBM.getEffectiveScore(data, student.id, subject, previousType)
        : null;
      var trend = KBM.computeTrend(current, previous);
      return [label, current !== null ? current : "-", buildPdfTrendLabel(trend)];
    });

    doc.autoTable({
      startY: y,
      head: [["Mata Pelajaran", "Nilai", "Tren"]],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [31, 122, 92] },
      didParseCell: function (hookData) {
        if (hookData.section !== "body" || hookData.column.index !== 2) return;
        var text = hookData.cell.text.join(" ");
        if (text.indexOf("Naik") !== -1) hookData.cell.styles.textColor = [20, 106, 60];
        if (text.indexOf("Turun") !== -1) hookData.cell.styles.textColor = [157, 28, 18];
        if (text.indexOf("Stabil") !== -1) hookData.cell.styles.textColor = [122, 92, 15];
      }
    });

    y = doc.lastAutoTable.finalY + 6;
    doc.autoTable({
      startY: y,
      head: [["Kehadiran", "Jumlah"]],
      body: [
        ["Hadir", attendance.hadir || 0],
        ["Sakit", attendance.sakit || 0],
        ["Ijin", attendance.izin || 0],
        ["Alpa", attendance.alpa || 0]
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 92, 122] }
    });

    y = doc.lastAutoTable.finalY + 10;
    doc.text("Tanggal Cetak: " + KBM.formatDate(new Date()), rightMargin, y, { align: "right" });

    y += 10;
    var leftX = leftMargin;
    var rightX = 110;

    doc.text("Orang Tua/Wali", leftX, y);
    doc.text("Wali Kelas", rightX, y);

    y += 16;
    doc.text("-", leftX, y);
    doc.text(wali ? wali.name : "-", rightX, y);

    y += 6;
    doc.text(" ", leftX, y);
    doc.text("NIP: " + (wali ? wali.nip : "-"), rightX, y);

    var fileId = KBM.getDisplayNis(student) || student.id;
    doc.save("rapor_" + fileId + "_" + typeKey + ".pdf");
  }

  function generateClassPdf() {
    var data = KBM.loadData();
    var students = getStudentsByClass(data);
    if (!students.length) return;

    var typeKey = assessmentSelect.value;
    if (!typeKey) return;
    var typeMeta = KBM.getTypeMeta(typeKey);
    var previousType = KBM.getPreviousType(typeKey);
    var wali = KBM.getWaliByClass(data, className);

    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "b5" });
    var centerX = 88;
    var y = 14;

    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text("KEMAJUAN BELAJAR MURID", centerX, y, { align: "center" });
    y += 6;
    doc.text("UPTD SMP Negeri 5 Batu Ampar", centerX, y, { align: "center" });
    y += 6;
    doc.text("TAHUN AJARAN 2025/2026", centerX, y, { align: "center" });
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    var leftMargin = 14;
    var rightMargin = 162;

    function drawAligned(label, value) {
      var labelWidth = 38;
      var colonX = leftMargin + labelWidth;
      doc.text(label, leftMargin, y);
      doc.text(":", colonX, y);
      doc.text(String(value), colonX + 3, y);
      y += 6;
    }

    drawAligned("Rapor Kelas", className);
    drawAligned("Jenis Penilaian", typeMeta ? typeMeta.label : typeKey);
    y += 2;

    var rows = KBM.SUBJECTS.map(function (subject) {
      var currentValues = students
        .map(function (student) {
          return KBM.getEffectiveScore(data, student.id, subject, typeKey);
        })
        .filter(function (value) {
          return value !== null;
        });

      var previousValues = previousType
        ? students
            .map(function (student) {
              return KBM.getEffectiveScore(data, student.id, subject, previousType);
            })
            .filter(function (value) {
              return value !== null;
            })
        : [];

      var currentAvg = currentValues.length
        ? Math.round(
            (currentValues.reduce(function (a, b) {
              return a + b;
            }, 0) /
              currentValues.length) *
              100
          ) / 100
        : null;

      var previousAvg = previousValues.length
        ? Math.round(
            (previousValues.reduce(function (a, b) {
              return a + b;
            }, 0) /
              previousValues.length) *
              100
          ) / 100
        : null;

      var trend = KBM.computeTrend(currentAvg, previousAvg);
      return [subject, currentAvg !== null ? currentAvg : "-", buildPdfTrendLabel(trend)];
    });

    doc.autoTable({
      startY: y,
      head: [["Mata Pelajaran", "Rata-rata", "Tren"]],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 92, 122] },
      didParseCell: function (hookData) {
        if (hookData.section !== "body" || hookData.column.index !== 2) return;
        var text = hookData.cell.text.join(" ");
        if (text.indexOf("Naik") !== -1) hookData.cell.styles.textColor = [20, 106, 60];
        if (text.indexOf("Turun") !== -1) hookData.cell.styles.textColor = [157, 28, 18];
        if (text.indexOf("Stabil") !== -1) hookData.cell.styles.textColor = [122, 92, 15];
      }
    });

    y = doc.lastAutoTable.finalY + 10;
    doc.text("Tanggal Cetak: " + KBM.formatDate(new Date()), rightMargin, y, { align: "right" });

    y += 10;
    var rightX = 110;
    doc.text("Wali Kelas", rightX, y);
    y += 16;
    doc.text(wali ? wali.name : "-", rightX, y);
    y += 6;
    doc.text("NIP: " + (wali ? wali.nip : "-"), rightX, y);

    doc.save("rapor_kelas_" + className + "_" + typeKey + ".pdf");
  }

  assessmentSelect.addEventListener("change", renderReportPreview);
  studentSelect.addEventListener("change", renderReportPreview);
  printStudentBtn.addEventListener("click", generateStudentPdf);
  printClassBtn.addEventListener("click", generateClassPdf);
  rekapAssessmentSelect.addEventListener("change", renderRecapTable);
  performanceAssessmentSelect.addEventListener("change", renderPerformance);

  fillAssessmentSelect();
  fillStudentSelect();
  renderAttendanceTable();
  renderReportPreview();
  renderRecapTable();
  renderPerformance();
})();
