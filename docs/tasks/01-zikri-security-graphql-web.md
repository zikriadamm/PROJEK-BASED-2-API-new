# Panduan Tugas 01 — Security, Auth, GraphQL & Web Dashboard

- **Penanggung Jawab:** Muhammad Zikri Adam (`F5512530117`)
- **Branch Git:** `feat/security-graphql-web`
- **File Eksklusif yang Dibuat:**
  1. `src/security.js`
  2. `src/authRouter.js`
  3. `src/graphqlSchema.js`
  4. `public/index.html`, `public/style.css`, `public/app.js` (Web Dashboard untuk nilai sangat baik)

> **Jangan ubah `server.js` atau file milik anggota lain.** Begitu file di atas kamu buat, `src/moduleLoader.js` otomatis mengaktifkannya saat `npm start`.

---

## 1. Kontrak Modul yang Wajib Diekspor

### A. `src/security.js`
Gunakan modul bawaan `crypto` dan `./config`. Wajib mengekspor fungsi berikut:
- `hashPassword(password)` → mengembalikan string `salt:hash` (`crypto.scryptSync(password, salt, 64)` dengan 16-byte random hex salt).
- `verifyPassword(password, storedHash)` → membandingkan hash secara aman memakai `crypto.timingSafeEqual`, mengembalikan `boolean`.
- `generateToken(user, expiresInSeconds = 7200)` → membuat signed token `base64url(header).base64url(payload).base64url(hmacSha256)` dengan `iat` dan `exp` memakai `config.JWT_SECRET`.
- `verifyToken(token)` → memverifikasi tanda tangan dengan `crypto.timingSafeEqual`, memeriksa `exp`, dan memeriksa daftar token yang sudah logout (blacklist in-memory). Mengembalikan `{ valid: true, user }` atau `{ valid: false, error }`.
- `revokeToken(token)` *(opsional/direkomendasikan)* → menandai token agar tidak bisa dipakai lagi setelah logout.
- `verifyApiKey(req)` → memeriksa header `x-api-key` terhadap `config.API_KEY`. Mengembalikan `{ valid: true }` atau `{ valid: false, error }`.
- `extractBearerToken(req)` → mengekstrak token dari `Authorization: Bearer <token>`, mengembalikan string token atau `null`.
- `requireAuth(req, allowedRoles = [])` → mengembalikan `{ ok: true, user }` atau `{ ok: false, status: 401 | 403, error }`.

### B. `src/authRouter.js`
Wajib mengekspor `handleAuthRouter(req, res, pathname, method, query)`:
- `POST /v2/auth/login`
  - Body JSON: `{ "username": "...", "password": "..." }`.
  - Cari user di `storage.getUsers()`, cek password dengan `security.verifyPassword(...)`.
  - Jika salah/kosong → `401 Unauthorized` (`kirimError`).
  - Jika valid → `200 OK` dengan `{ sukses: true, pesan, token, expiresIn: 7200, user: { id, username, role, fullName, identifier, email } }` (tanpa `passwordHash`).
- `POST /v2/auth/logout`
  - Wajib Bearer token valid (`401` jika tidak ada/tidak valid), masukkan token ke blacklist, balas `200 OK`.
- Selain rute di atas → `404 Not Found`.

### C. `src/graphqlSchema.js`
Gunakan package resmi `graphql` (`graphql`, `buildSchema` atau `GraphQLSchema`), `./storage`, `./validators` (`validasiExpenseV2`), dan `./moduleLoader` (`getPublicApis`).
Wajib mengekspor `async function executeGraphQL(query, variables, contextValue)`:
- **Minimal 2 Query (salah satunya berargumen):**
  - `activities(status: String)` → daftar kegiatan riset beserta relasi `expenses` dan `currentWeather` (dari `getPublicApis().getWeatherForecast`).
  - `activity(id: Int!)` → detail 1 kegiatan beserta relasi `expenses` dan ringkasan biaya.
  - `expenses(activityId: Int, category: String)` → daftar pengeluaran beserta objek relasi `activity` dan `costIDR` (dari `getPublicApis().konversiKeIDR`).
- **Related data antar-resource:** `Activity.expenses` dan `Expense.activity` saling terhubung.
- **Minimal 1 Mutation dengan RBAC & validasi sama dengan REST:**
  - `createExpense(input: CreateExpenseInput!)` → wajib login (`admin` atau `mahasiswa`; tanpa token lempar Error berawalan `"401: ..."`). Validasi input menggunakan `validasiExpenseV2` dari `src/validators.js` (lempar `"400: ..."` jika invalid, `"404: ..."` jika `activityId` tidak ada).
  - `deleteExpense(id: Int!)` → wajib role `admin` (tanpa token `"401: ..."`, jika role `mahasiswa` lempar `"403: ..."`).
  > `server.js` otomatis mengubah prefix error `"401"`, `"403"`, `"400"`, `"404"` menjadi HTTP status code yang sesuai!

### D. Web Dashboard (`public/`)
- `public/index.html`, `public/style.css`, `public/app.js`:
  - Form login (`admin` / `mahasiswa`) yang menyimpan `x-api-key` dan Bearer token.
  - Menampilkan daftar kegiatan riset + cuaca Open-Meteo, pengeluaran + kurs IDR, perbandingan audit `/v1` (`Sunset`) vs `/v2`, serta panel eksekusi query/mutation `/graphql`.

---

## 2. Pengujian Mandiri di Lokal

```bash
npm start
```
Pastikan di terminal tertulis:
- `src/security.js       : ACTIVE`
- `src/authRouter.js     : ACTIVE`
- `src/graphqlSchema.js  : ACTIVE`

Tes cepat (PowerShell):
```powershell
# 1. Tanpa API Key -> harus 401
Invoke-WebRequest http://localhost:3000/v2/auth/login -Method Post -SkipHttpErrorCheck

# 2. Login admin -> harus 200 & dapat token
$login = Invoke-RestMethod http://localhost:3000/v2/auth/login -Method Post `
  -Headers @{ "x-api-key" = "untad-api-key-2026" } `
  -ContentType "application/json" `
  -Body '{"username":"admin","password":"admin123"}'
$token = $login.token

# 3. Query GraphQL dengan related data
Invoke-RestMethod http://localhost:3000/graphql -Method Post `
  -Headers @{ "x-api-key" = "untad-api-key-2026"; "Authorization" = "Bearer $token" } `
  -ContentType "application/json" `
  -Body '{"query":"{ activities { id title expenses { id title amount currency } } }"}'
```

---

## 3. Langkah Git & Pull Request

```bash
git checkout develop
git pull origin develop
git checkout -b feat/issue-1-security-auth   # lalu feat/issue-5-graphql & feat/issue-6-web-dashboard

# Setelah selesai & lolos npm test:
git status
git add src/security.js src/authRouter.js test/
git commit -m "feat(security): implementasi auth HMAC-SHA256, scrypt, dan RBAC (#1)"
git push -u origin feat/issue-1-security-auth
```
Lalu buka GitHub → **Compare & pull request** ke branch **`develop`** (tulis `Closes #1` di deskripsi PR) → Merge setelah dicek.
