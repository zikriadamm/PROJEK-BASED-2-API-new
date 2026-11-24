# Untad Field Research & Travel Expense API (Sub-CPMK 5)

Proyek Akhir Mata Kuliah **Rekayasa API (`F09252013`)** — Kelas **TIC**  
**Kelompok 2** — Program Studi S1 Teknik Informatika, Fakultas Teknik Universitas Tadulako  
Repositori GitHub: https://github.com/zikriadamm/PROJEK-BASED-2-API-new

---

## 1. Gambaran Proyek
Proyek ini mengembangkan prototipe **Evaluasi Sub-CPMK 4** (*Travel Expense Tracker & Currency Converter API*) menjadi layanan API berstandar industri berlatar **Universitas Tadulako & Sulawesi Tengah** untuk pengelolaan kegiatan riset lapangan dan biaya perjalanan dinas Fakultas Teknik Untad.

### Ketentuan Teknis yang Dipatuhi
- Dibangun dengan **Node.js** di atas modul bawaan `node:http` (**tanpa framework** seperti Express/Fastify).
- Dependensi tambahan **hanya `graphql`** (sesuai Ketentuan Teknis D.1). Pengujian otomatis memakai `node --test` bawaan Node.js.
- Penyimpanan persisten memakai **file JSON** (`data/activities.json`, `data/expenses.json`, `data/users.json`).
- Terintegrasi dengan **2 Public API resmi** tanpa API key (**ExchangeRate-API** & **Open-Meteo**) dengan *timeout* 4 detik dan *cache fallback*.
- Dilengkapi keamanan API Key (`x-api-key`), login bertoken HMAC-SHA256 berbatas waktu, password *hash* `scrypt`, RBAC (`admin` & `mahasiswa`), versioning `/v1` (*Sunset*) + `/v2`, GraphQL `POST /graphql`, OpenAPI 3.0.3, Postman Collection Runner, Client Console CLI, serta Web Dashboard.

---

## 2. Anggota Kelompok, GitHub Issues & Pembagian Tugas

Seluruh pekerjaan dilacak melalui **GitHub Issues** di repositori ini. Setiap anggota mengerjakan **branch fitur sendiri dari `develop`** dan hanya membuat **file eksklusif miliknya** sehingga bebas *merge conflict*.

| No | Nama & Stambuk | Area Tugas & GitHub Issues | File Eksklusif | Panduan Lengkap |
| :-: | :--- | :--- | :--- | :--- |
| 1 | **Muhammad Zikri Adam**<br>`F5512530117` | Security & Auth (`#1`), GraphQL (`#5`), Web Dashboard (`#6`) | `src/security.js`, `src/authRouter.js`, `src/graphqlSchema.js`, `public/` | [01-zikri-security-graphql-web.md](docs/tasks/01-zikri-security-graphql-web.md) |
| 2 | **Lidiya**<br>`F5512530118` | REST API v2 Berelasi (`#4`) | `src/v2Router.js` | [02-lidiya-rest-v2.md](docs/tasks/02-lidiya-rest-v2.md) |
| 3 | **Tabita Creaselia Belicia Theona**<br>`F5512520086` | 2 Public API (`#2`), REST v1 Legacy & Sunset (`#3`) | `src/publicApis.js`, `src/v1Router.js` | [03-tabita-public-apis-v1.md](docs/tasks/03-tabita-public-apis-v1.md) |
| 4 | **Trista Sheryl Lambei**<br>`F5512530106` | OpenAPI & Client CLI (`#7`), Postman Runner (`#8`) | `openapi.yaml`, `postman/`, `client.js` | [04-trista-docs-testing-cli.md](docs/tasks/04-trista-docs-testing-cli.md) |

### Dokumen Arsitektur & Domain
- Istilah domain kanonis: [`GLOSSARY.md`](GLOSSARY.md)
- Catatan keputusan arsitektur: [`docs/adr/0001-arsitektur-modular-http-tanpa-framework.md`](docs/adr/0001-arsitektur-modular-http-tanpa-framework.md)
- Konfigurasi agen & issue tracker: [`AGENTS.md`](AGENTS.md) & [`docs/agents/`](docs/agents/)

> **Aturan anti merge conflict:**  
> Jangan mengubah `server.js`, `package.json`, atau modul inti (`src/config.js`, `src/httpHelpers.js`, `src/storage.js`, `src/validators.js`, `src/moduleLoader.js`) dari branch fitur. `src/moduleLoader.js` otomatis mengaktifkan file modul milikmu begitu kamu membuatnya.

---

## 3. Cara Menjalankan & Menguji di Lokal

```bash
# 1. Clone repositori
git clone https://github.com/zikriadamm/PROJEK-BASED-2-API-new.git
cd PROJEK-BASED-2-API-new

# 2. Instal dependensi (hanya graphql)
npm install

# 3. Buat file .env dari template (JANGAN commit .env)
Copy-Item .env.example .env   # Windows PowerShell (atau: cp .env.example .env)

# 4. Jalankan server
npm start

# 5. Jalankan test otomatis bawaan Node.js
npm test
```

Buka `http://localhost:3000/api` untuk melihat status modul (`ACTIVE` vs `FALLBACK`).

### Akun Demo Bawaan (`data/users.json`)
| Username | Password | Role | Hak Akses |
| :--- | :--- | :--- | :--- |
| `admin` | `admin123` | `admin` | Akses penuh seluruh endpoint & mutation GraphQL |
| `mahasiswa` | `mhs123` | `mahasiswa` | Melihat data & menambah/mengubah pengeluaran; `403 Forbidden` pada CRUD `activities` & `DELETE /v2/expenses/:id` |

---

## 4. Alur Kerja Git (`feat/issue-*` → `develop` → `main`)

1. Terima undangan **Collaborator** di GitHub, lalu set identitas Git atas namamu sendiri:
   ```bash
   git config user.name "Nama Lengkap Kamu"
   git config user.email "email-github-kamu@example.com"
   ```
2. Ambil branch `develop` terbaru dan buat branch sesuai nomor GitHub Issue yang di-assign ke kamu:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/issue-<nomor>-<nama-singkat>
   ```
3. Kerjakan seluruh checklist (*Acceptance criteria*) pada Issue, tambahkan test otomatis di `test/`, lalu verifikasi dengan `npm test` dan `npm start`.
4. Commit dan push branch-mu ke GitHub:
   ```bash
   git status
   git add <file-eksklusif-dan-test-kamu>
   git commit -m "feat(<area>): deskripsi singkat (#<nomor>)"
   git push -u origin feat/issue-<nomor>-<nama-singkat>
   ```
5. Buka **Pull Request ke branch `develop`** di GitHub dan cantumkan `Closes #<nomor>` pada deskripsi PR.
6. Setelah seluruh fitur terintegrasi dan lolos uji di `develop`, buka PR dari `develop` → `main`, lalu buat tag rilis akhir:
   ```bash
   git checkout main
   git pull origin main
   git tag -a v2.0.0 -m "Rilis final Sub-CPMK 5 Kelompok 2 TIC"
   git push origin v2.0.0
   ```
