# Panduan Tugas 04 — Dokumentasi OpenAPI, Koleksi Postman & Client Console CLI

- **Penanggung Jawab:** Trista Sheryl Lambei (`F5512530106`)
- **Branch Git:** `feat/docs-testing-cli`
- **File Eksklusif yang Dibuat:**
  1. `openapi.yaml`
  2. `postman/PBL2_Untad_Research_Expense_API.postman_collection.json`
  3. `client.js`
  *(Ditambah penyusunan Laporan Akhir Proyek PDF `FinalProject_Kelompok2_<NamaProyek>.pdf` setelah seluruh branch tergabung ke `main`.)*

> **Jangan ubah `server.js` atau file di `src/`.** `server.js` otomatis menyajikan `GET /openapi.yaml` begitu file `openapi.yaml` ada di root proyek!

---

## 1. Spesifikasi 1: `openapi.yaml` (Ketentuan C.7)

- Versi **OpenAPI 3.0.3**, wajib tampil **tanpa error** saat ditempel ke https://editor.swagger.io/ (simpan screenshot Swagger Editor untuk Laporan Bab 4).
- Wajib memuat:
  - `components.securitySchemes`:
    - `ApiKeyAuth` (`type: apiKey`, `in: header`, `name: x-api-key`)
    - `BearerAuth` (`type: http`, `scheme: bearer`, `bearerFormat: HMAC-SHA256`)
  - Seluruh endpoint REST `/v2` dan autentikasi:
    - `POST /v2/auth/login`, `POST /v2/auth/logout`
    - `GET/POST /v2/activities`, `GET/PUT/DELETE /v2/activities/{id}`
    - `GET/POST /v2/expenses`, `GET/PUT/DELETE /v2/expenses/{id}`
    - `GET /v2/expenses/summary`
  - Endpoint legasi `GET /v1/expenses` **wajib ditandai `deprecated: true`** dan mendokumentasikan header `Sunset`, `Deprecation`, serta `Link`.
  - Lengkap dengan parameter, request body schema, dan seluruh kemungkinan response (`200`, `201`, `400`, `401`, `403`, `404`, `409`).

---

## 2. Spesifikasi 2: Koleksi Postman (`postman/`) (Ketentuan C.8)

Simpan koleksi di `postman/PBL2_Untad_Research_Expense_API.postman_collection.json`.
Ketentuan minimum yang wajib terpenuhi:
- **Minimal 5 test case** (disarankan 7–8 test case) yang semuanya dilengkapi tab **Tests / Scripts** (`pm.test(...)`).
- **Sekurang-kurangnya 2 test case negatif**, misalnya:
  1. Request tanpa `x-api-key` → verifikasi status `401`.
  2. Login `mahasiswa` lalu mencoba `DELETE /v2/expenses/:id` atau `POST /v2/activities` → verifikasi status `403 Forbidden`.
  3. `POST /v2/expenses` tanpa `activityId` (breaking change v2) → verifikasi status `400 Bad Request`.
- **Token tersimpan otomatis** dari test case login menggunakan script:
  ```js
  const json = pm.response.json();
  pm.collectionVariables.set("adminToken", json.token);
  ```
- **Idempoten / lolos berulang kali lewat Collection Runner:** pastikan data yang dibuat di test case `POST` dihapus kembali di test case `DELETE` (menggunakan `createdExpenseId` dari collection variable) supaya setiap kali Collection Runner dijalankan ulang, seluruh test case tetap hijau 100%!

---

## 3. Spesifikasi 3: Pembaruan Client Console CLI (`client.js`) (Ketentuan C.9)

Perbarui konsep Client Console dari proyek Sub-CPMK 4 (`readline/promises` bawaan Node.js + `fetch` native, tanpa library tambahan) agar:
1. Membaca `API_KEY` dan `PORT` dari `./src/config`.
2. Selalu mengirim header `x-api-key` pada setiap request.
3. Menyediakan menu interaktif bernomor di terminal:
   - Login (`admin` / `mahasiswa`) dan menyimpan Bearer token di memori sesi CLI.
   - Melihat daftar kegiatan riset (`GET /v2/activities` + info cuaca).
   - Melihat daftar pengeluaran (`GET /v2/expenses` + kurs IDR).
   - Melihat ringkasan anggaran (`GET /v2/expenses/summary`).
   - Menambah pengeluaran baru (`POST /v2/expenses` dengan menyertakan Bearer token).
   - Mengecek endpoint legasi (`GET /v1/expenses`) dan menampilkan header `Sunset`.
   - Menjalankan contoh query GraphQL (`POST /graphql`).
   - Logout (`POST /v2/auth/logout`).
4. Menangani error (`401`, `403`, `400`, `404`, atau server belum aktif) dengan pesan ramah tanpa stack trace.

---

## 4. Pengujian Mandiri di Lokal

```bash
# Terminal 1: jalankan server
npm start

# Terminal 2: uji client console
npm run client
```
- Validasi `openapi.yaml`: buka `http://localhost:3000/openapi.yaml` lalu salin isinya ke https://editor.swagger.io/ dan pastikan 0 error.
- Uji koleksi Postman setelah seluruh branch backend (`feat/security-graphql-web`, `feat/rest-v2`, `feat/public-apis-v1`) tergabung ke `main`, lalu jalankan via **Postman Collection Runner** minimal 2 kali berturut-turut.

---

## 5. Langkah Git & Pull Request (Wajib Atas Nama Sendiri)

```bash
# 1. Clone repo (jika belum)
git clone https://github.com/zikriadamm/PROJEK-BASED-2-API-new.git
cd PROJEK-BASED-2-API-new
npm install
Copy-Item .env.example .env

# 2. Set identitas Git milik Trista
git config user.name "Trista Sheryl Lambei"
git config user.email "trista.lambei@untad.ac.id"   # Ganti dengan email akun GitHub-mu jika berbeda

# 3. Buat branch sendiri dari main
git checkout main
git pull origin main
git checkout -b feat/docs-testing-cli

# 4. Setelah selesai membuat openapi.yaml, postman/, dan client.js:
git status
git add openapi.yaml postman/ client.js
git commit -m "docs(testing-cli): tambah spesifikasi OpenAPI 3.0.3, koleksi Postman Runner, dan pembaruan client.js"
git push -u origin feat/docs-testing-cli
```
Buka https://github.com/zikriadamm/PROJEK-BASED-2-API-new → klik **Compare & pull request** → arahkan ke `main` → **Create pull request**.
