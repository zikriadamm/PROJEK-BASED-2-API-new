const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config');
const security = require('../src/security');
const server = require('../server');
const storage = require('../src/storage');

describe('Issue #4 — Integration Test REST API v2 Berelasi (src/v2Router.js)', () => {
  let baseUrl = '';
  let adminToken = '';
  let mhsToken = '';

  before(async () => {
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    adminToken = security.generateToken({
      id: 1,
      username: 'admin',
      role: 'admin',
      fullName: 'Admin Keuangan FT Untad',
      identifier: 'ADMIN-FT-UNTAD'
    });

    mhsToken = security.generateToken({
      id: 2,
      username: 'mahasiswa',
      role: 'mahasiswa',
      fullName: 'Lidiya',
      identifier: 'F5512530118'
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api melaporkan src/v2Router.js bernilai ACTIVE', async () => {
    const res = await fetch(`${baseUrl}/api`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.statusModul['src/v2Router.js'], 'ACTIVE');
  });

  it('GET /v2/activities mengembalikan 200 dan data memuat financialSummary serta currentWeather', async () => {
    const res = await fetch(`${baseUrl}/v2/activities`, {
      headers: { 'x-api-key': config.API_KEY }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sukses, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);

    const first = body.data[0];
    assert.ok(first.financialSummary, 'Wajib memuat financialSummary');
    assert.ok(['AMAN', 'WASPADA', 'MELEBIHI_BATAS'].includes(first.financialSummary.budgetStatus));
    assert.ok(first.currentWeather, 'Wajib memuat currentWeather');
  });

  it('GET /v2/activities dengan filter ?status=ACTIVE', async () => {
    const res = await fetch(`${baseUrl}/v2/activities?status=ACTIVE`, {
      headers: { 'x-api-key': config.API_KEY }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.every((a) => a.status === 'ACTIVE'));
  });

  it('GET /v2/activities/:id mengembalikan detail kegiatan beserta relasi expenses', async () => {
    const res = await fetch(`${baseUrl}/v2/activities/3`, {
      headers: { 'x-api-key': config.API_KEY }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sukses, true);
    assert.equal(body.data.id, 3);
    assert.ok(Array.isArray(body.data.expenses));
    assert.ok(body.data.financialSummary);
    assert.ok(body.data.currentWeather);
  });

  it('POST /v2/activities menolak role mahasiswa dengan 403 Forbidden dan mengizinkan admin (201)', async () => {
    const payload = {
      title: 'Survei Geoteknik Bendungan Sigi',
      location: 'Kabupaten Sigi, Sulawesi Tengah',
      budgetLimitIDR: 8000000
    };

    // Tolak mahasiswa
    const mhsRes = await fetch(`${baseUrl}/v2/activities`, {
      method: 'POST',
      headers: {
        'x-api-key': config.API_KEY,
        Authorization: `Bearer ${mhsToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    assert.equal(mhsRes.status, 403);

    // Izinkan admin
    const adminRes = await fetch(`${baseUrl}/v2/activities`, {
      method: 'POST',
      headers: {
        'x-api-key': config.API_KEY,
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    assert.equal(adminRes.status, 201);
    const adminBody = await adminRes.json();
    assert.equal(adminBody.sukses, true);
    assert.equal(adminBody.data.title, payload.title);

    // Hapus kembali activity baru agar idempoten
    const delRes = await fetch(`${baseUrl}/v2/activities/${adminBody.data.id}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': config.API_KEY,
        Authorization: `Bearer ${adminToken}`
      }
    });
    assert.equal(delRes.status, 200);
  });

  it('DELETE /v2/activities/:id menolak dengan 409 Conflict jika masih ada expenses terkait', async () => {
    const res = await fetch(`${baseUrl}/v2/activities/3`, {
      method: 'DELETE',
      headers: {
        'x-api-key': config.API_KEY,
        Authorization: `Bearer ${adminToken}`
      }
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.sukses, false);
  });

  it('GET /v2/expenses mengembalikan data dengan cost object dan relasi activity', async () => {
    const res = await fetch(`${baseUrl}/v2/expenses`, {
      headers: { 'x-api-key': config.API_KEY }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sukses, true);
    assert.ok(Array.isArray(body.data));

    const item = body.data[0];
    assert.ok(item.cost, 'Wajib memuat cost object');
    assert.equal(typeof item.cost.convertedIDR, 'number');
    assert.ok(item.cost.formattedIDR.startsWith('Rp '));
    assert.ok(item.activity, 'Wajib memuat ringkasan activity terkait');
  });

  it('POST /v2/expenses menegakkan breaking change v2: tolak 400 jika tanpa activityId', async () => {
    const res = await fetch(`${baseUrl}/v2/expenses`, {
      method: 'POST',
      headers: {
        'x-api-key': config.API_KEY,
        Authorization: `Bearer ${mhsToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Pembelian ATK Lapangan Tanpa Activity',
        category: 'belanja',
        amount: 50000,
        currency: 'IDR',
        date: '2026-11-10'
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('activityId'));
  });

  it('POST /v2/expenses menolak 404 jika activityId tidak terdaftar di sistem', async () => {
    const res = await fetch(`${baseUrl}/v2/expenses`, {
      method: 'POST',
      headers: {
        'x-api-key': config.API_KEY,
        Authorization: `Bearer ${mhsToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        activityId: 99999,
        title: 'Biaya Fiktif',
        category: 'belanja',
        amount: 50000,
        currency: 'IDR',
        date: '2026-11-10'
      })
    });
    assert.equal(res.status, 404);
  });

  it('POST /v2/expenses berhasil (201) untuk role mahasiswa, dan DELETE khusus admin (403 untuk mhs, 200 admin)', async () => {
    // 1. Mahasiswa create expense
    const createRes = await fetch(`${baseUrl}/v2/expenses`, {
      method: 'POST',
      headers: {
        'x-api-key': config.API_KEY,
        Authorization: `Bearer ${mhsToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        activityId: 2,
        title: 'Kabel Jaringan Riset Sensor Untad',
        category: 'belanja',
        amount: 125000,
        currency: 'IDR',
        date: '2026-11-10',
        notes: 'Uji integrasi REST v2 Lidiya'
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.sukses, true);
    const newId = created.data.id;

    // 2. Mahasiswa coba DELETE -> harus 403 Forbidden
    const forbiddenDel = await fetch(`${baseUrl}/v2/expenses/${newId}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': config.API_KEY,
        Authorization: `Bearer ${mhsToken}`
      }
    });
    assert.equal(forbiddenDel.status, 403);

    // 3. Admin DELETE -> harus 200 OK
    const adminDel = await fetch(`${baseUrl}/v2/expenses/${newId}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': config.API_KEY,
        Authorization: `Bearer ${adminToken}`
      }
    });
    assert.equal(adminDel.status, 200);
  });

  it('GET /v2/expenses/summary mengembalikan ringkasan anggaran, rekap kategori & kegiatan, serta cuaca Untad', async () => {
    const res = await fetch(`${baseUrl}/v2/expenses/summary`, {
      headers: { 'x-api-key': config.API_KEY }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sukses, true);
    assert.ok(body.ringkasanUmum);
    assert.equal(typeof body.ringkasanUmum.totalPengeluaranIDR, 'number');
    assert.ok(body.rekapPerKategori);
    assert.ok(Array.isArray(body.rekapPerKegiatan));
    assert.ok(body.cuacaAcuanUntad);
    assert.ok(body.sumberKurs);
  });
});
