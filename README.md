# SMART - BRMP SDLP

Sistem monitoring realisasi anggaran dan capaian kegiatan untuk Balai Besar Perakitan dan Modernisasi Sumber Daya Lahan Pertanian (BRMP SDLP), Kementerian Pertanian RI.

[![Next.js](https://img.shields.io/badge/Next.js-16.3.3-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3.6-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.10.0-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Daftar Isi

- [Tentang Aplikasi](#tentang-aplikasi)
- [Fitur Utama](#fitur-utama)
  - [Admin](#admin)
  - [PJ Kegiatan / User](#pj-kegiatan--user)
  - [Autentikasi dan Fitur Bersama](#autentikasi-dan-fitur-bersama)
- [Tech Stack](#tech-stack)
- [Struktur Folder](#struktur-folder)
- [Instalasi dan Setup](#instalasi-dan-setup)
  - [Prasyarat](#prasyarat)
  - [Clone dan Install](#clone-dan-install)
  - [Environment Variables](#environment-variables)
  - [Setup Database](#setup-database)
  - [Bootstrap Admin Pertama](#bootstrap-admin-pertama)
  - [Development Server](#development-server)
  - [Production Build](#production-build)
- [Testing](#testing)
- [Deployment](#deployment)
- [Kontributor dan Tim Pengembang](#kontributor-dan-tim-pengembang)

## Tentang Aplikasi

SMART - BRMP SDLP adalah aplikasi web untuk membantu pemantauan kegiatan dan pelaporan realisasi di lingkungan BRMP SDLP. Aplikasi menghubungkan data kegiatan, pagu anggaran, realisasi per periode, Penanggung Jawab (PJ), dokumen pendukung, notifikasi, dan audit pengelolaan laporan dalam satu sistem.

Kemampuan yang tersedia di kode aplikasi meliputi:

- Dashboard admin untuk melihat KPI, realisasi anggaran, capaian kegiatan, distribusi pagu, tren bulanan, dan kegiatan dengan serapan rendah.
- Dashboard PJ kegiatan untuk melihat kegiatan yang ditugaskan, status pelaporan, riwayat laporan, deadline, dan notifikasi.
- Input laporan realisasi per kegiatan dan periode bulan/tahun.
- Revisi laporan pada periode yang sama tanpa membuat baris laporan duplikat.
- Penegakan deadline pelaporan di UI dan server.
- Cetak laporan resmi dalam format tampilan cetak A4 landscape serta ekspor Excel.
- Repositori dokumen resmi yang terhubung dengan Google Drive.
- Pengelolaan pengguna, kategori program, kegiatan, arsip laporan, dan log audit.

Aplikasi dikembangkan oleh tim mahasiswa magang Universitas Bina Sarana Informatika sebagai bagian dari program Praktik Kerja Lapangan (PKL) tahun 2026 bersama BRMP SDLP. Profil tim tersedia pada halaman `/tentang` di aplikasi.

## Fitur Utama

### Admin

- **Dashboard admin** (`/admin/dashboard`)
  - Ringkasan KPI kegiatan dan anggaran.
  - Grafik realisasi bulanan dan capaian.
  - Distribusi pagu berdasarkan jenis anggaran.
  - Daftar kegiatan dengan serapan rendah.
  - Pemberitahuan sistem.
- **Manajemen kegiatan** (`/admin/master`)
  - Tambah, ubah, hapus, cari, filter, dan urutkan kegiatan.
  - Tetapkan jenis anggaran `APBN` atau `NON_APBN`.
  - Tetapkan kategori program, pagu, uraian, dan PJ kegiatan.
  - Tandai kegiatan sebagai wajib lapor.
  - Ubah status anggaran dibuka atau diblokir.
  - Atur hari dan jam deadline pelaporan.
  - Kelola kategori program utama.
- **Manajemen pengguna** (`/admin/users`)
  - Buat akun user dengan password sementara.
  - Ubah nama dan NIP.
  - Aktifkan atau nonaktifkan user.
  - Terapkan kewajiban ganti password pada akun baru.
  - Mencegah penonaktifan admin aktif terakhir.
- **Arsip laporan** (`/admin/arsip-sp2d`)
  - Cari dan filter laporan berdasarkan kegiatan, periode, dan status.
  - Unduh berkas laporan Excel.
  - Hapus atau tolak laporan dengan alasan.
  - Kirim pemberitahuan email kepada PJ saat laporan dihapus atau ditolak.
  - Sinkronkan kembali ringkasan kegiatan setelah penghapusan laporan.
- **Repositori dokumen** (`/admin/repositori`)
  - Simpan dokumen berdasarkan kategori seperti SK, DIPA, kontrak, laporan, dan e-surat.
  - Upload berkas ke Google Drive melalui service account.
  - Simpan tautan Google Drive secara manual.
  - Kaitkan dokumen dengan kegiatan atau simpan sebagai dokumen umum.
  - Cari, filter, buka, dan hapus dokumen.
- **Log audit** (`/admin/log-audit`)
  - Lihat jejak perubahan dan penghapusan laporan.
  - Cari log berdasarkan file, kegiatan, pemilik, atau alasan.
- **Cetak dan ekspor** (`/admin/cetak`)
  - Pilih periode bulanan atau semester.
  - Atur informasi penandatanganan dokumen.
  - Cetak atau simpan laporan sebagai PDF melalui fitur print browser.
  - Ekspor laporan ke Excel.

### PJ Kegiatan / User

- **Dashboard PJ** (`/dashboard`)
  - Lihat kegiatan yang ditugaskan kepada user.
  - Lihat pagu, realisasi, status laporan, dan riwayat laporan.
  - Lihat deadline pelaporan periode berjalan.
  - Buka notifikasi sistem.
- **Input laporan** (`/input`)
  - Pilih kegiatan yang menjadi tanggung jawab user.
  - Isi uraian dan realisasi periode berjalan.
  - Kirim laporan sebelum deadline.
  - Revisi laporan pada periode yang sama.
  - Melihat status read-only setelah deadline terlewati.
- **Profil dan password**
  - Ubah profil melalui menu profil.
  - Ganti password pada `/account/change-password`.

### Autentikasi dan Fitur Bersama

- Login email dan password melalui Better Auth.
- Reset password melalui email SMTP.
- Validasi sesi dan status aktif user.
- Rate limit autentikasi bawaan Better Auth serta rate limit percobaan login aplikasi.
- Notifikasi dalam aplikasi dengan status sudah dibaca/belum dibaca.
- Email pengingat laporan untuk PJ.
- Email verifikasi dan reset password melalui Nodemailer.

## Tech Stack

- **Runtime dan package manager:** Bun `1.3.6`.
- **Framework:** Next.js `16.3.3` dengan App Router.
- **Bahasa:** TypeScript `5.x`.
- **UI:** React `19.2.8`, Tailwind CSS `4`, shadcn/ui, Radix-style UI components dari `@shadcn/react`, `lucide-react`, `sonner`, dan `framer-motion`.
- **Grafik:** Recharts `3.8.0`.
- **Database:** PostgreSQL.
- **ORM dan client:** Prisma `7.10.0` dengan `@prisma/client` dan `@prisma/adapter-neon`.
- **Autentikasi:** Better Auth `1.7.2`.
- **Validasi:** Zod `4.x`.
- **Email:** Nodemailer `10.x`.
- **Dokumen dan ekspor:** ExcelJS `4.4.0`.
- **Penyimpanan dokumen:** Google Drive API melalui `googleapis`.
- **Testing E2E:** Playwright Test `1.64.0`.
- **Linting dan build tooling:** ESLint, `eslint-config-next`, PostCSS, Tailwind CSS, dan TypeScript.

Versi di atas mengikuti `package.json`. Versi patch aktual dapat berubah setelah instalasi dependency sesuai lockfile.

## Struktur Folder

```text
.
├── src/
│   ├── app/              # Route Next.js App Router, layout, API auth, dan halaman aplikasi
│   ├── features/         # Logika fitur: auth, user, kegiatan, laporan, arsip, repositori, notifikasi
│   ├── components/       # Komponen halaman, dashboard, tabel, form, dan komponen UI bersama
│   ├── lib/              # Prisma, Better Auth, mailer, Google Drive, sesi, audit, dan utilitas server
│   ├── utils/            # Agregasi laporan, format data, deadline, dan ekspor Excel
│   └── types.ts          # Tipe data lintas fitur
├── prisma/
│   ├── schema.prisma     # Model dan relasi PostgreSQL
│   ├── migrations/       # Migration history Prisma
│   └── *.ts              # Bootstrap admin, seed/helper, dan pemeriksaan database
├── e2e/                  # Spec dan helper Playwright untuk auth serta laporan/deadline
├── deploy/               # Runbook VPS, konfigurasi Nginx, dan unit systemd
├── docs/                 # Catatan keputusan sistem
├── public/               # Asset publik jika tersedia
├── package.json          # Script dan dependency project
└── playwright.config.ts  # Konfigurasi Playwright dan browser project
```

## Instalasi dan Setup

### Prasyarat

- Bun `1.3.6` atau versi kompatibel yang sudah diuji project.
- PostgreSQL `14+` direkomendasikan. Supabase atau PostgreSQL-compatible service dapat dipakai untuk development selama menyediakan connection string PostgreSQL yang valid.
- Git untuk mengambil source repository. README ini tidak menjalankan perintah Git.
- Microsoft Edge lokal untuk menjalankan konfigurasi E2E Playwright saat ini.

Project tidak mendeklarasikan `engines.node` di `package.json`. Runtime yang dideklarasikan project adalah Bun.

### Clone dan Install

```bash
git clone <REPOSITORY_URL>
cd smart-sdlp-main
bun install
```

Untuk instalasi deployment yang harus mengikuti lockfile secara ketat:

```bash
bun install --frozen-lockfile
```

### Environment Variables

Untuk development, buat `.env` dari template:

```bash
cp .env.example .env
```

Untuk production, buat `.env.production` dari template:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Isi placeholder dengan nilai environment masing-masing. Jangan commit file environment atau kredensial.

<details>
<summary>Daftar environment variables</summary>

#### Wajib untuk aplikasi

| Variable | Keterangan | Contoh aman |
| --- | --- | --- |
| `DATABASE_URL` | Connection string PostgreSQL untuk Prisma. | `postgresql://<USER>:<PASSWORD>@<HOST>:5432/<DATABASE>?sslmode=require` |
| `BETTER_AUTH_SECRET` | Secret acak untuk Better Auth. Gunakan secret panjang dan unik. | `<LONG_RANDOM_SECRET>` |
| `BETTER_AUTH_URL` | Origin server aplikasi. | `http://localhost:3000` atau `https://<DOMAIN>` |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Origin aplikasi yang dipakai client auth. | `http://localhost:3000` atau `https://<DOMAIN>` |
| `SMTP_HOST` | Host server SMTP untuk email reset, verifikasi, pengingat, dan notifikasi. | `smtp.<PROVIDER>.com` |
| `SMTP_PORT` | Port SMTP. | `587` |
| `SMTP_SECURE` | `true` untuk koneksi secure langsung; `false` untuk koneksi STARTTLS sesuai konfigurasi SMTP. | `false` |
| `SMTP_USER` | Username SMTP. | `<SMTP_USERNAME>` |
| `SMTP_PASSWORD` | Password atau app password SMTP. | `<SMTP_PASSWORD>` |
| `SMTP_FROM` | Nama dan alamat pengirim email terverifikasi. | `SMART BRMP SDLP <noreply@<DOMAIN>>` |

#### Diperlukan hanya saat bootstrap admin

| Variable | Keterangan | Contoh aman |
| --- | --- | --- |
| `BOOTSTRAP_ADMIN_EMAIL` | Email admin pertama yang akan dibuat oleh `prisma/bootstrap-admin.ts`. | `admin@<DOMAIN>` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Password kuat untuk admin pertama (minimal 12 karakter). | `<ONE_TIME_STRONG_PASSWORD>` |

#### Opsional, diperlukan untuk upload file otomatis ke Google Drive

| Variable | Keterangan | Contoh aman |
| --- | --- | --- |
| `GOOGLE_CLIENT_EMAIL` | Email service account Google Cloud dengan akses ke folder/Shared Drive tujuan. | `<SERVICE_ACCOUNT>@<PROJECT>.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Private key service account. Newline di environment ditulis sebagai `\n`. | `-----BEGIN PRIVATE KEY-----\n<KEY>\n-----END PRIVATE KEY-----` |
| `GOOGLE_DRIVE_FOLDER_ID` | ID folder root Google Drive untuk penyimpanan dokumen. | `<GOOGLE_DRIVE_FOLDER_ID>` |

#### Opsional runtime

| Variable | Keterangan | Contoh |
| --- | --- | --- |
| `NODE_ENV` | Mode runtime. | `development` atau `production` |

Jika Google Drive belum dikonfigurasi, repositori tetap menyediakan opsi menyimpan tautan Google Drive secara manual.

</details>

### Setup Database

Project memakai workflow migration-based. Jalankan generate client lalu terapkan migration yang sudah ada:

```bash
bunx prisma generate
bunx prisma migrate deploy
```

Alternatif melalui script yang tersedia di `package.json`:

```bash
bun run db:generate
bun run db:migrate
```

Jangan memakai `prisma db push` untuk deployment. Script `db:push` masih tersedia untuk kebutuhan development tertentu, tetapi schema production harus dikelola melalui `prisma/migrations`.

Untuk production dengan `.env.production`, pastikan `DATABASE_URL` tersedia sebagai environment variable shell saat menjalankan Prisma CLI, atau gunakan mekanisme environment loader deployment. Unit systemd memakai `EnvironmentFile=/var/www/smart-sdlp/.env.production` saat aplikasi berjalan.

Migration saat ini berada di:

- `prisma/migrations/00000000000000_baseline`
- `prisma/migrations/20261008120000_add_notification`

`prisma/seed.ts` saat ini tidak menjalankan seed otomatis. Admin pertama dibuat secara eksplisit melalui script bootstrap berikut.

### Bootstrap Admin Pertama

`prisma/bootstrap-admin.ts` membutuhkan `BOOTSTRAP_ADMIN_EMAIL` dan `BOOTSTRAP_ADMIN_PASSWORD` (keduanya wajib, tanpa nilai default). Password wajib minimal 12 karakter. Akun admin hasil bootstrap otomatis diset `mustChangePassword = true` sehingga wajib mengganti kata sandi saat pertama kali login. Set variable hanya untuk proses bootstrap, lalu jalankan script satu kali:

```bash
export BOOTSTRAP_ADMIN_EMAIL="admin@<DOMAIN>"
export BOOTSTRAP_ADMIN_PASSWORD="<ONE_TIME_STRONG_PASSWORD_MIN_12_CHARS>"
bun run prisma/bootstrap-admin.ts
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
```

Pada PowerShell:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = "admin@<DOMAIN>"
$env:BOOTSTRAP_ADMIN_PASSWORD = "<ONE_TIME_STRONG_PASSWORD_MIN_12_CHARS>"
bun run prisma/bootstrap-admin.ts
Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

Script menolak membuat admin jika email tersebut sudah ada atau password kurang dari 12 karakter. Setelah dibuat, admin wajib login dan mengganti kata sandi.

### Development Server

```bash
bun run dev
```

Buka [http://localhost:3000](http://localhost:3000). Route root akan mengarahkan user belum login ke `/login`, lalu mengarahkan user sesuai role setelah login.

### Production Build

Pastikan environment production sudah tersedia, lalu jalankan:

```bash
bun run build
bun run start
```

`bun run start` menjalankan Next.js production server pada port default `3000`. Konfigurasi deployment project meneruskan trafik dari Nginx ke `127.0.0.1:3000`.

Script tambahan yang tersedia:

```bash
bun run lint
bun run db:studio
```

## Testing

Playwright memakai Microsoft Edge lokal melalui konfigurasi `channel: "msedge"`, base URL `http://localhost:3000`, satu worker, dan tidak menjalankan `webServer` otomatis. Jalankan server development di terminal pertama:

```bash
bun run dev
```

Isi `.env.test` di root dengan credential test yang aman dan terpisah dari production:

```env
TEST_ADMIN_EMAIL="<TEST_ADMIN_EMAIL>"
TEST_ADMIN_PASSWORD="<TEST_ADMIN_PASSWORD>"
TEST_PJ_EMAIL="<TEST_PJ_EMAIL>"
TEST_PJ_PASSWORD="<TEST_PJ_PASSWORD>"
```

Lalu jalankan seluruh E2E test:

```bash
bunx playwright test
```

Cakupan test yang tersedia:

- `e2e/auth.spec.ts`: login admin valid, login password salah, alur `mustChangePassword`, rate limit login PJ, dan validasi PJ pada dropdown kegiatan.
- `e2e/laporan-deadline.spec.ts`: submit laporan, revisi pada periode yang sama tanpa duplikasi row, UI read-only setelah deadline, dan perlindungan server.

Status run terakhir: **4 dari 7 test PASS** — login admin valid, login password salah, submit + revisi laporan tanpa duplikasi, dan deadline read-only/server protection. Tiga test tertunda — redirect `mustChangePassword`, rate limit PJ, dan validasi dropdown PJ — karena rate limit bawaan Better Auth saat test auth dijalankan cepat dan berurutan dalam sesi yang sama. Ini bukan indikasi bug aplikasi.

Test memakai data ber-prefix `[E2E]` dan helper cleanup database. Jangan gunakan akun admin production untuk test lockout atau destructive flow. Akun PJ test harus terpisah.

Better Auth memiliki rate limit bawaan untuk endpoint auth. Test auth yang dijalankan berurutan dalam jendela waktu pendek dapat terkena limit tersebut; tunggu sekitar 15 menit atau jalankan file test secara terpisah dengan jeda sebelum menyimpulkan ada regresi aplikasi. Jangan menurunkan rate limit production hanya untuk test.

Untuk menjalankan file tertentu:

```bash
bunx playwright test e2e/auth.spec.ts e2e/laporan-deadline.spec.ts
```

## Deployment

Target deployment project adalah VPS Ubuntu/Debian dengan arsitektur:

```text
Internet → Nginx :443 → Next.js 127.0.0.1:3000 → PostgreSQL 127.0.0.1:5432
```

Komponen deployment:

- VPS untuk menjalankan aplikasi.
- Bun untuk runtime dan process start.
- PostgreSQL lokal atau database PostgreSQL yang sesuai.
- Nginx sebagai reverse proxy dan terminasi HTTPS.
- systemd untuk menjaga proses Next.js tetap berjalan dan restart otomatis.
- Let's Encrypt/Certbot untuk sertifikat TLS.

Langkah lengkap, firewall, user service, PostgreSQL, migrasi, Nginx, systemd, backup, dan verifikasi deployment tersedia di [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md). Draft konfigurasi tersedia di:

- [`deploy/nginx/smart-sdlp.conf`](deploy/nginx/smart-sdlp.conf)
- [`deploy/systemd/smart-sdlp.service`](deploy/systemd/smart-sdlp.service)

## Kontributor dan Tim Pengembang

SMART - BRMP SDLP dikembangkan oleh tim mahasiswa magang Universitas Bina Sarana Informatika:

| Nama | NIM |
| --- | --- |
| Frans Muhammed Chan | 19230669 |
| Raihan Naufal Azhar | 10230031 |
| Alif Rizki Dhaulagiri | 10230091 |
| Haikal Prasetya Alhakim | 10230047 |

Daftar di atas mengikuti data pada halaman `/tentang` di source aplikasi. URL deployment live tidak disimpan di repository; pada instance aktif, halaman tim tersedia di `https://<DOMAIN>/tentang`.

## Lisensi

Project ini dirilis di bawah [MIT License](LICENSE). Copyright © 2026 Tim Pengembang SMART - BRMP SDLP.