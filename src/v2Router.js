const storage = require('./storage');
const { kirimJSON, kirimError, bacaBody } = require('./httpHelpers');
const { validasiActivityV2, validasiExpenseV2 } = require('./validators');
const { getSecurity, getPublicApis } = require('./moduleLoader');

function buildCostObject(amount, currency, rates) {
  const conv = getPublicApis().konversiKeIDR(amount, currency, rates);
  return {
    originalAmount: amount,
    originalCurrency: (currency || 'IDR').toUpperCase(),
    convertedIDR: conv.nominalIDR,
    exchangeRateIDR: conv.kursPerSatuanIDR,
    formattedIDR: conv.formatRupiah
  };
}

function calculateFinancialSummary(activity, relatedExpenses, rates) {
  const totalSpentIDR = relatedExpenses.reduce((sum, exp) => {
    const conv = getPublicApis().konversiKeIDR(exp.amount, exp.currency, rates);
    return sum + (conv.nominalIDR || 0);
  }, 0);

  const budgetLimitIDR = Number(activity.budgetLimitIDR) || 0;
  const remainingBudgetIDR = budgetLimitIDR - totalSpentIDR;
  const utilizationPercent =
    budgetLimitIDR > 0 ? Number(((totalSpentIDR / budgetLimitIDR) * 100).toFixed(2)) : 0;

  let budgetStatus = 'AMAN';
  if (utilizationPercent > 100) {
    budgetStatus = 'MELEBIHI_BATAS';
  } else if (utilizationPercent >= 80) {
    budgetStatus = 'WASPADA';
  }

  return {
    totalSpentIDR,
    totalExpensesIDR: totalSpentIDR,
    totalExpensesFormatted: 'Rp ' + totalSpentIDR.toLocaleString('id-ID'),
    budgetLimitIDR,
    budgetLimitFormatted: 'Rp ' + budgetLimitIDR.toLocaleString('id-ID'),
    remainingBudgetIDR,
    remainingBudgetFormatted: 'Rp ' + remainingBudgetIDR.toLocaleString('id-ID'),
    utilizationPercent,
    budgetStatus
  };
}

async function handleV2Router(req, res, pathname, method, query) {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const parts = cleanPath.split('/').filter(Boolean); // ['v2', ...]

  // Rute /v2/activities
  if (parts[0] === 'v2' && parts[1] === 'activities') {
    // GET & POST /v2/activities
    if (parts.length === 2) {
      if (method === 'GET') {
        const [activities, expenses, ratesRes] = await Promise.all([
          storage.getActivities(),
          storage.getExpenses(),
          getPublicApis().getLiveRates()
        ]);
        const rates = ratesRes?.rates || ratesRes;

        let filtered = activities;
        if (query?.status) {
          filtered = filtered.filter(
            (a) => (a.status || '').toUpperCase() === query.status.toUpperCase()
          );
        }

        const data = await Promise.all(
          filtered.map(async (act) => {
            const actExpenses = expenses.filter((e) => e.activityId === act.id);
            const financialSummary = calculateFinancialSummary(act, actExpenses, rates);
            const currentWeather = await getPublicApis().getWeatherForecast(
              act.latitude,
              act.longitude
            );
            return {
              ...act,
              financialSummary,
              currentWeather,
              expenseCount: actExpenses.length
            };
          })
        );

        return kirimJSON(res, 200, { sukses: true, total: data.length, data });
      }

      if (method === 'POST') {
        const auth = getSecurity().requireAuth(req, ['admin']);
        if (!auth.ok) return kirimError(res, auth.status, auth.error);

        const body = await bacaBody(req);
        const validationError = validasiActivityV2(body, false);
        if (validationError) return kirimError(res, 400, validationError);

        const activities = await storage.getActivities();
        const id = storage.nextId(activities);

        const newActivity = {
          id,
          title: body.title.trim(),
          location: body.location.trim(),
          latitude: body.latitude ?? -0.836,
          longitude: body.longitude ?? 119.893,
          unit: body.unit || 'Fakultas Teknik Untad',
          leadResearcher: body.leadResearcher || (auth.user?.fullName || 'Peneliti FT Untad'),
          budgetLimitIDR: body.budgetLimitIDR,
          startDate: body.startDate || new Date().toISOString().slice(0, 10),
          endDate: body.endDate || new Date().toISOString().slice(0, 10),
          status: (body.status || 'PLANNED').toUpperCase(),
          description: body.description || ''
        };

        activities.push(newActivity);
        await storage.saveActivities(activities);
        return kirimJSON(res, 201, {
          sukses: true,
          pesan: 'Kegiatan riset berhasil dibuat.',
          data: newActivity
        });
      }

      return kirimError(res, 405, `Metode ${method} tidak diizinkan pada /v2/activities.`);
    }

    // GET, PUT, DELETE /v2/activities/:id
    if (parts.length === 3) {
      const id = Number(parts[2]);
      if (Number.isNaN(id) || !Number.isInteger(id)) {
        return kirimError(res, 400, 'ID kegiatan harus berupa bilangan bulat valid.');
      }

      if (method === 'GET') {
        const [activities, expenses, ratesRes] = await Promise.all([
          storage.getActivities(),
          storage.getExpenses(),
          getPublicApis().getLiveRates()
        ]);
        const activity = activities.find((a) => a.id === id);
        if (!activity) {
          return kirimError(res, 404, `Kegiatan riset dengan ID ${id} tidak ditemukan.`);
        }

        const rates = ratesRes?.rates || ratesRes;
        const actExpenses = expenses.filter((e) => e.activityId === id);
        const financialSummary = calculateFinancialSummary(activity, actExpenses, rates);
        const currentWeather = await getPublicApis().getWeatherForecast(
          activity.latitude,
          activity.longitude
        );
        const enrichedExpenses = actExpenses.map((e) => ({
          ...e,
          cost: buildCostObject(e.amount, e.currency, rates)
        }));

        return kirimJSON(res, 200, {
          sukses: true,
          data: {
            ...activity,
            financialSummary,
            currentWeather,
            expenses: enrichedExpenses
          }
        });
      }

      if (method === 'PUT') {
        const auth = getSecurity().requireAuth(req, ['admin']);
        if (!auth.ok) return kirimError(res, auth.status, auth.error);

        const activities = await storage.getActivities();
        const index = activities.findIndex((a) => a.id === id);
        if (index === -1) {
          return kirimError(res, 404, `Kegiatan riset dengan ID ${id} tidak ditemukan.`);
        }

        const body = await bacaBody(req);
        const validationError = validasiActivityV2(body, true);
        if (validationError) return kirimError(res, 400, validationError);

        activities[index] = {
          ...activities[index],
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.location !== undefined ? { location: body.location.trim() } : {}),
          ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
          ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
          ...(body.unit !== undefined ? { unit: body.unit } : {}),
          ...(body.leadResearcher !== undefined ? { leadResearcher: body.leadResearcher } : {}),
          ...(body.budgetLimitIDR !== undefined ? { budgetLimitIDR: body.budgetLimitIDR } : {}),
          ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
          ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
          ...(body.status !== undefined ? { status: body.status.toUpperCase() } : {}),
          ...(body.description !== undefined ? { description: body.description } : {})
        };

        await storage.saveActivities(activities);
        return kirimJSON(res, 200, {
          sukses: true,
          pesan: 'Kegiatan riset berhasil diperbarui.',
          data: activities[index]
        });
      }

      if (method === 'DELETE') {
        const auth = getSecurity().requireAuth(req, ['admin']);
        if (!auth.ok) return kirimError(res, auth.status, auth.error);

        const activities = await storage.getActivities();
        const index = activities.findIndex((a) => a.id === id);
        if (index === -1) {
          return kirimError(res, 404, `Kegiatan riset dengan ID ${id} tidak ditemukan.`);
        }

        const expenses = await storage.getExpenses();
        const relatedExpenses = expenses.filter((e) => e.activityId === id);
        if (relatedExpenses.length > 0) {
          return kirimError(
            res,
            409,
            `Kegiatan tidak dapat dihapus karena masih memiliki ${relatedExpenses.length} catatan pengeluaran terkait. Hapus pengeluaran terlebih dahulu.`,
            { relatedExpenseCount: relatedExpenses.length }
          );
        }

        const [deleted] = activities.splice(index, 1);
        await storage.saveActivities(activities);
        return kirimJSON(res, 200, {
          sukses: true,
          pesan: 'Kegiatan riset berhasil dihapus.',
          data: deleted
        });
      }

      return kirimError(res, 405, `Metode ${method} tidak diizinkan pada /v2/activities/:id.`);
    }
  }

  // Rute /v2/expenses
  if (parts[0] === 'v2' && parts[1] === 'expenses') {
    // GET /v2/expenses/summary
    if (parts.length === 3 && parts[2] === 'summary') {
      if (method !== 'GET') {
        return kirimError(res, 405, 'Endpoint /v2/expenses/summary hanya menerima metode GET.');
      }

      const [activities, expenses, ratesRes, untadWeather] = await Promise.all([
        storage.getActivities(),
        storage.getExpenses(),
        getPublicApis().getLiveRates(),
        getPublicApis().getWeatherForecast(-0.836, 119.893)
      ]);
      const rates = ratesRes?.rates || ratesRes;

      let totalSpentIDR = 0;
      const rekapPerKategori = {};
      for (const exp of expenses) {
        const conv = getPublicApis().konversiKeIDR(exp.amount, exp.currency, rates);
        const idr = conv.nominalIDR || 0;
        totalSpentIDR += idr;
        const cat = (exp.category || 'lainnya').toLowerCase();
        if (!rekapPerKategori[cat]) {
          rekapPerKategori[cat] = { totalIDR: 0, count: 0, formattedIDR: '' };
        }
        rekapPerKategori[cat].totalIDR += idr;
        rekapPerKategori[cat].count += 1;
      }
      for (const cat in rekapPerKategori) {
        rekapPerKategori[cat].formattedIDR =
          'Rp ' + rekapPerKategori[cat].totalIDR.toLocaleString('id-ID');
      }

      const rekapPerKegiatan = activities.map((act) => {
        const actExpenses = expenses.filter((e) => e.activityId === act.id);
        const fin = calculateFinancialSummary(act, actExpenses, rates);
        return {
          activityId: act.id,
          title: act.title,
          status: act.status,
          budgetLimitIDR: act.budgetLimitIDR,
          budgetLimitFormatted: fin.budgetLimitFormatted,
          totalSpentIDR: fin.totalSpentIDR,
          totalSpentFormatted: fin.totalExpensesFormatted,
          remainingBudgetIDR: fin.remainingBudgetIDR,
          remainingBudgetFormatted: fin.remainingBudgetFormatted,
          utilizationPercent: fin.utilizationPercent,
          budgetStatus: fin.budgetStatus,
          expenseCount: actExpenses.length
        };
      });

      const totalPlafonIDR = activities.reduce(
        (sum, a) => sum + (Number(a.budgetLimitIDR) || 0),
        0
      );
      const sisaAnggaranTotalIDR = totalPlafonIDR - totalSpentIDR;

      return kirimJSON(res, 200, {
        sukses: true,
        ringkasanUmum: {
          totalPengeluaranIDR: totalSpentIDR,
          totalPengeluaranFormatted: 'Rp ' + totalSpentIDR.toLocaleString('id-ID'),
          totalPlafonIDR,
          totalPlafonFormatted: 'Rp ' + totalPlafonIDR.toLocaleString('id-ID'),
          sisaAnggaranTotalIDR,
          sisaAnggaranTotalFormatted: 'Rp ' + sisaAnggaranTotalIDR.toLocaleString('id-ID'),
          totalKegiatan: activities.length,
          totalCatatanPengeluaran: expenses.length
        },
        rekapPerKategori,
        rekapPerKegiatan,
        sumberKurs: {
          provider: 'ExchangeRate-API',
          status: ratesRes?.status || 'ONLINE',
          sumber: ratesRes?.sumber || 'live_public_api',
          terakhirDiperbarui: ratesRes?.terakhirDiperbarui || new Date().toISOString()
        },
        cuacaAcuanUntad: {
          lokasi: 'Kampus Untad Tondo, Palu',
          koordinat: { latitude: -0.836, longitude: 119.893 },
          ...untadWeather
        }
      });
    }

    // GET & POST /v2/expenses
    if (parts.length === 2) {
      if (method === 'GET') {
        const [activities, expenses, ratesRes] = await Promise.all([
          storage.getActivities(),
          storage.getExpenses(),
          getPublicApis().getLiveRates()
        ]);
        const rates = ratesRes?.rates || ratesRes;

        let filtered = expenses;
        if (query?.activityId) {
          const actIdNum = Number(query.activityId);
          filtered = filtered.filter((e) => e.activityId === actIdNum);
        }
        if (query?.category) {
          filtered = filtered.filter(
            (e) => (e.category || '').toLowerCase() === query.category.toLowerCase()
          );
        }

        const data = filtered.map((exp) => {
          const act = activities.find((a) => a.id === exp.activityId) || null;
          return {
            ...exp,
            cost: buildCostObject(exp.amount, exp.currency, rates),
            activity: act ? { id: act.id, title: act.title, location: act.location } : null
          };
        });

        return kirimJSON(res, 200, {
          sukses: true,
          total: data.length,
          exchangeRateSource: ratesRes?.sumber || 'live_public_api',
          data
        });
      }

      if (method === 'POST') {
        const auth = getSecurity().requireAuth(req, ['admin', 'mahasiswa']);
        if (!auth.ok) return kirimError(res, auth.status, auth.error);

        const body = await bacaBody(req);
        const validationError = validasiExpenseV2(body, false);
        if (validationError) return kirimError(res, 400, validationError);

        const [activities, expenses] = await Promise.all([
          storage.getActivities(),
          storage.getExpenses()
        ]);
        const act = activities.find((a) => a.id === body.activityId);
        if (!act) {
          return kirimError(
            res,
            404,
            `Kegiatan riset dengan activityId ${body.activityId} tidak ditemukan.`
          );
        }

        const id = storage.nextId(expenses);
        const submittedBy = auth.user
          ? `${auth.user.fullName} (${auth.user.identifier || auth.user.username})`
          : 'Mahasiswa FT Untad';

        const newExpense = {
          id,
          activityId: body.activityId,
          title: body.title.trim(),
          category: body.category.toLowerCase(),
          amount: body.amount,
          currency: body.currency.toUpperCase(),
          date: body.date,
          notes: body.notes || '',
          submittedBy
        };

        expenses.push(newExpense);
        await storage.saveExpenses(expenses);
        return kirimJSON(res, 201, {
          sukses: true,
          pesan: 'Pengeluaran riset berhasil ditambahkan.',
          data: newExpense
        });
      }

      return kirimError(res, 405, `Metode ${method} tidak diizinkan pada /v2/expenses.`);
    }

    // GET, PUT, DELETE /v2/expenses/:id
    if (parts.length === 3 && parts[2] !== 'summary') {
      const id = Number(parts[2]);
      if (Number.isNaN(id) || !Number.isInteger(id)) {
        return kirimError(res, 400, 'ID pengeluaran harus berupa bilangan bulat valid.');
      }

      if (method === 'GET') {
        const [activities, expenses, ratesRes] = await Promise.all([
          storage.getActivities(),
          storage.getExpenses(),
          getPublicApis().getLiveRates()
        ]);
        const expense = expenses.find((e) => e.id === id);
        if (!expense) {
          return kirimError(res, 404, `Pengeluaran dengan ID ${id} tidak ditemukan.`);
        }

        const rates = ratesRes?.rates || ratesRes;
        const act = activities.find((a) => a.id === expense.activityId) || null;

        return kirimJSON(res, 200, {
          sukses: true,
          data: {
            ...expense,
            cost: buildCostObject(expense.amount, expense.currency, rates),
            activity: act ? { id: act.id, title: act.title, location: act.location } : null
          }
        });
      }

      if (method === 'PUT') {
        const auth = getSecurity().requireAuth(req, ['admin', 'mahasiswa']);
        if (!auth.ok) return kirimError(res, auth.status, auth.error);

        const expenses = await storage.getExpenses();
        const index = expenses.findIndex((e) => e.id === id);
        if (index === -1) {
          return kirimError(res, 404, `Pengeluaran dengan ID ${id} tidak ditemukan.`);
        }

        const body = await bacaBody(req);
        const validationError = validasiExpenseV2(body, true);
        if (validationError) return kirimError(res, 400, validationError);

        if (body.activityId !== undefined) {
          const activities = await storage.getActivities();
          const act = activities.find((a) => a.id === body.activityId);
          if (!act) {
            return kirimError(
              res,
              404,
              `Kegiatan riset dengan activityId ${body.activityId} tidak ditemukan.`
            );
          }
        }

        expenses[index] = {
          ...expenses[index],
          ...(body.activityId !== undefined ? { activityId: body.activityId } : {}),
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.category !== undefined ? { category: body.category.toLowerCase() } : {}),
          ...(body.amount !== undefined ? { amount: body.amount } : {}),
          ...(body.currency !== undefined ? { currency: body.currency.toUpperCase() } : {}),
          ...(body.date !== undefined ? { date: body.date } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {})
        };

        await storage.saveExpenses(expenses);
        return kirimJSON(res, 200, {
          sukses: true,
          pesan: 'Pengeluaran berhasil diperbarui.',
          data: expenses[index]
        });
      }

      if (method === 'DELETE') {
        const auth = getSecurity().requireAuth(req, ['admin']);
        if (!auth.ok) return kirimError(res, auth.status, auth.error);

        const expenses = await storage.getExpenses();
        const index = expenses.findIndex((e) => e.id === id);
        if (index === -1) {
          return kirimError(res, 404, `Pengeluaran dengan ID ${id} tidak ditemukan.`);
        }

        const [deleted] = expenses.splice(index, 1);
        await storage.saveExpenses(expenses);
        return kirimJSON(res, 200, {
          sukses: true,
          pesan: 'Pengeluaran berhasil dihapus.',
          data: deleted
        });
      }

      return kirimError(res, 405, `Metode ${method} tidak diizinkan pada /v2/expenses/:id.`);
    }
  }

  return kirimError(res, 404, `Endpoint ${method} ${pathname} tidak ditemukan pada REST v2.`);
}

module.exports = {
  handleV2Router
};
