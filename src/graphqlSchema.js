const { buildSchema, graphql } = require('graphql');
const storage = require('./storage');
const { validasiExpenseV2 } = require('./validators');
const { getPublicApis } = require('./moduleLoader');

const schema = buildSchema(`
  type Cost {
    originalAmount: Float!
    originalCurrency: String!
    convertedIDR: Float!
    exchangeRateIDR: Float!
    formattedIDR: String!
  }

  type Weather {
    temperature: Float
    temperatureFormatted: String
    windSpeed: Float
    windSpeedFormatted: String
    weatherCode: Int
    condition: String
    sumber: String
    status: String
  }

  type FinancialSummary {
    budgetLimitIDR: Float!
    totalSpentIDR: Float!
    remainingBudgetIDR: Float!
    utilizationPercent: Float!
    budgetStatus: String!
  }

  type Expense {
    id: Int!
    activityId: Int!
    title: String!
    category: String!
    amount: Float!
    currency: String!
    cost: Cost!
    date: String!
    notes: String
    submittedBy: String
    activity: Activity
  }

  type Activity {
    id: Int!
    title: String!
    location: String!
    latitude: Float
    longitude: Float
    unit: String
    leadResearcher: String
    budgetLimitIDR: Float!
    startDate: String
    endDate: String
    status: String!
    description: String
    financialSummary: FinancialSummary!
    currentWeather: Weather
    expenses: [Expense!]!
  }

  input CreateExpenseInput {
    activityId: Int!
    title: String!
    category: String!
    amount: Float!
    currency: String!
    date: String!
    notes: String
  }

  type Query {
    activities(status: String): [Activity!]!
    activity(id: Int!): Activity
    expenses(activityId: Int, category: String): [Expense!]!
    expense(id: Int!): Expense
  }

  type Mutation {
    createExpense(input: CreateExpenseInput!): Expense!
    deleteExpense(id: Int!): Expense!
  }
`);

function formatCost(amount, currency, rates) {
  const conv = getPublicApis().konversiKeIDR(amount, currency, rates);
  return {
    originalAmount: amount,
    originalCurrency: currency,
    convertedIDR: conv.nominalIDR,
    exchangeRateIDR: conv.kursPerSatuanIDR,
    formattedIDR: conv.formatRupiah
  };
}

function formatActivity(act, allActivities, allExpenses, rates) {
  const actExpenses = allExpenses.filter((e) => e.activityId === act.id);
  const totalSpentIDR = actExpenses.reduce(
    (sum, e) => sum + getPublicApis().konversiKeIDR(e.amount, e.currency, rates).nominalIDR,
    0
  );
  const remainingBudgetIDR = act.budgetLimitIDR - totalSpentIDR;
  const utilizationPercent =
    act.budgetLimitIDR > 0 ? Number(((totalSpentIDR / act.budgetLimitIDR) * 100).toFixed(2)) : 0;
  const budgetStatus =
    totalSpentIDR > act.budgetLimitIDR ? 'MELEBIHI_BATAS' : utilizationPercent >= 80 ? 'WASPADA' : 'AMAN';

  return {
    ...act,
    status: act.status || 'ACTIVE',
    financialSummary: {
      budgetLimitIDR: act.budgetLimitIDR,
      totalSpentIDR,
      remainingBudgetIDR,
      utilizationPercent,
      budgetStatus
    },
    currentWeather: () =>
      getPublicApis().getWeatherForecast(act.latitude ?? -0.836, act.longitude ?? 119.893),
    expenses: () => actExpenses.map((e) => formatExpense(e, allActivities, allExpenses, rates))
  };
}

function formatExpense(exp, allActivities, allExpenses, rates) {
  const parent = allActivities.find((a) => a.id === exp.activityId) || null;
  return {
    ...exp,
    notes: exp.notes || '',
    submittedBy: exp.submittedBy || '-',
    cost: formatCost(exp.amount, exp.currency, rates),
    activity: () => (parent ? formatActivity(parent, allActivities, allExpenses, rates) : null)
  };
}

async function loadDataset() {
  const [activities, expenses, rateInfo] = await Promise.all([
    storage.getActivities(),
    storage.getExpenses(),
    getPublicApis().getLiveRates()
  ]);
  return { activities, expenses, rates: rateInfo.rates };
}

const rootValue = {
  async activities({ status }) {
    const { activities, expenses, rates } = await loadDataset();
    const list = status
      ? activities.filter((a) => String(a.status).toUpperCase() === status.toUpperCase())
      : activities;
    return list.map((a) => formatActivity(a, activities, expenses, rates));
  },

  async activity({ id }) {
    const { activities, expenses, rates } = await loadDataset();
    const found = activities.find((a) => a.id === id);
    return found ? formatActivity(found, activities, expenses, rates) : null;
  },

  async expenses({ activityId, category }) {
    const { activities, expenses, rates } = await loadDataset();
    let list = expenses;
    if (activityId !== undefined && activityId !== null) {
      list = list.filter((e) => e.activityId === activityId);
    }
    if (category) {
      list = list.filter((e) => e.category.toLowerCase() === category.toLowerCase());
    }
    return list.map((e) => formatExpense(e, activities, expenses, rates));
  },

  async expense({ id }) {
    const { activities, expenses, rates } = await loadDataset();
    const found = expenses.find((e) => e.id === id);
    return found ? formatExpense(found, activities, expenses, rates) : null;
  },

  async createExpense({ input }, context) {
    if (!context || !context.user) {
      throw new Error('401: Token autentikasi Bearer wajib disertakan untuk membuat pengeluaran.');
    }

    const validationErr = validasiExpenseV2(input, false);
    if (validationErr) {
      throw new Error(`400: ${validationErr}`);
    }

    const [activities, expenses, rateInfo] = await Promise.all([
      storage.getActivities(),
      storage.getExpenses(),
      getPublicApis().getLiveRates()
    ]);

    if (!activities.some((a) => a.id === input.activityId)) {
      throw new Error(`404: Kegiatan riset dengan activityId ${input.activityId} tidak ditemukan.`);
    }

    const newExpense = {
      id: storage.nextId(expenses),
      activityId: input.activityId,
      title: input.title.trim(),
      category: input.category.toLowerCase().trim(),
      amount: Number(input.amount),
      currency: input.currency.toUpperCase().trim(),
      date: input.date,
      notes: input.notes ? input.notes.trim() : '',
      submittedBy: `${context.user.fullName} (${context.user.identifier || context.user.username})`
    };

    expenses.push(newExpense);
    await storage.saveExpenses(expenses);
    return formatExpense(newExpense, activities, expenses, rateInfo.rates);
  },

  async deleteExpense({ id }, context) {
    if (!context || !context.user) {
      throw new Error('401: Token autentikasi Bearer wajib disertakan untuk menghapus pengeluaran.');
    }
    if (context.user.role !== 'admin') {
      throw new Error('403: Akses ditolak. Hanya role admin yang boleh menghapus pengeluaran.');
    }

    const [activities, expenses, rateInfo] = await Promise.all([
      storage.getActivities(),
      storage.getExpenses(),
      getPublicApis().getLiveRates()
    ]);

    const idx = expenses.findIndex((e) => e.id === id);
    if (idx === -1) {
      throw new Error(`404: Pengeluaran dengan id ${id} tidak ditemukan.`);
    }

    const [removed] = expenses.splice(idx, 1);
    await storage.saveExpenses(expenses);
    return formatExpense(removed, activities, expenses, rateInfo.rates);
  }
};

async function executeGraphQL(query, variables = null, contextValue = {}) {
  return graphql({
    schema,
    source: query,
    rootValue,
    contextValue,
    variableValues: variables
  });
}

module.exports = {
  schema,
  executeGraphQL
};
