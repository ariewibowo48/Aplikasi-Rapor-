(function () {
  "use strict";

  var session = KBM.getSession();
  if (!session || session.role !== "student") {
    window.location.href = "student-login.html";
    return;
  }

  if (KBM.autoSeed) KBM.autoSeed();

  var data = KBM.loadData();
  var student = data.students.find(function (item) {
    return item.id === session.studentId || item.nisn === session.nisn;
  });

  if (!student) {
    KBM.clearSession();
    window.location.href = "student-login.html";
    return;
  }

  var studentInfo = document.getElementById("studentInfo");
  var logoutBtn = document.getElementById("logoutBtn");
  var assessmentSelect = document.getElementById("studentAssessmentSelect");
  var noticeEl = document.getElementById("studentNotice");
  var printBtn = document.getElementById("studentPrintBtn");
  var previewBody = document.querySelector("#studentPreviewTable tbody");

  studentInfo.textContent = student.name + " • " + student.className + " • " + (student.nisn || "-");

  logoutBtn.addEventListener("click", function () {
    KBM.clearSession();
    window.location.href = "student-login.html";
  });

  function getActiveAssessmentTypes() {
    var active = KBM.getAllowedTypesForClass(KBM.getActiveTypes(data), student.className);
    return active;
  }

  function fillAssessmentSelect() {
    assessmentSelect.innerHTML = "";
    var activeTypes = getActiveAssessmentTypes();

    if (!activeTypes.length) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Belum ada penilaian aktif";
      assessmentSelect.appendChild(opt);
      assessmentSelect.disabled = true;
      printBtn.disabled = true;
      noticeEl.textContent = "Guru belum mengaktifkan penilaian.";
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
    printBtn.disabled = false;
    noticeEl.textContent = "Pilih penilaian untuk mengunduh rapor.";
  }

  function renderPreview() {
    previewBody.innerHTML = "";
    var typeKey = assessmentSelect.value;
    if (!typeKey) return;

    KBM.SUBJECTS.forEach(function (subject) {
      var label = KBM.getSubjectLabel(subject, student.name);
      var value = KBM.getEffectiveScore(data, student.id, subject, typeKey);
      var row = document.createElement("tr");
      row.innerHTML = "<td>" + label + "</td><td>" + (value !== null ? value : "-") + "</td>";
      previewBody.appendChild(row);
    });
  }

  function buildPdf(typeKey) {
    if (!typeKey) return;
    var typeMeta = KBM.getTypeMeta(typeKey);
    var previousType = KBM.getPreviousType(typeKey);
    var wali = KBM.getWaliByClass(data, student.className);
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
      return [label, current !== null ? current : "-", trend === "up" ? "↑ Naik" : trend === "down" ? "↓ Turun" : trend === "same" ? "→ Stabil" : "-"]; 
    });

    doc.autoTable({
      startY: y,
      head: [["Mata Pelajaran", "Nilai", "Tren"]],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [31, 122, 92] }
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

    var afterTableY = doc.lastAutoTable.finalY + 6;

    function finalizePdf(qrDataUrl) {
      var qrSize = 22;
      if (qrDataUrl) {
        doc.addImage(qrDataUrl, "PNG", rightMargin - qrSize, afterTableY, qrSize, qrSize);
      }

      y = Math.max(afterTableY + 6, qrDataUrl ? afterTableY + qrSize + 4 : afterTableY + 4);
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

      var fileId = student.nisn || student.nis || student.id;
      doc.save("rapor_" + fileId + "_" + typeKey + ".pdf");
    }

    var qrPayload =
      "NISN:" +
      (student.nisn || "-") +
      "|Nama:" +
      student.name +
      "|Kelas:" +
      student.className +
      "|Penilaian:" +
      (typeMeta ? typeMeta.label : typeKey) +
      "|Tanggal:" +
      KBM.formatDate(new Date());

    if (window.QRCode && window.QRCode.toDataURL) {
      window.QRCode.toDataURL(qrPayload, { margin: 1, width: 200 })
        .then(function (dataUrl) {
          finalizePdf(dataUrl);
        })
        .catch(function () {
          finalizePdf(null);
        });
    } else {
      finalizePdf(null);
    }
  }

  assessmentSelect.addEventListener("change", function () {
    renderPreview();
  });

  printBtn.addEventListener("click", function () {
    buildPdf(assessmentSelect.value);
  });

  fillAssessmentSelect();
  renderPreview();
})();
