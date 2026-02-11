# Kemajuan Belajar Murid
UPTD SMP Negeri 5 Batu Ampar

## Cara Menjalankan
- Buka `login.html` di browser.
- Login admin/guru/wali menggunakan akun dari data guru.
- Login siswa menggunakan NISN dengan password `123456`.
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

## Sinkron Multi-Device (Supabase)
Agar data terbaca di perangkat lain, gunakan Supabase sebagai penyimpanan pusat.

1. Buat project di Supabase.
2. Buat tabel `kbm_data` dengan kolom:
   - `id` (text, primary key)
   - `data` (jsonb)
   - `updated_at` (timestamptz, default `now()`)

Contoh SQL:
```sql
create table if not exists kbm_data (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

Aktifkan policy agar client (anon key) bisa membaca/menulis:
```sql
alter table kbm_data enable row level security;
create policy "public read" on kbm_data for select using (true);
create policy "public insert" on kbm_data for insert with check (true);
create policy "public update" on kbm_data for update using (true) with check (true);
```

3. Isi `supabase-config.js`:
   - `KBM_SUPABASE_URL`
   - `KBM_SUPABASE_ANON_KEY`
   - `KBM_SUPABASE_ROW_ID` (default `default`)

Setelah diisi, data otomatis tersimpan ke Supabase. Perangkat lain cukup membuka ulang halaman agar mengambil data terbaru.

## Import Cepat (Tanpa Pilih File)
Gunakan `seed.html` untuk langsung mengisi localStorage dari data siswa yang sudah disiapkan.
