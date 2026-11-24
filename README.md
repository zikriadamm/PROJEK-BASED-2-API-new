# Untad Field Research & Travel Expense API (Sub-CPMK 5)

Proyek Akhir Mata Kuliah **Rekayasa API (`F09252013`)** — Kelas **TIC**  
**Kelompok 2** — Program Studi S1 Teknik Informatika, Fakultas Teknik Universitas Tadulako  
Repositori GitHub: https://github.com/zikriadamm/PROJEK-BASED-2-API-new

---

## 1. Gambaran Proyek
Proyek ini mengembangkan prototipe **Evaluasi Sub-CPMK 4** (*Travel Expense Tracker & Currency Converter API*) menjadi layanan API berstandar industri berlatar **Universitas Tadulako & Sulawesi Tengah** untuk pengelolaan kegiatan riset lapangan dan biaya perjalanan dinas Fakultas Teknik Untad.

### Ketentuan Teknis yang Dipatuhi
- Dibangun dengan **Node.js** di atas modul bawaan `http` (**tanpa framework** seperti Express/Fastify).
- Dependensi tambahan **hanya `graphql`** (sesuai Ketentuan Teknis D.1).
- Penyimpanan persisten memakai **file JSON** (`data/activities.json`, `data/expenses.json`, `data/users.json`).
- Terintegrasi dengan **2 Public API resmi** tanpa API key (**ExchangeRate-API** & **Open-Meteo**) dengan *timeout* 4 detik dan *cache fallback*.
- Dilengkapi keamanan API Key (`x-api-key`), login bertoken HMAC-SHA256 berbatas waktu, password *hash* `scrypt`, RBAC (`admin` & `mahasiswa`), versioning `/v1` (*Sunset*) + `/v2`, GraphQL `POST /graphql`, OpenAPI 3.0.3, Postman Collection Runner, Client Console CLI, serta Web Dashboard.

---

## 2. Anggota Kelompok & Pembagian Branch (Anti Merge Conflict)

Setiap anggota mengerjakan **branch dan file eksklusif miliknya sendiri** sehingga tidak terjadi tabrakan file saat digabungkan (*Pull Request*) ke `main`.

| No | Nama & Stambuk | Branch Git | File Eksklusif yang Dibuat | Panduan Tugas |
| :-: | :--- | :--- | :--- | :--- |
| 1 | **Muhammad Zikri Adam**<br>`F5512530117` | `feat/security-graphql-web` | `src/security.js`, `src/authRouter.js`, `src/graphqlSchema.js`, `public/` | [01-zikri-security-graphql-web.md](docs/tasks/01-zikri-security-graphql-web.md) |
| 2 | **Lidiya**<br>`F5512530118` | `feat/rest-v2` | `src/v2Router.js` | [02-lidiya-rest-v2.md](docs/tasks/02-lidiya-rest-v2.md) |
| 3 | **Tabita Creaselia Belicia Theona**<br>`F5512520086` | `feat/public-apis-v1` | `src/publicApis.js`, `src/v1Router.js` | [03-tabita-public-apis-v1.md](docs/tasks/03-tabita-public-apis-v1.md) |
| 4 | **Trista Sheryl Lambei**<br>`F5512530106` | `feat/docs-testing-cli` | `openapi.yaml`, `postman/`, `client.js` | [04-trista-docs-testing-cli.md](docs/tasks/04-trista-docs-testing-cli.md) |

> **Aturan penting agar bebas *merge conflict*:**  
> Jangan mengubah `server.js`, `package.json`, atau file fondasi di `src/` (`config.js`, `httpHelpers.js`, `storage.js`, `validators.js`, `moduleLoader.js`) dari branch fitur. `server.js` sudah dilengkapi `src/moduleLoader.js` yang otomatis mendeteksi dan mengaktifkan file modul milikmu begitu kamu membuatnya!

---

## 3. Arsitektur Modular

```text
[ Klien: Postman / Client Console CLI (client.js) / Web Dashboard (public/) ]
                               |
                               v  (HTTP + 'x-api-key' & 'Authorization: Bearer')
                   [ server.js (HTTP Gateway) ]
                               |
                       [ moduleLoader.js ]
         +----------+----------+----------+----------+
         v          v          v          v          v
    security.js  v1Router   authRouter  v2Router  graphqlSchema
    (Zikri)      (Tabita)   (Zikri)     (Lidiya)  (Zikri)
                               |          |
                               v          v
         [ storage.js + validators.js ] [ publicApis.js (Tabita) ]
           - data/activities.json         - ExchangeRate-API
           - data/expenses.json           - Open-Meteo API
           - data/users.json
```

---

## 4. Cara Menjalankan Proyek di Laptop Masing-Masing

### Prasyarat
- Node.js **v18+** (disarankan v20 atau v22/v24 agar `fetch` & `AbortSignal.timeout` berjalan native).
- Git terinstal dan sudah login akun GitHub masing-masing.

### Langkah Instalasi
```bash
# 1. Clone repositori
git clone https://github.com/zikriadamm/PROJEK-BASED-2-API-new.git
cd PROJEK-BASED-2-API-new

# 2. Instal dependensi (hanya graphql)
npm install

# 3. Buat file .env dari template (JANGAN pernah commit .env ke GitHub)
cp .env.example .env
# Di Windows PowerShell: Copy-Item .env.example .env

# 4. Jalankan server
npm start
```

Saat server berjalan di `http://localhost:3000`, buka `http://localhost:3000/api` untuk melihat daftar endpoint dan status modul (`ACTIVE` vs `FALLBACK`).

### Akun Demo Bawaan (`data/users.json`)
| Username | Password | Role | Hak Akses |
| :--- | :--- | :--- | :--- |
| `admin` | `admin123` | `admin` | Akses penuh (CRUD kegiatan, CRUD pengeluaran, hapus data, seluruh mutation GraphQL) |
| `mahasiswa` | `mhs123` | `mahasiswa` | Melihat data & menambah pengeluaran; ditolak (`403 Forbidden`) saat membuat/mengubah/menghapus master kegiatan atau menghapus transaksi |

---

## 5. Alur Kerja Git & Pull Request Kelompok 2

1. Pastikan akun GitHub kamu sudah diundang sebagai **Collaborator** di repo ini.
2. Set identitas Git atas namamu sendiri (wajib agar commit tercatat atas namamu):
   ```bash
   git config user.name "Nama Lengkap Kamu"
   git config user.email "email-github-kamu@example.com"
   ```
3. Selalu mulai dari `main` terbaru, lalu buat branch sesuai tabel di atas:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/<nama-branch-kamu>
   ```
4. Kerjakan file eksklusif sesuai panduan di `docs/tasks/`, lalu uji di lokal dengan `npm start`.
5. Commit dan push branch-mu ke GitHub:
   ```bash
   git status
   git add <file-yang-kamu-buat>
   git commit -m "feat(...): ringkasan perubahan"
   git push -u origin feat/<nama-branch-kamu>
   ```
6. Buka GitHub → klik **Compare & pull request** → arahkan ke branch **`main`** → minta review lalu merge.
7. Setelah keempat branch tergabung ke `main` dan lolos seluruh pengujian Postman, buat tag rilis akhir:
   ```bash
   git checkout main
   git pull origin main
   git tag -a v2.0.0 -m "Rilis final Sub-CPMK 5 Kelompok 2 TIC"
   git push origin v2.0.0
   ```
