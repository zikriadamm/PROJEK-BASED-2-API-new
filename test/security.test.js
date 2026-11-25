const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const config = require('../src/config');
const security = require('../src/security');
const server = require('../server');

describe('Issue #1 — Unit Test src/security.js', () => {
  it('hashPassword dan verifyPassword memakai salt acak dan scrypt dengan benar', () => {
    const hashA = security.hashPassword('rahasia123');
    const hashB = security.hashPassword('rahasia123');

    assert.notEqual(hashA, hashB, 'Setiap hashing harus menghasilkan salt berbeda');
    assert.ok(hashA.includes(':'), 'Format hash wajib salt:hash');
    assert.equal(security.verifyPassword('rahasia123', hashA), true);
    assert.equal(security.verifyPassword('salah', hashA), false);
    assert.equal(security.verifyPassword('rahasia123', 'format-rusak'), false);
  });

  it('generateToken dan verifyToken memvalidasi tanda tangan HMAC-SHA256 dan kedaluwarsa', () => {
    const sampleUser = {
      id: 1,
      username: 'admin',
      role: 'admin',
      fullName: 'Admin Keuangan FT Untad',
      identifier: 'ADMIN-FT-UNTAD'
    };

    const token = security.generateToken(sampleUser, 3600);
    const verified = security.verifyToken(token);
    assert.equal(verified.valid, true);
    assert.equal(verified.user.username, 'admin');
    assert.equal(verified.user.role, 'admin');

    // Token yang dimanipulasi harus ditolak
    const tampered = `${token.slice(0, -4)}XXXX`;
    assert.equal(security.verifyToken(tampered).valid, false);

    // Token yang sudah kedaluwarsa (TTL <= 0) harus ditolak
    const expiredToken = security.generateToken(sampleUser, -5);
    const expiredRes = security.verifyToken(expiredToken);
    assert.equal(expiredRes.valid, false);
    assert.ok(expiredRes.error.toLowerCase().includes('kedaluwarsa'));
  });

  it('requireAuth menegakkan 401 untuk token hilang/invalid dan 403 untuk role tidak berhak', () => {
    const noToken = security.requireAuth({ headers: {} }, ['admin']);
    assert.equal(noToken.ok, false);
    assert.equal(noToken.status, 401);

    const badToken = security.requireAuth({ headers: { authorization: 'Bearer invalid.token.here' } }, ['admin']);
    assert.equal(badToken.ok, false);
    assert.equal(badToken.status, 401);

    const mhsToken = security.generateToken({
      id: 2,
      username: 'mahasiswa',
      role: 'mahasiswa',
      fullName: 'Muhammad Zikri Adam',
      identifier: 'F5512530117'
    });

    const forbidden = security.requireAuth(
      { headers: { authorization: `Bearer ${mhsToken}` } },
      ['admin']
    );
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.status, 403);

    const allowedMhs = security.requireAuth(
      { headers: { authorization: `Bearer ${mhsToken}` } },
      ['admin', 'mahasiswa']
    );
    assert.equal(allowedMhs.ok, true);
    assert.equal(allowedMhs.user.role, 'mahasiswa');
  });
});

describe('Issue #1 — Integration Test API Key & /v2/auth/*', () => {
  let baseUrl = '';

  before(async () => {
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api melaporkan src/security.js dan src/authRouter.js ACTIVE', async () => {
    const res = await fetch(`${baseUrl}/api`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.statusModul['src/security.js'], 'ACTIVE');
    assert.equal(body.statusModul['src/authRouter.js'], 'ACTIVE');
  });

  it('menolak request ke /v1, /v2, dan /graphql dengan 401 jika x-api-key hilang atau salah', async () => {
    for (const [method, path] of [
      ['GET', '/v1/expenses'],
      ['GET', '/v2/activities'],
      ['POST', '/v2/auth/login'],
      ['POST', '/graphql']
    ]) {
      const missingRes = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(missingRes.status, 401, `${method} ${path} tanpa x-api-key harus 401`);

      const wrongRes = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'x-api-key': 'kunci-salah' }
      });
      assert.equal(wrongRes.status, 401, `${method} ${path} dengan x-api-key salah harus 401`);
    }
  });

  it('POST /v2/auth/login berhasil untuk admin dan mahasiswa tanpa membocorkan passwordHash', async () => {
    const resAdmin = await fetch(`${baseUrl}/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.API_KEY
      },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.equal(resAdmin.status, 200);
    const adminBody = await resAdmin.json();
    assert.equal(adminBody.sukses, true);
    assert.equal(typeof adminBody.token, 'string');
    assert.equal(adminBody.user.role, 'admin');
    assert.equal(adminBody.user.passwordHash, undefined);

    const resMhs = await fetch(`${baseUrl}/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.API_KEY
      },
      body: JSON.stringify({ username: 'mahasiswa', password: 'mhs123' })
    });
    assert.equal(resMhs.status, 200);
    const mhsBody = await resMhs.json();
    assert.equal(mhsBody.user.role, 'mahasiswa');
    assert.equal(mhsBody.user.passwordHash, undefined);
  });

  it('POST /v2/auth/login dengan password salah mengembalikan 401', async () => {
    const res = await fetch(`${baseUrl}/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.API_KEY
      },
      body: JSON.stringify({ username: 'admin', password: 'password-salah' })
    });
    assert.equal(res.status, 401);
  });

  it('POST /v2/auth/logout mencabut token sehingga tidak bisa digunakan kembali', async () => {
    const loginRes = await fetch(`${baseUrl}/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.API_KEY
      },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const { token } = await loginRes.json();

    // Sebelum logout, /v2/auth/me berhasil 200
    const meBefore = await fetch(`${baseUrl}/v2/auth/me`, {
      headers: { 'x-api-key': config.API_KEY, Authorization: `Bearer ${token}` }
    });
    assert.equal(meBefore.status, 200);

    // Logout berhasil 200
    const logoutRes = await fetch(`${baseUrl}/v2/auth/logout`, {
      method: 'POST',
      headers: { 'x-api-key': config.API_KEY, Authorization: `Bearer ${token}` }
    });
    assert.equal(logoutRes.status, 200);

    // Setelah logout, token ditolak 401
    const meAfter = await fetch(`${baseUrl}/v2/auth/me`, {
      headers: { 'x-api-key': config.API_KEY, Authorization: `Bearer ${token}` }
    });
    assert.equal(meAfter.status, 401);
  });
});
