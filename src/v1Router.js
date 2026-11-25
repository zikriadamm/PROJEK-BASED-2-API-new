// src/v1Router.js
// Penanggung Jawab: Tabita Creaselia Belicia Theona (F5512520086)

const storage = require('./storage');
const { kirimJSON, kirimError } = require('./httpHelpers');
const { getPublicApis } = require('./moduleLoader');

// Header migrasi standar RFC 8594
const V1_HEADERS = {
  'Sunset': 'Thu, 31 Dec 2026 23:59:59 GMT',
  'Deprecation': 'true',
  'Link': '</v2/expenses>; rel="successor-version"'
};

function formatExpenseV1(exp, publicApis, rates) {
  const conv = publicApis.konversiKeIDR(exp.amount, exp.currency, rates);
  return {
    id: exp.id,
    title: exp.title,
    category: exp.category,
    amount: exp.amount,
    currency: exp.currency,
    amountIDR: conv.nominalIDR,
    date: exp.date,
    notes: exp.notes || ''
  };
}

async function handleV1Router(req, res, pathname, method, query = {}) {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';

  if (cleanPath === '/v1/expenses' || cleanPath.startsWith('/v1/expenses/')) {
    // Operasi selain GET (POST, PUT, DELETE) ditolak ramah dengan 410 Gone + Header Sunset
    if (method !== 'GET') {
      return kirimError(
        res,
        410,
        'Endpoint operasi tulis REST v1 sudah ditutup (Deprecated/Sunset). Silakan gunakan REST v2 (/v2/expenses).',
        {
          metodeDiminta: method,
          successorEndpoint: '/v2/expenses'
        },
        V1_HEADERS
      );
    }

    const publicApis = getPublicApis();
    const [{ rates }, allExpenses] = await Promise.all([
      publicApis.getLiveRates(),
      storage.getExpenses()
    ]);

    // GET /v1/expenses/:id
    if (cleanPath.startsWith('/v1/expenses/')) {
      const idStr = cleanPath.replace('/v1/expenses/', '').trim();
      const id = Number(idStr);
      const found = allExpenses.find((item) => Number(item.id) === id);

      if (!found) {
        return kirimError(res, 404, `Pengeluaran dengan ID ${idStr} tidak ditemukan.`, null, V1_HEADERS);
      }

      return kirimJSON(
        res,
        200,
        {
          sukses: true,
          versi: 'v1 (Legacy Deprecated)',
          data: formatExpenseV1(found, publicApis, rates)
        },
        V1_HEADERS
      );
    }

    // GET /v1/expenses
    let daftar = allExpenses.map((exp) => formatExpenseV1(exp, publicApis, rates));

    if (query.category) {
      daftar = daftar.filter(
        (item) => String(item.category).toLowerCase() === String(query.category).toLowerCase()
      );
    }

    return kirimJSON(
      res,
      200,
      {
        sukses: true,
        versi: 'v1 (Legacy Deprecated)',
        pesan: 'Endpoint v1 ini akan dihentikan pada 31 Desember 2026. Beralihlah ke /v2/expenses.',
        totalData: daftar.length,
        data: daftar
      },
      V1_HEADERS
    );
  }

  return kirimError(
    res,
    404,
    `Endpoint REST v1 '${method} ${cleanPath}' tidak ditemukan.`,
    { successorEndpoint: '/v2/expenses' },
    V1_HEADERS
  );
}

module.exports = {
  handleV1Router
};
