# Panduan Deploy KasirAkun UMKM ke Vercel (100% Lewat Browser, Tanpa Terminal)

Panduan ini dibuat khusus untuk Anda yang **murni mulai dari browser saja tanpa install terminal, Git, atau Node.js di komputer**.

> **Kabar baik**: Proses build di Vercel kini sudah **otomatis membuat seluruh tabel database & Better Auth di Neon** (`prisma db push` berjalan otomatis saat Anda klik **Deploy** di Vercel). Anda **tidak perlu** mengetik satu perintah terminal pun.

---

## Ringkasan 14 Environment Variables yang Akan Dimasukkan ke Vercel

| No | Bagian | Nama Variable | Dari Mana Mengambilnya |
|---:|---|---|---|
| 1 | **Neon Database** | `DATABASE_URL` | Neon Console → Connect → Pooled aktif |
| 2 | **Neon Database** | `DIRECT_URL` | Neon Console → Connect → Pooled mati |
| 3 | **Better Auth (Neon)** | `BETTER_AUTH_SECRET` | Buka `generate-secret.vercel.app/32` lalu copy |
| 4 | **Better Auth (Neon)** | `BETTER_AUTH_URL` | URL Vercel Anda (misal `https://kasirakun-umkm.vercel.app`) |
| 5 | **Master Admin** | `MASTER_ADMIN_EMAIL` | Email login Master Admin Anda |
| 6 | **Master Admin** | `MASTER_ADMIN_PASSWORD` | Password kuat Master Admin Anda |
| 7 | **Neon Object Storage** | `AWS_ENDPOINT_URL_S3` | Neon Console → Object Storage |
| 8 | **Neon Object Storage** | `AWS_REGION` | Region proyek Neon Anda (misal `ap-southeast-1`) |
| 9 | **Neon Object Storage** | `AWS_ACCESS_KEY_ID` | Neon Console → Object Storage (`nak_live_...`) |
| 10 | **Neon Object Storage** | `AWS_SECRET_ACCESS_KEY` | Neon Console → Object Storage (`nsk_live_...`) |
| 11 | **Neon Object Storage** | `S3_BUCKET` | Nama bucket Neon Anda (misal `kasirakun-assets`) |
| 12 | **Midtrans Master** | `MIDTRANS_SERVER_KEY` | Midtrans Dashboard → Settings → Access Keys |
| 13 | **Midtrans Master** | `MIDTRANS_CLIENT_KEY` | Midtrans Dashboard → Settings → Access Keys |
| 14 | **WhatsApp Fonnte** | `FONNTE_TOKEN` | Fonnte Dashboard (`md.fonnte.com`) → Device → Token |

---

## Tahap 1 — Kirim Kode Proyek ke GitHub (100% dari Browser)

1. Buka [github.com](https://github.com) lalu login (atau buat akun gratis jika belum punya).
2. Di pojok kanan atas halaman editor aplikasi ini, klik tombol **Save to GitHub** / **Push to GitHub** (ikon GitHub).
3. Hubungkan akun GitHub Anda, isi nama repositori baru (contoh: `kasirakun-umkm`), pilih **Private** (disarankan agar aman), lalu klik **Create & Push**.
4. Tunggu beberapa detik sampai muncul notifikasi berhasil. Sekarang seluruh kode KasirAkun UMKM sudah ada di GitHub Anda tanpa perlu terminal.

*(Alternatif bila tombol GitHub tidak muncul: klik **Download ZIP**, ekstrak di komputer, buat repo baru di [github.com/new](https://github.com/new), lalu klik **"uploading an existing file"** dan tarik seluruh isi folder ke browser kecuali folder `node_modules` dan `.env`.)*

---

## Tahap 2 — Buat Database & Object Storage di Neon (Lewat Browser)

1. Buka [console.neon.tech](https://console.neon.tech) lalu login (bisa pakai akun GitHub/Google).
2. Klik **New Project**:
   - **Project Name**: `kasirakun-umkm`
   - **Region**: pilih **AWS Asia Pacific (Singapore) / `ap-southeast-1`** (paling cepat untuk Indonesia).
   - Klik **Create Project**.
3. **Ambil `DATABASE_URL` dan `DIRECT_URL`**:
   - Klik tombol **Connect** di dashboard proyek Neon Anda.
   - Pastikan centang **Connection pooling** **AKTIF** → klik **Copy** → catat di Notepad sebagai **`DATABASE_URL`** (pastikan ada `-pooler` dan `?sslmode=require`).
   - Matikan centang **Connection pooling** → klik **Copy** → catat di Notepad sebagai **`DIRECT_URL`** (tanpa `-pooler`).
4. **Aktifkan Neon Object Storage**:
   - Di sidebar kiri proyek Neon (branch `main`), klik menu **Object Storage** (atau **Storage**).
   - Klik **Create Bucket** → beri nama huruf kecil: `kasirakun-assets` → catat sebagai **`S3_BUCKET`**.
   - Buka tab **Credentials / Access Keys** → klik **Create Access Key**, lalu catat 4 nilai yang muncul:
     - **`AWS_ENDPOINT_URL_S3`** (contoh: `https://br-xxxx.storage.c-1.ap-southeast-1.aws.neon.tech`)
     - **`AWS_REGION`** (contoh: `ap-southeast-1`)
     - **`AWS_ACCESS_KEY_ID`** (diawali `nak_live_...`)
     - **`AWS_SECRET_ACCESS_KEY`** (diawali `nsk_live_...` — langsung salin karena hanya tampil sekali).

---

## Tahap 3 — Siapkan Better Auth Secret, Midtrans & Fonnte (Lewat Browser)

1. **Buat `BETTER_AUTH_SECRET` tanpa terminal**:
   - Buka tab baru lalu kunjungi: [https://generate-secret.vercel.app/32](https://generate-secret.vercel.app/32)
   - Salin teks acak yang muncul di layar → catat sebagai **`BETTER_AUTH_SECRET`**.
   - *(Cukup 1 kunci ini saja — aplikasi sudah otomatis menggunakannya untuk Better Auth di Neon, sesi login Vercel, enkripsi AES-256 kunci Midtrans, dan keamanan webhook.)*
2. **Ambil Kunci Midtrans** ([dashboard.midtrans.com](https://dashboard.midtrans.com)):
   - Login ke Dashboard Midtrans, lalu pilih mode di kiri atas: **Sandbox** (untuk uji coba dulu) atau **Production** (jika akun live sudah disetujui).
   - Buka **Settings → Access Keys**.
   - Salin **Server Key** → catat sebagai **`MIDTRANS_SERVER_KEY`**.
   - Salin **Client Key** → catat sebagai **`MIDTRANS_CLIENT_KEY`**.
3. **Ambil Token WhatsApp Fonnte** ([md.fonnte.com](https://md.fonnte.com)):
   - Login ke `md.fonnte.com` → buka menu **Device → Add Device**.
   - Masukkan nomor WhatsApp bisnis Anda → klik **Connect** → scan QR dari HP hingga status menjadi **Connected**.
   - Klik tombol **Token** pada baris perangkat tersebut → salin → catat sebagai **`FONNTE_TOKEN`**.

---

## Tahap 4 — Deploy & Masukkan 14 Environment Variables di Vercel

1. Buka [vercel.com](https://vercel.com) → login menggunakan akun **GitHub** yang sama dengan Tahap 1.
2. Klik **Add New... → Project**.
3. Cari repositori `kasirakun-umkm` lalu klik **Import**.
4. Bagian **Build & Output Settings** biarkan **default** (sudah diatur otomatis oleh file `vercel.json`).
5. Klik panah **Environment Variables** untuk membukanya, lalu masukkan **14 variabel** yang sudah Anda catat di Notepad (Key di kiri, Value di kanan, klik **Add** satu per satu):
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL` → untuk deploy pertama, isi perkiraan nama project Anda, misal `https://kasirakun-umkm.vercel.app` (tanpa `/` di akhir)
   - `MASTER_ADMIN_EMAIL` → misal email utama Anda
   - `MASTER_ADMIN_PASSWORD` → buat password kuat (min. 10 karakter kombinasi huruf besar, kecil, angka, simbol)
   - `AWS_ENDPOINT_URL_S3`
   - `AWS_REGION`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `S3_BUCKET` → `kasirakun-assets`
   - `MIDTRANS_SERVER_KEY`
   - `MIDTRANS_CLIENT_KEY`
   - `FONNTE_TOKEN`
6. Klik tombol **Deploy** dan tunggu sekitar 1–2 menit.
   - Saat proses build berjalan, Vercel akan **otomatis menjalankan sinkronisasi skema Prisma & membuat seluruh tabel Better Auth di Neon**. Anda bisa melihat pesan `[vercel-db-sync] Selesai — seluruh tabel aplikasi & Better Auth siap di Neon PostgreSQL` pada Build Logs.
7. **Cocokkan `BETTER_AUTH_URL` dengan URL final Vercel**:
   - Setelah layar **Congratulations!** muncul, salin URL domain resmi aplikasi Anda (misal `https://kasirakun-umkm-abc.vercel.app`).
   - Jika URL-nya berbeda dari yang Anda isi di langkah 5:
     1. Buka **Settings → Environment Variables** di proyek Vercel Anda.
     2. Edit `BETTER_AUTH_URL` menjadi URL resmi tersebut (tanpa `/` di belakang) → klik **Save**.
     3. Buka tab **Deployments** → klik ikon titik tiga `...` pada deployment teratas → klik **Redeploy**.

---

## Tahap 5 — Pasang Webhook Midtrans & Cek Aplikasi Online

1. **Pasang URL Webhook Midtrans**:
   - Buka [dashboard.midtrans.com](https://dashboard.midtrans.com) (pastikan mode Sandbox/Production sama dengan key yang dipakai).
   - Buka **Settings → Configuration**.
   - Pada kolom **Payment Notification URL**, tempel:
     `https://DOMAIN-VERCEL-ANDA/api/webhooks/payment/midtrans/master`
   - Klik **Update / Save**.
2. **Cek Koneksi Semua Layanan (1 Klik di Browser)**:
   - Buka tab baru dan akses: `https://DOMAIN-VERCEL-ANDA/api/health`
   - Pastikan hasil yang muncul menunjukkan:
     - `"status": "ok"`
     - `"database": "connected"`
     - `"betterAuthConfigured": true`
     - `"storageConfigured": true`
3. **Login ke Konsol Master Admin**:
   - Buka `https://DOMAIN-VERCEL-ANDA/login` → pilih tab **Master Admin**.
   - Login menggunakan `MASTER_ADMIN_EMAIL` dan `MASTER_ADMIN_PASSWORD` yang Anda buat di Vercel.
   - Buka menu **Migrasi DB, Storage & Sync** di sidebar kiri — pastikan kelima kotak indikator (**Neon PostgreSQL**, **Better Auth (Neon)**, **Neon Object Storage**, **Midtrans Master**, **WhatsApp Fonnte**) tampil **Terhubung / Aktif**.
4. *(Opsional nanti)* Jika sudah membeli domain sendiri (misal `kasirakun.id`), tambahkan di **Vercel → Settings → Domains**, lalu ubah `BETTER_AUTH_URL` dan Payment Notification URL Midtrans ke `https://kasirakun.id`, kemudian **Redeploy**.
