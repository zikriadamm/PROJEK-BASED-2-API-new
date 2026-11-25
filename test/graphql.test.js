const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');

const config = require('../src/config');
const security = require('../src/security');
const server = require('../server');

describe('Issue #5 — Integration Test POST /graphql', () => {
  let baseUrl = '';
  let originalExpensesRaw = '';
  let adminToken = '';
  let mhsToken = '';

  async function gql(query, variables = null, token = null) {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': config.API_KEY
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables })
    });
    return { status: res.status, body: await res.json() };
  }

  before(async () => {
    originalExpensesRaw = await fs.readFile(config.FILES.EXPENSES, 'utf-8');
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

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
      fullName: 'Muhammad Zikri Adam',
      identifier: 'F5512530117'
    });
  });

  after(async () => {
    await fs.writeFile(config.FILES.EXPENSES, originalExpensesRaw, 'utf-8');
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api melaporkan src/graphqlSchema.js ACTIVE', async () => {
    const res = await fetch(`${baseUrl}/api`);
    const body = await res.json();
    assert.equal(body.statusModul['src/graphqlSchema.js'], 'ACTIVE');
  });

  it('mendukung query berargumen, related data dua arah, dan pengayaan Public API', async () => {
    const { status, body } = await gql(`
      query {
        activities(status: "ACTIVE") {
          id
          title
          status
          financialSummary { budgetLimitIDR totalSpentIDR budgetStatus }
          currentWeather { temperature condition }
          expenses { id title cost { convertedIDR formattedIDR } }
        }
        activity(id: 3) {
          id
          location
          expenses { id currency }
        }
        expenses(activityId: 2, category: "belanja") {
          id
          title
          activity { id title }
        }
      }
    `);

    assert.equal(status, 200);
    assert.equal(body.errors, undefined);
    assert.equal(body.data.activities.length, 1);
    assert.equal(body.data.activities[0].id, 2);
    assert.ok(body.data.activities[0].currentWeather.temperature !== null);
    assert.ok(body.data.activities[0].expenses.length >= 2);
    assert.equal(body.data.activity.id, 3);
    assert.ok(body.data.expenses.every((e) => e.activity.id === 2));
  });

  it('menegakkan 401, 400, 404, dan 403 pada mutation createExpense dan deleteExpense', async () => {
    const validInput = {
      activityId: 2,
      title: 'Baterai Cadangan Logger Pasang Surut',
      category: 'belanja',
      amount: 25,
      currency: 'USD',
      date: '2026-11-10',
      notes: 'Uji mutation GraphQL'
    };

    // 1. Tanpa token -> 401
    const unauth = await gql(
      `mutation($input: CreateExpenseInput!) { createExpense(input: $input) { id } }`,
      { input: validInput }
    );
    assert.equal(unauth.status, 401);

    // 2. Mahasiswa boleh createExpense -> 200 & tersimpan
    const created = await gql(
      `mutation($input: CreateExpenseInput!) {
        createExpense(input: $input) {
          id title submittedBy cost { convertedIDR } activity { id title }
        }
      }`,
      { input: validInput },
      mhsToken
    );
    assert.equal(created.status, 200);
    const createdId = created.body.data.createExpense.id;
    assert.ok(createdId > 9);
    assert.ok(created.body.data.createExpense.cost.convertedIDR > 0);
    assert.equal(created.body.data.createExpense.activity.id, 2);

    // 3. Input tidak valid (amount <= 0) -> 400 (memakai validasiExpenseV2 yang sama dengan REST)
    const badInput = await gql(
      `mutation($input: CreateExpenseInput!) { createExpense(input: $input) { id } }`,
      { input: { ...validInput, amount: -10 } },
      mhsToken
    );
    assert.equal(badInput.status, 400);

    // 4. activityId tidak ditemukan -> 404
    const missingAct = await gql(
      `mutation($input: CreateExpenseInput!) { createExpense(input: $input) { id } }`,
      { input: { ...validInput, activityId: 999 } },
      mhsToken
    );
    assert.equal(missingAct.status, 404);

    // 5. Mahasiswa mencoba deleteExpense -> 403 Forbidden
    const forbiddenDel = await gql(
      `mutation($id: Int!) { deleteExpense(id: $id) { id } }`,
      { id: createdId },
      mhsToken
    );
    assert.equal(forbiddenDel.status, 403);

    // 6. Admin menghapus deleteExpense -> 200 OK
    const adminDel = await gql(
      `mutation($id: Int!) { deleteExpense(id: $id) { id title } }`,
      { id: createdId },
      adminToken
    );
    assert.equal(adminDel.status, 200);
    assert.equal(adminDel.body.data.deleteExpense.id, createdId);
  });
});
