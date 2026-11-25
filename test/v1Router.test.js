// test/v1Router.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server');
const config = require('../src/config');

describe('Issue #3 — Integration Test REST v1 Legacy & Sunset (src/v1Router.js)', () => {
  let baseUrl = '';

  before(async () => {
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api melaporkan src/publicApis.js dan src/v1Router.js berstatus ACTIVE', async () => {
    const res = await fetch(`${baseUrl}/api`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.statusModul['src/publicApis.js'], 'ACTIVE');
    assert.equal(body.statusModul['src/v1Router.js'], 'ACTIVE');
  });

  it('GET /v1/expenses mengembalikan 200 dengan format flat Sub-CPMK 4 dan header Sunset', async () => {
    const res = await fetch(`${baseUrl}/v1/expenses`, {
      headers: { 'x-api-key': config.API_KEY }
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('sunset'), 'Thu, 31 Dec 2026 23:59:59 GMT');
    assert.equal(res.headers.get('deprecation'), 'true');
    assert.equal(res.headers.get('link'), '</v2/expenses>; rel="successor-version"');

    const body = await res.json();
    assert.equal(body.sukses, true);
    assert.ok(Array.isArray(body.data) && body.data.length > 0);

    const item = body.data[0];
    assert.ok(item.id !== undefined);
    assert.ok(item.title);
    assert.ok(typeof item.amountIDR === 'number');
    assert.equal(item.cost, undefined, 'Struktur v1 tidak boleh memiliki objek cost bersarang');
  });

  it('Metode selain GET ke /v1/expenses mengembalikan 410 Gone dengan header Sunset', async () => {
    const res = await fetch(`${baseUrl}/v1/expenses`, {
      method: 'POST',
      headers: {
        'x-api-key': config.API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Tes POST v1' })
    });
    assert.equal(res.status, 410);
    assert.equal(res.headers.get('sunset'), 'Thu, 31 Dec 2026 23:59:59 GMT');
    assert.equal(res.headers.get('deprecation'), 'true');
  });

  it('menolak ID non-integer dengan 400 dan sub-path tidak dikenal dengan 404 beserta header Sunset', async () => {
    const badId = await fetch(`${baseUrl}/v1/expenses/abc`, {
      headers: { 'x-api-key': config.API_KEY }
    });
    assert.equal(badId.status, 400);
    assert.equal(badId.headers.get('sunset'), 'Thu, 31 Dec 2026 23:59:59 GMT');

    const badPath = await fetch(`${baseUrl}/v1/expenses/1/extra`, {
      method: 'POST',
      headers: { 'x-api-key': config.API_KEY }
    });
    assert.equal(badPath.status, 404);
    assert.equal(badPath.headers.get('sunset'), 'Thu, 31 Dec 2026 23:59:59 GMT');
  });
});
