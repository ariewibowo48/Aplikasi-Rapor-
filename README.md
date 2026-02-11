# Kemajuan Belajar Murid
UPTD SMP Negeri 5 Batu Ampar

## Cara Menjalankan
- Buka `login.html` di browser.
- Buat akun sesuai peran (Admin, Guru, Wali Kelas).
- Data tersimpan di localStorage browser.

## Alur Peran
- **Admin**: kelola wali kelas dan data siswa, import Excel.
- **Guru**: atur jenis penilaian & bobot, input nilai per mapel.
- **Wali Kelas**: isi kehadiran, cetak rapor siswa & kelas.
- **Admin** juga memiliki halaman **Data Guru** dan **Progres**.

## Data Guru
- Data guru diambil dari `Data Guru.csv` dan dimuat otomatis di `teacher-data.js`.
- Username menggunakan NIP (jika ada), password default 6 digit terakhir NIP atau `guru123`.
- Guru hanya bisa menginput nilai sesuai mata pelajarannya.
- Wali kelas otomatis terkunci pada kelas yang terdaftar.

## Format Import Excel
Kolom wajib:
- `Nama`
- `NIS` (boleh kosong jika ada `NISN`)
- `NISN` (boleh kosong jika ada `NIS`)
- `Kelas`

Nilai mapel:
- Contoh: `Matematika PH 1`, `IPA PTS`, `Bahasa Indonesia PAS`.
- PAJ hanya untuk kelas 9.

Kehadiran:
- `Hadir`, `Sakit`, `Izin`, `Alpa`.

## Catatan
- Cetak PDF menggunakan jsPDF + AutoTable CDN.
- Import Excel menggunakan SheetJS CDN.

## Import Cepat (Tanpa Pilih File)
Gunakan `seed.html` untuk langsung mengisi localStorage dari data siswa yang sudah disiapkan.
