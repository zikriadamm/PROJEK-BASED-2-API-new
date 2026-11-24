# Glossary — Untad Field Research & Travel Expense API

Daftar istilah domain kanonis untuk **Kelompok 2 TIC (Fakultas Teknik Universitas Tadulako)**. Gunakan istilah berikut secara konsisten pada endpoint, schema GraphQL, nama variabel, pesan error, pengujian, dan laporan.

| Istilah Kanonis | Definisi | Jangan Gunakan Sinonim |
| :--- | :--- | :--- |
| **Activity** (`activities`) | Kegiatan riset lapangan atau perjalanan dinas FT Untad yang memiliki lokasi geografis (`latitude`, `longitude`) dan plafon anggaran (`budgetLimitIDR`). | `trip`, `project`, `event` |
| **Expense** (`expenses`) | Catatan pengeluaran biaya yang **wajib berelasi** ke satu `Activity` melalui `activityId` (breaking change `/v2`). | `transaction`, `spending`, `costItem` |
| **Cost Object** (`cost`) | Objek terstruktur pada response `/v2/expenses` berisi nominal asli (`originalAmount`, `originalCurrency`) dan hasil konversi Rupiah (`convertedIDR`, `exchangeRateIDR`, `formattedIDR`). | `priceInfo`, `money` |
| **Financial Summary** (`financialSummary`) | Ringkasan realisasi anggaran suatu `Activity` (`totalSpentIDR`, `budgetLimitIDR`, `remainingBudgetIDR`, `utilizationPercent`, `budgetStatus`). | `budgetReport` |
| **Budget Status** (`budgetStatus`) | Status kesehatan serapan anggaran: `AMAN` (< 80%), `WASPADA` (80%–100%), atau `MELEBIHI_BATAS` (> 100%). | `OK`, `WARNING`, `OVER` |
| **API Key** (`x-api-key`) | Kunci identifikasi aplikasi klien yang wajib hadir pada seluruh request `/v1`, `/v2`, dan `/graphql`. Ketiadaan/ketidakcocokan mengembalikan `401 Unauthorized`. | `clientKey`, `appSecret` |
| **Signed Token** (`Authorization: Bearer`) | Token bertanda tangan digital HMAC-SHA256 (`HS256`) dengan masa berlaku (`exp`, default 7200 detik) yang dihasilkan oleh `POST /v2/auth/login`. | `sessionCookie`, `apiToken` |
| **Role** (`admin`, `mahasiswa`) | Peran pengguna untuk RBAC. `admin` memiliki akses penuh; `mahasiswa` dapat melihat data dan menambah/mengubah pengeluaran, tetapi ditolak (`403 Forbidden`) saat mengubah/menghapus `Activity` atau menghapus `Expense`. | `user`, `member`, `superuser` |
| **Legacy v1** (`/v1/expenses`) | Endpoint kompatibilitas mundur bergaya Sub-CPMK 4 (format datar, hanya `GET`) yang wajib membawa header RFC 8594: `Sunset`, `Deprecation: true`, dan `Link`. | `oldApi`, `deprecatedRoute` |
| **Resilience Fallback** (`cache_fallback`) | Mekanisme degradasi anggun (*graceful fallback*) pada integrasi ExchangeRate-API & Open-Meteo ketika timeout (> 4 detik) atau gagal jaringan agar server tidak ikut gagal. | `mockError`, `hardCrash` |
