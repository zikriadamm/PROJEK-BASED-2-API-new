const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const config = require('./src/config');
const { KATEGORI_VALID, MATA_UANG_DIDUKUNG } = require('./src/validators');

const DEFAULT_BASE_URL = process.env.API_BASE_URL || `http://localhost:${config.PORT}`;

function createSessionState(baseUrl = DEFAULT_BASE_URL, apiKey = config.API_KEY) {
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    token: null,
    user: null
  };
}

function buildHeaders(session, includeJson = false, withAuth = false) {
  const headers = {
    'x-api-key': session.apiKey
  };
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (withAuth && session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  return headers;
}

function formatApiError(status, payload) {
  const pesan = payload?.error || payload?.errors?.[0]?.message || 'Terjadi kesalahan pada server.';
  switch (status) {
    case 400:
      return `[400 Bad Request] ${pesan}`;
    case 401:
      return `[401 Unauthorized] ${pesan} (Pastikan API Key benar atau login terlebih dahulu).`;
    case 403:
      return `[403 Forbidden] ${pesan} (Peran akun Anda tidak memiliki izin untuk aksi ini).`;
    case 404:
      return `[404 Not Found] ${pesan}`;
    case 409:
      return `[409 Conflict] ${pesan}`;
    case 410:
      return `[410 Gone] ${pesan}`;
    default:
      return `[HTTP ${status}] ${pesan}`;
  }
}

async function callApi(session, path, { method = 'GET', body = null, withAuth = false } = {}) {
  const url = `${session.baseUrl}${path}`;
  const options = {
    method,
    headers: buildHeaders(session, body !== null, withAuth)
  };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      networkError: true,
      message: `Gagal terhubung ke server (${session.baseUrl}). Pastikan server aktif dengan menjalankan "npm start".`
    };
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      headers: res.headers,
      data,
      message: formatApiError(res.status, data)
    };
  }

  return {
    ok: true,
    status: res.status,
    headers: res.headers,
    data
  };
}

async function promptInput(rl, label, defaultVal = '') {
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  const answer = await rl.question(`${label}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed || defaultVal;
}

async function handleLogin(rl, session) {
  console.log('\n--- Login Pengguna (/v2/auth/login) ---');
  console.log('Akun demo bawaan: admin / admin123  atau  mahasiswa / mhs123');
  const username = await promptInput(rl, 'Username', 'admin');
  const password = await promptInput(rl, 'Password', 'admin123');

  const res = await callApi(session, '/v2/auth/login', {
    method: 'POST',
    body: { username, password }
  });

  if (!res.ok) {
    console.log(`\n${res.message}`);
    return;
  }

  session.token = res.data.token;
  session.user = res.data.user;
  console.log(`\nLogin berhasil sebagai ${session.user.fullName} (role: ${session.user.role}).`);
  console.log(`Bearer token disimpan di memori sesi CLI (berlaku ${res.data.expiresIn} detik).`);
}

async function handleListActivities(session) {
  console.log('\n--- Daftar Kegiatan Riset & Cuaca (/v2/activities) ---');
  const res = await callApi(session, '/v2/activities');
  if (!res.ok) {
    console.log(res.message);
    return;
  }

  const list = res.data?.data || [];
  if (list.length === 0) {
    console.log('Belum ada kegiatan riset terdaftar.');
    return;
  }

  list.forEach((act) => {
    const fin = act.financialSummary || {};
    const weather = act.currentWeather || {};
    console.log(`\n[${act.id}] ${act.title} (${act.status})`);
    console.log(`    Lokasi   : ${act.location}`);
    console.log(`    Anggaran : ${fin.totalExpensesFormatted || 'Rp 0'} / ${fin.budgetLimitFormatted || '-'} (${fin.utilizationPercent ?? 0}% - ${fin.budgetStatus || '-'})`);
    console.log(`    Cuaca    : ${weather.temperatureFormatted || '-'}, ${weather.condition || '-'} (${weather.sumber || '-'})`);
  });
}

async function handleListExpenses(session) {
  console.log('\n--- Daftar Pengeluaran & Kurs IDR (/v2/expenses) ---');
  const res = await callApi(session, '/v2/expenses');
  if (!res.ok) {
    console.log(res.message);
    return;
  }

  const list = res.data?.data || [];
  console.log(`Total: ${res.data?.total ?? list.length} item | Sumber kurs: ${res.data?.exchangeRateSource || '-'}`);
  if (list.length === 0) {
    console.log('Belum ada catatan pengeluaran.');
    return;
  }

  list.forEach((exp) => {
    const cost = exp.cost || {};
    const actTitle = exp.activity?.title || `Activity #${exp.activityId}`;
    console.log(`\n[${exp.id}] ${exp.title} (${exp.category})`);
    console.log(`    Kegiatan : [${exp.activityId}] ${actTitle}`);
    console.log(`    Nominal  : ${exp.amount} ${exp.currency} -> ${cost.formattedIDR || '-'} (Kurs: ${cost.exchangeRateIDR || '-'})`);
    console.log(`    Tanggal  : ${exp.date} | Oleh: ${exp.submittedBy || '-'}`);
  });
}

async function handleSummary(session) {
  console.log('\n--- Ringkasan Anggaran (/v2/expenses/summary) ---');
  const res = await callApi(session, '/v2/expenses/summary');
  if (!res.ok) {
    console.log(res.message);
    return;
  }

  const umum = res.data?.ringkasanUmum || {};
  const kurs = res.data?.sumberKurs || {};
  const cuaca = res.data?.cuacaAcuanUntad || {};

  console.log(`Total Kegiatan       : ${umum.totalKegiatan ?? 0}`);
  console.log(`Total Pengeluaran    : ${umum.totalCatatanPengeluaran ?? 0} catatan`);
  console.log(`Total Plafon         : ${umum.totalPlafonFormatted || '-'}`);
  console.log(`Realisasi Pengeluaran: ${umum.totalPengeluaranFormatted || '-'}`);
  console.log(`Sisa Anggaran        : ${umum.sisaAnggaranTotalFormatted || '-'}`);
  console.log(`Sumber Kurs          : ${kurs.provider || '-'} [${kurs.status || '-'}]`);
  console.log(`Cuaca Kampus Untad   : ${cuaca.temperatureFormatted || '-'}, ${cuaca.condition || '-'}`);

  const perKegiatan = res.data?.rekapPerKegiatan || [];
  if (perKegiatan.length > 0) {
    console.log('\nRekap Per Kegiatan:');
    perKegiatan.forEach((item) => {
      console.log(`  - [${item.activityId}] ${item.title}: ${item.totalSpentFormatted} / ${item.budgetLimitFormatted} (${item.utilizationPercent}% - ${item.budgetStatus})`);
    });
  }
}

async function handleCreateExpense(rl, session) {
  console.log('\n--- Tambah Pengeluaran Baru (POST /v2/expenses) ---');
  if (!session.token) {
    console.log('Peringatan: Anda belum login. Request tetap dikirim untuk memperlihatkan respon server (401) atau silakan login dulu via menu 1.');
  }

  const actIdRaw = await promptInput(rl, 'ID Kegiatan (activityId)', '2');
  const activityId = Number(actIdRaw);
  const title = await promptInput(rl, 'Judul pengeluaran');
  const category = await promptInput(rl, `Kategori (${KATEGORI_VALID.join('/')})`, 'transportasi');
  const amountRaw = await promptInput(rl, 'Nominal (amount)', '100000');
  const amount = Number(amountRaw);
  const currency = (await promptInput(rl, `Mata uang (${MATA_UANG_DIDUKUNG.join('/')})`, 'IDR')).toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const date = await promptInput(rl, 'Tanggal (YYYY-MM-DD)', today);
  const notes = await promptInput(rl, 'Catatan (opsional)');

  if (!Number.isInteger(activityId) || activityId <= 0) {
    console.log('\n[Validasi Lokal] activityId harus berupa bilangan bulat positif.');
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.log('\n[Validasi Lokal] Nominal (amount) harus berupa angka lebih besar dari 0.');
    return;
  }

  const res = await callApi(session, '/v2/expenses', {
    method: 'POST',
    withAuth: true,
    body: {
      activityId,
      title,
      category: category.toLowerCase(),
      amount,
      currency,
      date,
      notes
    }
  });

  if (!res.ok) {
    console.log(`\n${res.message}`);
    return;
  }

  const created = res.data?.data || {};
  console.log(`\n${res.data?.pesan || 'Pengeluaran berhasil ditambahkan.'}`);
  console.log(`ID Baru: ${created.id} | Konversi IDR: ${created.cost?.formattedIDR || '-'}`);
}

async function handleLegacyV1(session) {
  console.log('\n--- Cek Endpoint Legasi v1 (GET /v1/expenses) ---');
  const res = await callApi(session, '/v1/expenses');
  if (!res.ok) {
    console.log(res.message);
    return;
  }

  const sunset = res.headers.get('sunset') || '-';
  const deprecation = res.headers.get('deprecation') || '-';
  const link = res.headers.get('link') || '-';

  console.log(`Versi API    : ${res.data?.versi || 'v1'}`);
  console.log(`Header Sunset: ${sunset}`);
  console.log(`Deprecation  : ${deprecation}`);
  console.log(`Header Link  : ${link}`);
  console.log(`Pesan Migrasi: ${res.data?.pesan || '-'}`);
  console.log(`Total Data v1: ${res.data?.totalData ?? 0} item`);
}

async function handleGraphQL(rl, session) {
  console.log('\n--- Jalankan Query GraphQL (POST /graphql) ---');
  console.log('Pilih contoh query:');
  console.log('  1. Daftar Activities + FinancialSummary + Cuaca');
  console.log('  2. Daftar Expenses + Cost IDR');
  console.log('  3. Masukkan query GraphQL kustom');
  const choice = await promptInput(rl, 'Pilihan', '1');

  let query = '';
  if (choice === '1') {
    query = `query {
  activities {
    id
    title
    status
    financialSummary {
      totalSpentIDR
      budgetLimitIDR
      budgetStatus
    }
    currentWeather {
      temperatureFormatted
      condition
    }
  }
}`;
  } else if (choice === '2') {
    query = `query {
  expenses {
    id
    activityId
    title
    category
    cost {
      originalAmount
      originalCurrency
      formattedIDR
    }
  }
}`;
  } else {
    query = await promptInput(rl, 'Query GraphQL');
  }

  if (!query) {
    console.log('Query tidak boleh kosong.');
    return;
  }

  const res = await callApi(session, '/graphql', {
    method: 'POST',
    withAuth: Boolean(session.token),
    body: { query }
  });

  if (!res.ok) {
    console.log(`\n${res.message}`);
    return;
  }

  console.log('\nHasil GraphQL:');
  console.log(JSON.stringify(res.data, null, 2));
}

async function handleLogout(session) {
  console.log('\n--- Logout (/v2/auth/logout) ---');
  if (!session.token) {
    console.log('Tidak ada sesi login aktif di CLI.');
    return;
  }

  const res = await callApi(session, '/v2/auth/logout', {
    method: 'POST',
    withAuth: true
  });

  if (!res.ok) {
    console.log(res.message);
    if (res.status === 401) {
      session.token = null;
      session.user = null;
    }
    return;
  }

  session.token = null;
  session.user = null;
  console.log(res.data?.pesan || 'Logout berhasil.');
}

function printMenu(session) {
  const statusLogin = session.user
    ? `${session.user.username} (${session.user.role})`
    : 'Belum login';

  console.log('\n============================================================');
  console.log('  UNTAD RESEARCH EXPENSE TRACKER CLI (Sub-CPMK 5)');
  console.log(`  Server: ${session.baseUrl} | Sesi: ${statusLogin}`);
  console.log('============================================================');
  console.log('  1. Login (POST /v2/auth/login)');
  console.log('  2. Lihat Kegiatan Riset & Cuaca (GET /v2/activities)');
  console.log('  3. Lihat Daftar Pengeluaran & Kurs IDR (GET /v2/expenses)');
  console.log('  4. Lihat Ringkasan Anggaran (GET /v2/expenses/summary)');
  console.log('  5. Tambah Pengeluaran Baru (POST /v2/expenses)');
  console.log('  6. Cek Endpoint Legasi v1 & Header Sunset (GET /v1/expenses)');
  console.log('  7. Jalankan Query GraphQL (POST /graphql)');
  console.log('  8. Logout (POST /v2/auth/logout)');
  console.log('  0. Keluar');
  console.log('============================================================');
}

async function runCli(session = createSessionState()) {
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      printMenu(session);
      let pilihan;
      try {
        pilihan = (await rl.question('Pilih menu [0-8]: ')).trim();
      } catch (err) {
        // Input stream ditutup (EOF / Ctrl+C) -> keluar dengan rapi tanpa stack trace
        break;
      }

      if (pilihan === '0') {
        console.log('Sampai jumpa!');
        break;
      }

      switch (pilihan) {
        case '1':
          await handleLogin(rl, session);
          break;
        case '2':
          await handleListActivities(session);
          break;
        case '3':
          await handleListExpenses(session);
          break;
        case '4':
          await handleSummary(session);
          break;
        case '5':
          await handleCreateExpense(rl, session);
          break;
        case '6':
          await handleLegacyV1(session);
          break;
        case '7':
          await handleGraphQL(rl, session);
          break;
        case '8':
          await handleLogout(session);
          break;
        default:
          console.log('Pilihan tidak dikenal. Silakan pilih angka 0 sampai 8.');
      }
    }
  } catch (err) {
    if (err?.code !== 'ERR_USE_AFTER_CLOSE' && err?.name !== 'AbortError') {
      console.log(`\n[Error CLI] ${err.message || 'Terjadi kesalahan pada sesi input.'}`);
    }
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  runCli().catch(() => {
    console.error('Terjadi kesalahan tak terduga saat menjalankan Client Console.');
    process.exitCode = 1;
  });
}

module.exports = {
  createSessionState,
  buildHeaders,
  formatApiError,
  callApi,
  runCli
};
