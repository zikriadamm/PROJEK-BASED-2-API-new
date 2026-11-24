# Panduan Tugas 03 — Integrasi 2 Public API & Versioning `/v1` (`Sunset`)

- **Penanggung Jawab:** Tabita Creaselia Belicia Theona (`F5512520086`)
- **Branch Git:** `feat/public-apis-v1`
- **File Eksklusif yang Dibuat:**
  1. `src/publicApis.js`
  2. `src/v1Router.js`

> **Jangan ubah `server.js` atau file milik anggota lain.** Begitu kamu membuat kedua file di atas, `src/moduleLoader.js` otomatis mengaktifkannya untuk seluruh sistem (REST v1, REST v2, dan GraphQL).

---

## 1. Kontrak Modul 1: `src/publicApis.js`

Sesuai Ketentuan C.3: minimal **2 public API berbeda**, dipanggil dari sisi server, datanya tampil di response API kelompok, dan **server tidak boleh ikut gagal ketika public API lambat atau tidak dapat dihubungi**.

Gunakan `fetch` bawaan Node.js dengan `{ signal: AbortSignal.timeout(4000) }` dan *in-memory cache fallback*. Wajib mengekspor 3 fungsi berikut:

### A. `async function getLiveRates()` (Public API 1: ExchangeRate-API)
- URL resmi tanpa API key: `https://open.er-api.com/v6/latest/USD`
- Jika sukses (`res.ok` dan `data.rates` ada): perbarui cache kurs lokal dan kembalikan:
  ```js
  {
    rates: cachedRates,
    sumber: 'live_public_api',
    status: 'ONLINE',
    terakhirDiperbarui: new Date().toISOString()
  }
  ```
- Jika timeout (> 4 detik) atau gagal jaringan: **jangan lempar error**, tangkap di `catch` lalu kembalikan data dari cache cadangan (`sumber: 'cache_fallback'`, `status: 'OFFLINE_CACHE'`).

### B. `function konversiKeIDR(amount, currency, rates)`
- Mengonversi `amount` dari mata uang `currency` (`IDR`, `USD`, `JPY`, `EUR`, `SGD`, `MYR`, `GBP`, `AUD`) ke Rupiah.
- Wajib mengembalikan objek:
  ```js
  {
    nominalIDR: 2100000,
    kursPerSatuanIDR: 150,
    formatRupiah: 'Rp 2.100.000',
    keterangan: '1 JPY ≈ Rp 150'
  }
  ```

### C. `async function getWeatherForecast(lat = -0.836, lon = 119.893)` (Public API 2: Open-Meteo)
- Default koordinat adalah **Kampus Untad Tondo, Kota Palu, Sulawesi Tengah** (`-0.836, 119.893`).
- URL resmi tanpa API key:
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
- Terjemahkan `weathercode` (standar WMO) menjadi kondisi cuaca berbahasa Indonesia (misal `0` = `Langit Cerah Bersih`, `1-2` = `Cerah Berawan`, `61-65` = `Hujan Sedang / Lebat`, dst.).
- Jika sukses kembalikan objek dengan: `temperature`, `temperatureFormatted`, `windSpeed`, `windSpeedFormatted`, `weatherCode`, `condition`, `latitude`, `longitude`, `sumber: 'live_open_meteo_api'`, `status: 'ONLINE'`, `waktuAmbil`.
- Jika gagal/timeout (> 4 detik): kembalikan cache cuaca per koordinat atau fallback Untad (`sumber: 'cache_fallback'`, `status: 'OFFLINE_CACHE'`).

---

## 2. Kontrak Modul 2: `src/v1Router.js`

Sesuai Ketentuan C.5: *"`/v1` dan `/v2` berjalan berdampingan. `/v1` minimal tetap melayani operasi `GET` dalam bentuk data lama (Sub-CPMK 4) dan membawa header `Sunset`."*

Impor helper bersama:
```js
const storage = require('./storage');
const { kirimJSON, kirimError } = require('./httpHelpers');
const { getPublicApis } = require('./moduleLoader');
```

Wajib mengekspor `async function handleV1Router(req, res, pathname, method, query)`:
- Sertakan header migrasi standar RFC 8594 pada seluruh response `/v1`:
  ```js
  const V1_HEADERS = {
    'Sunset': 'Thu, 31 Dec 2026 23:59:59 GMT',
    'Deprecation': 'true',
    'Link': '</v2/expenses>; rel="successor-version"'
  };
  ```
- **`GET /v1/expenses`** (dan opsional `GET /v1/expenses/:id`):
  - Ambil data dari `storage.getExpenses()` dan kurs dari `getPublicApis().getLiveRates()`.
  - Format tiap item ke **struktur datar (flat) ala Sub-CPMK 4** (sebelum *breaking change* `/v2`), yaitu field `id`, `title`, `category`, `amount`, `currency`, `amountIDR`, `date`, `notes` (tanpa objek bersarang `cost` dan tanpa relasi `activity` penuh).
  - Balas `200 OK` dengan `kirimJSON(res, 200, payload, V1_HEADERS)`.
- Metode selain `GET` pada `/v1/*` (mis. `POST`/`PUT`/`DELETE`):
  - Balas `410 Gone` atau `405 Method Not Allowed` dengan pesan ramah yang mengarahkan klien ke `/v2/expenses`, tetap menyertakan `V1_HEADERS`.

---

## 3. Pengujian Mandiri di Lokal

```bash
npm start
```
Pastikan di terminal tertulis:
- `src/publicApis.js : ACTIVE`
- `src/v1Router.js   : ACTIVE`

Tes cepat di PowerShell:
```powershell
# 1. Cek response & header Sunset pada GET /v1/expenses
$res = Invoke-WebRequest http://localhost:3000/v1/expenses -Headers @{ "x-api-key" = "untad-api-key-2026" }
$res.StatusCode
$res.Headers["Sunset"]
$res.Headers["Deprecation"]
$res.Headers["Link"]
$res.Content

# 2. Tes cepat fungsi publicApis langsung via node
node -e "const p = require('./src/publicApis'); (async () => { console.log(await p.getLiveRates()); console.log(await p.getWeatherForecast()); })();"
```

---

## 4. Langkah Git & Pull Request (Wajib Atas Nama Sendiri)

```bash
# 1. Clone repo (jika belum)
git clone https://github.com/zikriadamm/PROJEK-BASED-2-API-new.git
cd PROJEK-BASED-2-API-new
npm install
Copy-Item .env.example .env

# 2. Set identitas Git milik Tabita
git config user.name "Tabita Creaselia Belicia Theona"
git config user.email "tabita.theona@untad.ac.id"   # Ganti dengan email akun GitHub-mu jika berbeda

# 3. Buat branch sendiri dari main
git checkout main
git pull origin main
git checkout -b feat/public-apis-v1

# 4. Setelah selesai membuat & menguji src/publicApis.js dan src/v1Router.js:
git status
git add src/publicApis.js src/v1Router.js
git commit -m "feat(public-apis-v1): integrasi ExchangeRate-API, Open-Meteo fallback, dan REST v1 Sunset header"
git push -u origin feat/public-apis-v1
```
Buka https://github.com/zikriadamm/PROJEK-BASED-2-API-new → klik **Compare & pull request** → arahkan ke `main` → **Create pull request**.
