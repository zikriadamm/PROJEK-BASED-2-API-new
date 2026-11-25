const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');

const server = require('../server');
const config = require('../src/config');
const client = require('../client');

describe('Issue #7 & #8 — OpenAPI, Postman Collection, dan Client Console CLI', () => {
  let baseUrl = '';

  before(async () => {
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /openapi.yaml mengembalikan 200 text/yaml dan GET /api melaporkan openapi.yaml ACTIVE', async () => {
    const apiRes = await fetch(`${baseUrl}/api`);
    assert.equal(apiRes.status, 200);
    const apiBody = await apiRes.json();
    assert.equal(apiBody.statusModul['openapi.yaml'], 'ACTIVE');

    const yamlRes = await fetch(`${baseUrl}/openapi.yaml`);
    assert.equal(yamlRes.status, 200);
    assert.ok(yamlRes.headers.get('content-type').includes('text/yaml'));
    const text = await yamlRes.text();
    assert.ok(text.includes('openapi: 3.0.3'));
    assert.ok(text.includes('ApiKeyAuth:'));
    assert.ok(text.includes('BearerAuth:'));
    assert.ok(text.includes('deprecated: true'));
  });

  it('koleksi dan environment Postman valid, memiliki minimal 5 test case, dan konsisten dengan .env.example', async () => {
    const root = path.join(__dirname, '..');
    const col = JSON.parse(
      await fs.readFile(
        path.join(root, 'postman', 'PBL2_Untad_Research_Expense_API.postman_collection.json'),
        'utf-8'
      )
    );
    const env = JSON.parse(
      await fs.readFile(path.join(root, 'postman', 'PBL2_Untad_Local.postman_environment.json'), 'utf-8')
    );
    const envExample = await fs.readFile(path.join(root, '.env.example'), 'utf-8');
    const exampleApiKey = envExample.match(/^API_KEY=(.+)$/m)?.[1]?.trim();

    assert.ok(Array.isArray(col.item) && col.item.length >= 5, 'Minimal 5 test case pada koleksi Postman');
    const colApiKey = col.variable.find((v) => v.key === 'apiKey')?.value;
    const envApiKey = env.values.find((v) => v.key === 'apiKey')?.value;
    assert.equal(colApiKey, exampleApiKey);
    assert.equal(envApiKey, exampleApiKey);
  });

  it('helper client.js berhasil login, mengirim x-api-key + Bearer token, dan memformat error 401', async () => {
    const badSession = client.createSessionState(baseUrl, 'kunci-salah');
    const unauth = await client.callApi(badSession, '/v2/expenses');
    assert.equal(unauth.ok, false);
    assert.equal(unauth.status, 401);
    assert.ok(unauth.message.includes('[401 Unauthorized]'));

    const session = client.createSessionState(baseUrl, config.API_KEY);
    const login = await client.callApi(session, '/v2/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'admin123' }
    });
    assert.equal(login.ok, true);
    assert.equal(login.status, 200);
    session.token = login.data.token;

    const me = await client.callApi(session, '/v2/auth/me', { withAuth: true });
    assert.equal(me.ok, true);
    assert.equal(me.data.user.role, 'admin');
  });
});
