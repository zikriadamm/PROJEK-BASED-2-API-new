const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');

const server = require('../server');

describe('Issue #6 — Web Dashboard FT Untad (public/)', () => {
  let baseUrl = '';

  before(async () => {
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api melaporkan public/index.html ACTIVE dan package.json tetap hanya memuat graphql', async () => {
    const res = await fetch(`${baseUrl}/api`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.statusModul['public/index.html'], 'ACTIVE');

    const pkg = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    assert.deepEqual(Object.keys(pkg.dependencies || {}), ['graphql']);
    assert.equal(pkg.devDependencies, undefined);
  });

  it('GET /, /public/style.css, dan /public/app.js mengembalikan 200 dengan Content-Type tepat', async () => {
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    assert.ok(htmlRes.headers.get('content-type').includes('text/html'));
    const html = await htmlRes.text();
    assert.ok(html.includes('/public/style.css'));
    assert.ok(html.includes('/public/app.js'));
    assert.ok(html.includes('id="loginForm"'));
    assert.ok(html.includes('id="btnRunGraphQL"'));
    assert.ok(html.includes('id="btnRunVersionAudit"'));

    const cssRes = await fetch(`${baseUrl}/public/style.css`);
    assert.equal(cssRes.status, 200);
    assert.ok(cssRes.headers.get('content-type').includes('text/css'));

    const jsRes = await fetch(`${baseUrl}/public/app.js`);
    assert.equal(jsRes.status, 200);
    assert.ok(jsRes.headers.get('content-type').includes('application/javascript'));
    const js = await jsRes.text();
    assert.ok(js.includes("'x-api-key'"));
    assert.ok(js.includes('/v2/auth/login'));
    assert.ok(js.includes('/v1/expenses'));
    assert.ok(js.includes('/graphql'));
  });
});
