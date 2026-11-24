# Panduan Tugas 02 — Backend REST API v2 (Resource Berelasi)

- **Penanggung Jawab:** Lidiya (`F5512530118`)
- **Branch Git:** `feat/rest-v2`
- **File Eksklusif yang Dibuat:**
  1. `src/v2Router.js`

> **Jangan ubah `server.js`, `src/authRouter.js`, atau file milik anggota lain.**  
> Rute `/v2/auth/*` sudah dipisahkan ke `src/authRouter.js`, sehingga kamu bisa fokus 100% di `src/v2Router.js` tanpa risiko *merge conflict*!

---

## 1. Cara Memakai Modul Bersama (Supaya Bisa Dites Meski Branch Teman Belum Merge)

Di bagian atas `src/v2Router.js`, impor helper bersama seperti ini:
```js
const storage = require('./storage');
const { kirimJSON, kirimError, bacaBody } = require('./httpHelpers');
const { validasiActivityV2, validasiExpenseV2 } = require('./validators');
const { getSecurity, getPublicApis } = require('./moduleLoader');
```
Dengan `getSecurity()` dan `getPublicApis()`:
- Sebelum branch Zikri/Tabita di-merge, server otomatis memberi *fallback* aman sehingga seluruh endpoint `/v2` buatanmu **tetap bisa dites langsung di laptopmu**.
- Begitu branch Zikri (`src/security.js`) dan Tabita (`src/publicApis.js`) di-merge ke `main`, `src/v2Router.js` otomatis memakai keamanan asli (`401`/`403`) dan data live ExchangeRate-API + Open-Meteo tanpa perlu ubah kode apa pun!

---

## 2. Kontrak Modul & Daftar Endpoint di `src/v2Router.js`

Wajib mengekspor `async function handleV2Router(req, res, pathname, method, query)`:

### Resource 1: Kegiatan Riset (`/v2/activities`)
1. **`GET /v2/activities`** (akses: semua request ber-API key; dukung filter opsional `?status=ACTIVE`)
   - Ambil `activities` & `expenses` dari `storage`, ambil kurs dari `getPublicApis().getLiveRates()`, dan cuaca tiap kegiatan dari `getPublicApis().getWeatherForecast(act.latitude, act.longitude)`.
   - Sertakan `financialSummary` (total pengeluaran dalam IDR, `budgetLimitIDR`, `remainingBudgetIDR`, `utilizationPercent`, `budgetStatus`: `AMAN` / `WASPADA` / `MELEBIHI_BATAS`) dan `currentWeather`.
   - Balas `200 OK`.
2. **`GET /v2/activities/:id`**
   - Kembalikan detail 1 kegiatan beserta array `expenses` miliknya, `financialSummary`, dan `currentWeather`.
   - Jika ID tidak ditemukan → `404 Not Found`.
3. **`POST /v2/activities`** (RBAC: **khusus `admin`**)
   - Cek otorisasi: `const auth = getSecurity().requireAuth(req, ['admin']); if (!auth.ok) return kirimError(res, auth.status, auth.error);`
   - Validasi body dengan `validasiActivityV2(body, false)` → jika ada pesan error, balas `400 Bad Request`.
   - Simpan ke `data/activities.json` memakai `storage.nextId(activities)` & `storage.saveActivities(activities)`.
   - Balas `201 Created`.
4. **`PUT /v2/activities/:id`** (RBAC: **khusus `admin`**)
   - Cek `requireAuth(req, ['admin'])`, cek eksistensi ID (`404` jika tidak ada), validasi dengan `validasiActivityV2(body, true)` (`400`), simpan perubahan, balas `200 OK`.
5. **`DELETE /v2/activities/:id`** (RBAC: **khusus `admin`**)
   - Cek `requireAuth(req, ['admin'])`, cek eksistensi ID (`404`).
   - Tolak dengan `409 Conflict` jika masih ada `expenses` yang merujuk ke `activityId` tersebut (menjaga integritas relasi). Jika kosong, hapus dan balas `200 OK`.

### Resource 2: Pengeluaran Riset (`/v2/expenses`) — *Breaking Change vs Sub-CPMK 4*
> **Breaking change `/v2`:** Field `activityId` wajib ada (relasi ke kegiatan), dan response membungkus informasi biaya dalam objek terstruktur `cost: { originalAmount, originalCurrency, convertedIDR, exchangeRateIDR, formattedIDR }`.

1. **`GET /v2/expenses`** (dukung filter opsional `?activityId=2&category=belanja`)
   - Perkaya tiap item dengan objek `cost` (via `getPublicApis().konversiKeIDR`) dan ringkasan `activity` terkait (`{ id, title, location }`).
   - Balas `200 OK` beserta metadata kurs (`exchangeRateSource`).
2. **`GET /v2/expenses/:id`**
   - Detail 1 pengeluaran + `cost` + `activity`. Jika tidak ada → `404 Not Found`.
3. **`POST /v2/expenses`** (RBAC: **`admin` dan `mahasiswa`**)
   - Cek `requireAuth(req, ['admin', 'mahasiswa'])`.
   - Validasi body dengan `validasiExpenseV2(body, false)` → `400` jika invalid.
   - Verifikasi `activityId` benar-benar ada di `storage.getActivities()` → `404` jika kegiatan tidak ditemukan.
   - Simpan data baru (`submittedBy` otomatis diisi dari `auth.user.fullName` + `auth.user.identifier`), balas `201 Created`.
4. **`PUT /v2/expenses/:id`** (RBAC: **`admin` dan `mahasiswa`**)
   - Cek `requireAuth(req, ['admin', 'mahasiswa'])`, cek ID (`404`), validasi `validasiExpenseV2(body, true)` (`400`), jika `activityId` diubah pastikan valid (`404`), simpan dan balas `200 OK`.
5. **`DELETE /v2/expenses/:id`** (RBAC: **khusus `admin`**)
   - Cek `requireAuth(req, ['admin'])` (role `mahasiswa` otomatis mendapat `403 Forbidden`).
   - Hapus data dari `data/expenses.json`, balas `200 OK` (atau `404` jika ID tidak ada).

### Endpoint Ringkasan (`/v2/expenses/summary`)
- **`GET /v2/expenses/summary`**
  - Hitung total pengeluaran seluruh kegiatan dalam IDR, rekap per kategori, rekap per kegiatan beserta status risiko anggaran, sumber data ExchangeRate-API, serta cuaca acuan Kampus Untad (`getPublicApis().getWeatherForecast()`).
  - Balas `200 OK`.

---

## 3. Pengujian Mandiri di Lokal

```bash
npm start
```
Pastikan di terminal tertulis `src/v2Router.js : ACTIVE`.

Tes cepat di PowerShell:
```powershell
# 1. Cek GET /v2/activities
Invoke-RestMethod http://localhost:3000/v2/activities -Headers @{ "x-api-key" = "untad-api-key-2026" }

# 2. Cek GET /v2/expenses/summary
Invoke-RestMethod http://localhost:3000/v2/expenses/summary -Headers @{ "x-api-key" = "untad-api-key-2026" }

# 3. Tes breaking change: POST /v2/expenses tanpa activityId -> harus 400
Invoke-WebRequest http://localhost:3000/v2/expenses -Method Post `
  -Headers @{ "x-api-key" = "untad-api-key-2026" } `
  -ContentType "application/json" `
  -Body '{"title":"Tes Tanpa Activity","category":"konsumsi","amount":50000,"currency":"IDR","date":"2026-11-10"}' `
  -SkipHttpErrorCheck
```

---

## 4. Langkah Git & Pull Request (Wajib Atas Nama Sendiri)

```bash
# 1. Clone repo (jika belum)
git clone https://github.com/zikriadamm/PROJEK-BASED-2-API-new.git
cd PROJEK-BASED-2-API-new
npm install
Copy-Item .env.example .env

# 2. Set identitas Git milik Lidiya
git config user.name "Lidiya"
git config user.email "lidiya@untad.ac.id"   # Ganti dengan email akun GitHub-mu jika berbeda

# 3. Buat branch sendiri dari develop
git checkout develop
git pull origin develop
git checkout -b feat/issue-4-rest-v2

# 4. Setelah selesai membuat & menguji src/v2Router.js + test/v2Router.test.js:
npm test
git status
git add src/v2Router.js test/
git commit -m "feat(rest-v2): implementasi CRUD activities, expenses berelasi, dan ringkasan anggaran v2 (#4)"
git push -u origin feat/issue-4-rest-v2
```
Buka https://github.com/zikriadamm/PROJEK-BASED-2-API-new → klik **Compare & pull request** → arahkan ke branch **`develop`** → tulis `Closes #4` di deskripsi PR → **Create pull request**.
