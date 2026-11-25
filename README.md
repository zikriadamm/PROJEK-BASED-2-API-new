# Untad Field Research & Travel Expense API

API untuk mencatat kegiatan riset lapangan dan pengeluaran perjalanan dinas di lingkungan Fakultas Teknik Universitas Tadulako. Proyek ini dibuat oleh Kelompok 2 TIC sebagai Proyek Akhir Rekayasa API (Sub-CPMK 5).

Server dibangun memakai modul bawaan Node.js (`node:http`) tanpa framework web, dengan satu dependensi tambahan yaitu `graphql`. Data disimpan dalam file JSON di folder `data/`, sementara kurs mata uang dan cuaca diambil dari ExchangeRate-API dan Open-Meteo (otomatis beralih ke data fallback jika koneksi internet terputus atau timeout).

## Prasyarat

- Node.js versi 20 atau lebih baru (diuji pada Node.js v24)
- npm

## Instalasi dan Menjalankan Server

```bash
git clone https://github.com/zikriadamm/PROJEK-BASED-2-API-new.git
cd PROJEK-BASED-2-API-new
npm install
```

Salin template konfigurasi ke `.env`:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```bash
# macOS / Linux / Git Bash
cp .env.example .env
```

Jalankan server:

```bash
npm start
```

Server aktif di `http://localhost:3000`. Kamu bisa membuka:

- `http://localhost:3000/` untuk Web Dashboard
- `http://localhost:3000/api` untuk mengecek status server dan modul
- `http://localhost:3000/openapi.yaml` untuk mengambil file spesifikasi OpenAPI 3.0.3

## Konfigurasi `.env`

| Variabel | Nilai Default di `.env.example` | Keterangan |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port server HTTP |
| `API_KEY` | `ganti-dengan-api-key-anda` | Nilai yang wajib dikirim pada header `x-api-key` |
| `JWT_SECRET` | `ganti-dengan-rahasia-jwt-minimal-32-karakter` | Kunci rahasia untuk menandatangani token HMAC-SHA256 |
| `NODE_ENV` | `development` | Mode lingkungan aplikasi |

Jangan commit file `.env` ke repositori. Jika kamu mengganti `API_KEY` di `.env`, samakan juga nilainya pada header request, Web Dashboard, dan environment Postman.

## Akun Bawaan

Data akun tersimpan di `data/users.json` dengan password yang di-hash memakai `scrypt`.

| Username | Password | Role | Hak Akses |
| :--- | :--- | :--- | :--- |
| `admin` | `admin123` | `admin` | Akses penuh semua endpoint REST dan mutation GraphQL |
| `mahasiswa` | `mhs123` | `mahasiswa` | Melihat data, menambah dan mengubah pengeluaran; mendapat `403` saat mengubah kegiatan atau menghapus pengeluaran |

## Contoh Pemakaian Cepat

Semua endpoint di bawah `/v1`, `/v2`, dan `/graphql` memerlukan header `x-api-key`. Endpoint yang mengubah atau membaca data terproteksi juga memerlukan header `Authorization: Bearer <token>`.

### 1. Login untuk mendapatkan token

```bash
curl -X POST http://localhost:3000/v2/auth/login \
  -H "Content-Type: application/json" \
  -H "x-api-key: ganti-dengan-api-key-anda" \
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
```

Salin nilai `data.token` dari respons untuk langkah berikutnya.

### 2. Melihat daftar kegiatan riset

```bash
curl http://localhost:3000/v2/activities \
  -H "x-api-key: ganti-dengan-api-key-anda" \
  -H "Authorization: Bearer <TOKEN>"
```

Setiap kegiatan sudah dilengkapi ringkasan keuangan dan prakiraan cuaca dari Open-Meteo.

### 3. Menambahkan pengeluaran baru

Pada versi v2, setiap pengeluaran wajib terhubung ke kegiatan yang valid melalui `activityId`. Kategori yang diterima: `akomodasi`, `transportasi`, `konsumsi`, `belanja`, `hiburan`, `lainnya`.

```bash
curl -X POST http://localhost:3000/v2/expenses \
  -H "Content-Type: application/json" \
  -H "x-api-key: ganti-dengan-api-key-anda" \
  -H "Authorization: Bearer <TOKEN>" \
  -d "{\"activityId\":1,\"title\":\"Sewa kendaraan survei Palu-Donggala\",\"category\":\"transportasi\",\"amount\":450000,\"currency\":\"IDR\",\"date\":\"2026-05-10\"}"
```

Jika `currency` diisi mata uang asing (`USD`, `JPY`, `EUR`, `SGD`, `MYR`, `GBP`, atau `AUD`), server otomatis mengonversinya ke `IDR` memakai ExchangeRate-API.

### 4. Query melalui GraphQL

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "x-api-key: ganti-dengan-api-key-anda" \
  -H "Authorization: Bearer <TOKEN>" \
  -d "{\"query\":\"{ activities { id title location currentWeather { condition temperature } expenses { id title cost { formattedIDR } } } }\"}"
```

### 5. Mengecek endpoint legacy v1

```bash
curl -i http://localhost:3000/v1/expenses \
  -H "x-api-key: ganti-dengan-api-key-anda"
```

Endpoint `/v1` hanya menerima `GET` dan menyertakan header `Deprecation`, `Sunset`, serta `Link` menuju `/v2/expenses`. Metode selain `GET` mengembalikan status `410 Gone`.

## Daftar Endpoint

| Method | Path | Akses | Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Publik | Web Dashboard |
| `GET` | `/api` | Publik | Ringkasan server dan status modul |
| `GET` | `/openapi.yaml` | Publik | Spesifikasi OpenAPI 3.0.3 |
| `POST` | `/v2/auth/login` | API Key | Login dan menghasilkan token Bearer |
| `POST` | `/v2/auth/logout` | API Key + Token | Mencabut token aktif |
| `GET` | `/v2/auth/me` | API Key + Token | Menampilkan profil pengguna aktif |
| `GET` | `/v2/activities` | API Key + Token | Daftar kegiatan (mendukung filter `?status=ACTIVE`) |
| `GET` | `/v2/activities/:id` | API Key + Token | Detail kegiatan beserta pengeluaran terkait |
| `POST` | `/v2/activities` | `admin` | Membuat kegiatan baru |
| `PUT` | `/v2/activities/:id` | `admin` | Memperbarui data kegiatan |
| `DELETE` | `/v2/activities/:id` | `admin` | Menghapus kegiatan (`409` jika masih memiliki pengeluaran) |
| `GET` | `/v2/expenses` | API Key + Token | Daftar pengeluaran (mendukung `?activityId=`) |
| `GET` | `/v2/expenses/summary` | API Key + Token | Ringkasan anggaran, rekap kategori, dan cuaca Untad |
| `GET` | `/v2/expenses/:id` | API Key + Token | Detail satu pengeluaran |
| `POST` | `/v2/expenses` | `admin`, `mahasiswa` | Menambah pengeluaran (wajib `activityId`) |
| `PUT` | `/v2/expenses/:id` | `admin`, `mahasiswa` | Memperbarui pengeluaran |
| `DELETE` | `/v2/expenses/:id` | `admin` | Menghapus pengeluaran |
| `GET` | `/v1/expenses` | API Key | Daftar pengeluaran format lama (deprecated) |
| `GET` | `/v1/expenses/:id` | API Key | Detail pengeluaran format lama (deprecated) |
| `POST` | `/graphql` | API Key (+ Token untuk mutation) | Query berelasi dan mutation CRUD |

## Cara Lain Mencoba API

### Web Dashboard

Buka `http://localhost:3000/` di browser setelah menjalankan `npm start`. Masukkan nilai `x-api-key` yang sesuai dengan `.env`, lalu login memakai akun `admin` atau `mahasiswa`. Dashboard ini menyediakan manajemen kegiatan, pencatatan pengeluaran, konsol GraphQL, pengujian header `/v1`, serta panel keamanan RBAC.

### Client Console CLI

Jalankan di terminal terpisah saat server aktif:

```bash
npm run client
```

Menu interaktif di terminal memungkinkan kamu login, melihat kegiatan dan pengeluaran, membuat data baru, menjalankan query GraphQL, serta menguji header `Sunset` pada `/v1`.

### Postman Collection Runner

Impor kedua file berikut ke Postman:

- `postman/PBL2_Untad_Research_Expense_API.postman_collection.json`
- `postman/PBL2_Untad_Local.postman_environment.json`

Pilih environment **PBL2 Untad Local Environment**, sesuaikan variabel `apiKey` jika kamu mengubah `.env`, lalu jalankan **Run collection**. Koleksi ini berisi 15 skenario uji (positif dan negatif), menyimpan token secara otomatis, dan membersihkan data uji yang dibuatnya sehingga aman dijalankan berulang kali.

### Dokumentasi OpenAPI (Swagger)

Buka `openapi.yaml` di https://editor.swagger.io/ atau gunakan URL mentah dari repositori ini untuk melihat seluruh skema request, response, dan status error.

## Menjalankan Pengujian Otomatis

```bash
npm test
```

Perintah ini menjalankan seluruh suite pengujian bawaan `node --test` (40 test case mencakup autentikasi, RBAC, Public API fallback, REST v1, REST v2, GraphQL, Web Dashboard, OpenAPI, Postman, dan CLI).

## Struktur Proyek

```text
.
├── server.js          # Entry point HTTP server dan routing utama
├── client.js          # Client console CLI interaktif
├── openapi.yaml       # Spesifikasi OpenAPI 3.0.3
├── .env.example       # Template variabel lingkungan
├── src/               # Modul config, storage, validator, auth, public API, router v1/v2, GraphQL
├── data/              # Penyimpanan JSON (activities.json, expenses.json, users.json)
├── public/            # File statis Web Dashboard (HTML, CSS, JS)
├── postman/           # Koleksi dan environment Postman
└── test/              # Unit test dan integration test (node --test)
```

## Tim Pengembang

Kelompok 2 TIC, S1 Teknik Informatika, Fakultas Teknik Universitas Tadulako:

| Nama | NIM | Kontribusi |
| :--- | :--- | :--- |
| Muhammad Zikri Adam | F5512530117 | Autentikasi & RBAC, GraphQL, Web Dashboard |
| Lidiya | F5512530118 | REST API v2 berelasi |
| Tabita Creaselia Belicia Theona | F5512520086 | Integrasi Public API dan REST v1 legacy |
| Trista Sheryl Lambei | F5512530106 | Spesifikasi OpenAPI, Client CLI, Postman Collection Runner |
