# Panduan Agen & Kontributor — Untad Field Research & Travel Expense API

## Aturan Teknis Proyek (Wajib Dipatuhi)
- **Runtime & HTTP:** Node.js v18+ di atas modul bawaan `node:http` (**tanpa framework**).
- **Dependensi:** Hanya boleh menggunakan package `graphql` di `package.json` (dilarang menambah framework/library pihak ketiga lain).
- **Pengujian:** Gunakan test runner bawaan Node.js (`npm test` → `node --test`) dan koleksi Postman Collection Runner.
- **Branching Flow:** Kerjakan setiap GitHub Issue pada branch fitur dari `develop` (`feat/issue-<nomor>-<slug>`), buka Pull Request ke `develop` dengan `Closes #<nomor>`, lalu gabungkan `develop` ke `main` untuk rilis akhir bertag `v2.0.0`.
- **Anti Merge Conflict:** Jangan ubah `server.js` atau modul inti (`src/config.js`, `src/httpHelpers.js`, `src/storage.js`, `src/validators.js`, `src/moduleLoader.js`) dari branch fitur; buat file eksklusif sesuai kontrak pada Issue masing-masing.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues on `zikriadamm/PROJEK-BASED-2-API-new` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) plus area labels (`backend`, `frontend`, `documentation`, `testing`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` and `docs/adr/` at the project root). See `docs/agents/domain.md`.
