const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const server = require('../server');
const storage = require('../src/storage');
const validators = require('../src/validators');
const { getPublicApis } = require('../src/moduleLoader');

describe('Fondasi Server & Modul Bersama Kelompok 2 TIC', () => {
  let baseUrl = '';

  before(async () => {
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('memuat dataset awal JSON (activities, expenses, users)', async () => {
    const [activities, expenses, users] = await Promise.all([
      storage.getActivities(),
      storage.getExpenses(),
      storage.getUsers()
    ]);
    assert.ok(activities.length >= 3, 'Minimal 3 kegiatan riset awal');
    assert.ok(expenses.length >= 9, 'Minimal 9 pengeluaran awal');
    assert.ok(users.length >= 2, 'Minimal 2 akun (admin & mahasiswa)');
  });

  it('menjalankan validasi bersama untuk activity dan expense v2', () => {
    const missingActivityErr = validators.validasiExpenseV2({
      title: 'Konsumsi Survei',
      category: 'konsumsi',
      amount: 150000,
      currency: 'IDR',
      date: '2026-11-10'
    });
    assert.ok(missingActivityErr && missingActivityErr.includes('activityId'));

    const validExpense = validators.validasiExpenseV2({
      activityId: 1,
      title: 'Konsumsi Survei',
      category: 'konsumsi',
      amount: 150000,
      currency: 'IDR',
      date: '2026-11-10'
    });
    assert.equal(validExpense, null);

    const validActivity = validators.validasiActivityV2({
      title: 'Survei Lapangan Donggala',
      location: 'Kabupaten Donggala, Sulawesi Tengah',
      budgetLimitIDR: 10000000
    });
    assert.equal(validActivity, null);
  });

  it('menyediakan konversi mata uang IDR pada publicApis (aktif atau fallback)', () => {
    const conv = getPublicApis().konversiKeIDR(100, 'USD');
    assert.equal(typeof conv.nominalIDR, 'number');
    assert.ok(conv.nominalIDR > 0);
    assert.ok(conv.formatRupiah.startsWith('Rp '));
  });

  it('GET /api mengembalikan 200 dengan ringkasan Kelompok 2 dan statusModul', async () => {
    const res = await fetch(`${baseUrl}/api`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ONLINE');
    assert.ok(body.kelompok.includes('Kelompok 2'));
    assert.ok(body.statusModul && typeof body.statusModul === 'object');
  });

  it('endpoint tidak dikenal mengembalikan 404 JSON', async () => {
    const res = await fetch(`${baseUrl}/rute-tidak-ada`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.sukses, false);
    assert.equal(body.status, 404);
  });
});
