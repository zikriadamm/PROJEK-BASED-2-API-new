# ADR-0001: Arsitektur Modular HTTP Tanpa Framework dan Safe Module Loader

- **Status:** Accepted
- **Tanggal:** 2026-11-24
- **Penanggung Jawab:** Kelompok 2 TIC (Muhammad Zikri Adam, Lidiya, Tabita Creaselia Belicia Theona, Trista Sheryl Lambei)

## Konteks

Proyek Akhir Rekayasa API (Sub-CPMK 5) memiliki dua kendala utama yang harus diselesaikan bersamaan:
1. **Ketentuan Teknis ketat:** Server wajib dibangun menggunakan Node.js di atas modul `http` tanpa framework, dengan satu-satunya package eksternal yang diperbolehkan adalah `graphql`, serta penyimpanan persisten berbasis file JSON.
2. **Kolaborasi paralel 4 anggota:** Keempat anggota kelompok harus mengerjakan fitur pada branch masing-masing atas nama akun GitHub sendiri dan menggabungkannya via Pull Request tanpa saling menghambat (*blocking*) atau menimbulkan *merge conflict* berulang pada file pusat (`server.js`).

## Keputusan

1. **Gateway terpusat + `src/moduleLoader.js`:**
   - `server.js` dan modul bersama (`src/config.js`, `src/httpHelpers.js`, `src/storage.js`, `src/validators.js`, `src/moduleLoader.js`) disiapkan sebagai fondasi di `main` dan `develop`.
   - Enam modul fitur milik anggota (`security.js`, `authRouter.js`, `publicApis.js`, `v1Router.js`, `v2Router.js`, `graphqlSchema.js`) dimuat secara opsional oleh `src/moduleLoader.js`.
   - Jika suatu modul belum ada di branch tertentu, `moduleLoader.js` menyediakan *fallback* yang aman (misalnya kurs/cuaca *stub* untuk `publicApis` dan `501 Not Implemented` untuk router yang belum ada). Jika file modul **sudah ada**, error sintaks tetap dilempar secara eksplisit.
2. **Pemisahan `src/authRouter.js` dari `src/v2Router.js`:**
   - Rute `/v2/auth/*` ditangani oleh `src/authRouter.js` sebelum rute `/v2/*` (`src/v2Router.js`) sehingga pemilik fitur Security dan pemilik fitur REST v2 tidak pernah menyentuh file yang sama.
3. **Validasi tunggal di `src/validators.js`:**
   - REST `/v2` dan GraphQL `/graphql` memakai fungsi validasi yang sama (`validasiActivityV2`, `validasiExpenseV2`) guna memenuhi ketentuan keseragaman pemeriksaan data.
4. **Pengujian bawaan Node.js (`node --test`):**
   - Pengujian otomatis unit/integrasi menggunakan modul bawaan `node:test` dan `node:assert/strict` sehingga `package.json` tetap hanya memuat dependensi `graphql`.
5. **Alur Branch `feat/issue-N-*` → `develop` → `main`:**
   - Setiap GitHub Issue dikerjakan pada branch fitur dari `develop`, digabungkan via Pull Request (`Closes #N`) ke `develop`, lalu diintegrasikan ke `main` dan diberi tag rilis (`v2.0.0`).

## Konsekuensi

- **Positif:** Nol *file overlap* antar anggota, setiap anggota dapat langsung menguji branch-nya secara lokal, dan 100% patuh pada batasan package `graphql`-only.
- **Negatif:** Setiap anggota wajib mematuhi kontrak nama file dan nama fungsi *export* yang terdokumentasi di masing-masing GitHub Issue dan `docs/tasks/`.
