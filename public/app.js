(() => {
  const STORAGE_KEY = 'untad_api_session_v2';

  const VIEW_TITLES = {
    overview: 'Dashboard Overview',
    activities: 'Kegiatan Riset Lapangan',
    expenses: 'Catatan Pengeluaran',
    explorer: 'GraphQL & Audit Versioning',
    security: 'Keamanan & Hak Akses (RBAC)'
  };

  const GQL_PRESETS = {
    activities: {
      query: `query {
  activities {
    id
    title
    location
    status
    financialSummary { budgetLimitIDR totalSpentIDR budgetStatus }
    currentWeather { temperatureFormatted condition status }
    expenses { id title cost { formattedIDR } }
  }
}`,
      variables: '{}'
    },
    expenses: {
      query: `query($activityId: Int) {
  expenses(activityId: $activityId) {
    id
    title
    category
    cost { originalAmount originalCurrency formattedIDR }
    activity { id title location }
  }
}`,
      variables: '{"activityId": 2}'
    },
    delete: {
      query: `mutation($id: Int!) {
  deleteExpense(id: $id) {
    id
    title
  }
}`,
      variables: '{"id": 999}'
    }
  };

  const RBAC_MATRIX = {
    admin: [
      {
        group: 'Activities (/v2/activities)',
        items: [
          ['GET daftar & detail', true],
          ['POST tambah kegiatan', true],
          ['PUT ubah kegiatan', true],
          ['DELETE hapus kegiatan', true]
        ]
      },
      {
        group: 'Expenses (/v2/expenses)',
        items: [
          ['GET daftar & summary', true],
          ['POST catat pengeluaran', true],
          ['PUT revisi pengeluaran', true],
          ['DELETE hapus pengeluaran', true]
        ]
      },
      {
        group: 'GraphQL (POST /graphql)',
        items: [
          ['Query activities & expenses', true],
          ['Mutation createExpense', true],
          ['Mutation deleteExpense', true]
        ]
      },
      {
        group: 'Keamanan & Legacy /v1',
        items: [
          ['Header x-api-key wajib', true],
          ['Token HMAC-SHA256 2 jam', true],
          ['GET /v1/expenses (Sunset)', true]
        ]
      }
    ],
    mahasiswa: [
      {
        group: 'Activities (/v2/activities)',
        items: [
          ['GET daftar & detail', true],
          ['POST tambah kegiatan (403)', false],
          ['PUT ubah kegiatan (403)', false],
          ['DELETE hapus kegiatan (403)', false]
        ]
      },
      {
        group: 'Expenses (/v2/expenses)',
        items: [
          ['GET daftar & summary', true],
          ['POST catat pengeluaran', true],
          ['PUT revisi pengeluaran', true],
          ['DELETE hapus pengeluaran (403)', false]
        ]
      },
      {
        group: 'GraphQL (POST /graphql)',
        items: [
          ['Query activities & expenses', true],
          ['Mutation createExpense', true],
          ['Mutation deleteExpense (403)', false]
        ]
      },
      {
        group: 'Keamanan & Legacy /v1',
        items: [
          ['Header x-api-key wajib', true],
          ['Token HMAC-SHA256 2 jam', true],
          ['GET /v1/expenses (Sunset)', true]
        ]
      }
    ]
  };

  const state = {
    token: null,
    user: null,
    activities: [],
    expenses: [],
    summary: null,
    actStatusFilter: '',
    feedCategory: '',
    fulfillScope: 'ALL',
    inspectedRole: 'admin'
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, tone = 'ok') {
    const el = $('toast');
    el.textContent = message;
    el.className = `toast toast-${tone}`;
  }

  function getApiKey() {
    return $('apiKeyInput').value.trim();
  }

  function buildHeaders(includeAuth = false) {
    const headers = { 'Content-Type': 'application/json' };
    const apiKey = getApiKey();
    if (apiKey) headers['x-api-key'] = apiKey;
    if (includeAuth && state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    return headers;
  }

  async function apiRequest(url, options = {}) {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: buildHeaders(Boolean(options.auth)),
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, headers: res.headers, data };
  }

  function switchView(viewName) {
    if (!VIEW_TITLES[viewName]) return;
    $('viewTitle').textContent = VIEW_TITLES[viewName];

    document.querySelectorAll('.rail-btn[data-view]').forEach((btn) => {
      const active = btn.dataset.view === viewName;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    document.querySelectorAll('.view-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });
  }

  function saveSession() {
    if (state.token && state.user) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, user: state.user }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  function restoreSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.token && saved.user) {
        state.token = saved.token;
        state.user = saved.user;
      }
    } catch (err) {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  function renderSession() {
    const badge = $('sessionBadge');
    const railAvatar = $('railAvatar');
    const logoutBtn = $('btnLogout');
    const secLogout = $('btnSecurityLogout');

    if (state.user && state.token) {
      const role = state.user.role === 'admin' ? 'admin' : 'mahasiswa';
      badge.className = `session-pill session-${role}`;
      badge.textContent = `${state.user.username} (${role})`;
      railAvatar.className = `rail-avatar ${role}`;
      railAvatar.textContent = state.user.username.slice(0, 2).toUpperCase();
      railAvatar.title = `${state.user.fullName} (${role})`;
      logoutBtn.classList.remove('hidden');
      secLogout.classList.remove('hidden');
      renderRbacMatrix(role);
    } else {
      badge.className = 'session-pill session-guest';
      badge.textContent = 'Belum Login';
      railAvatar.className = 'rail-avatar guest';
      railAvatar.textContent = 'G';
      railAvatar.title = 'Belum Login';
      logoutBtn.classList.add('hidden');
      secLogout.classList.add('hidden');
    }
  }

  function renderCategoryChart(rekapPerKategori = {}) {
    const container = $('categoryChart');
    const entries = Object.entries(rekapPerKategori);
    if (!entries.length) {
      container.innerHTML = '<span class="card-sub">Belum ada data kategori.</span>';
      return;
    }

    const maxVal = Math.max(...entries.map(([, v]) => Number(v.totalIDR) || 0), 1);
    $('kpiCatCount').textContent = `${entries.length} Kat`;

    container.innerHTML = entries
      .map(([cat, info]) => {
        const val = Number(info.totalIDR) || 0;
        const heightPct = Math.max(12, Math.round((val / maxVal) * 100));
        return `
          <div class="bar-col" title="${escapeHtml(cat)}: ${escapeHtml(info.formattedIDR || '')} (${escapeHtml(info.count)} item)">
            <div class="bar-stick" style="height:${heightPct}%"></div>
            <span class="bar-lbl">${escapeHtml(cat.slice(0, 4))}</span>
          </div>
        `;
      })
      .join('');
  }

  function renderFulfillmentCard() {
    const acts =
      state.fulfillScope === 'ACTIVE'
        ? state.activities.filter((a) => String(a.status).toUpperCase() === 'ACTIVE')
        : state.activities;

    const totalPlafon = acts.reduce((s, a) => s + (Number(a.budgetLimitIDR) || 0), 0);
    const totalSpent = acts.reduce((s, a) => s + (Number(a.financialSummary?.totalSpentIDR) || 0), 0);
    const totalTx = acts.reduce((s, a) => s + (Number(a.expenseCount) || 0), 0);
    const pct = totalPlafon > 0 ? Number(((totalSpent / totalPlafon) * 100).toFixed(1)) : 0;

    $('fulfillActivities').textContent = String(acts.length);
    $('fulfillExpenses').textContent = String(totalTx);
    $('fulfillPct').textContent = `${pct}%`;

    const totalTicks = 32;
    const filledTicks = Math.min(totalTicks, Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * totalTicks)));
    const barHtml = Array.from({ length: totalTicks }, (_, idx) => {
      if (idx < filledTicks) {
        return `<span class="tick ${idx >= totalTicks - 6 ? 'filled-hi' : 'filled'}"></span>`;
      }
      return '<span class="tick"></span>';
    }).join('');
    $('barcodeBar').innerHTML = barHtml;

    const statusText = pct > 100 ? 'MELEBIHI BATAS' : pct >= 80 ? 'WASPADA' : 'AMAN';
    $('fulfillBudgetLabel').textContent = `Status: ${statusText} (Rp ${totalSpent.toLocaleString('id-ID')})`;
  }

  async function loadSummary() {
    const res = await apiRequest('/v2/expenses/summary');
    if (!res.ok || !res.data) {
      $('kpiSpent').textContent = `Error ${res.status}`;
      $('kpiPlafon').textContent = res.data?.error || 'Periksa x-api-key.';
      return;
    }

    state.summary = res.data;
    const r = res.data.ringkasanUmum || {};
    const w = res.data.cuacaAcuanUntad || {};
    const k = res.data.sumberKurs || {};

    const spent = Number(r.totalPengeluaranIDR) || 0;
    const plafon = Number(r.totalPlafonIDR) || 0;
    const pct = plafon > 0 ? Number(((spent / plafon) * 100).toFixed(1)) : 0;

    $('kpiSpent').textContent = r.totalPengeluaranFormatted || 'Rp 0';
    $('kpiPlafon').textContent = `Plafon: ${r.totalPlafonFormatted || 'Rp 0'}`;
    $('kpiRemaining').textContent = r.sisaAnggaranTotalFormatted || 'Rp 0';
    $('kpiUtilBadge').textContent = `${pct}%`;
    $('kpiProgressFill').style.width = `${Math.min(100, pct)}%`;

    const temp = w.temperatureFormatted || (w.temperature !== undefined ? `${w.temperature}°C` : '—');
    $('kpiWeather').textContent = `${temp} · ${w.condition || '—'}`;
    $('kpiWeatherMeta').textContent = `${w.lokasi || 'Kampus Untad Tondo, Palu'} (${w.status || w.sumber || '—'})`;
    $('kpiRateStatus').textContent = k.status || 'ONLINE';
    $('kpiRateSource').textContent = `${k.provider || 'ExchangeRate-API'} (${k.sumber || '—'})`;

    renderCategoryChart(res.data.rekapPerKategori);
  }

  function renderRailActivities() {
    const wrap = $('railActivities');
    if (!state.activities.length) {
      wrap.innerHTML = '<div class="card-sub">Belum ada kegiatan riset.</div>';
      return;
    }

    wrap.innerHTML = state.activities
      .slice(0, 3)
      .map((act) => {
        const fin = act.financialSummary || {};
        const w = act.currentWeather || {};
        const temp = w.temperatureFormatted || (w.temperature !== undefined ? `${w.temperature}°C` : '—');
        const bStatus = fin.budgetStatus || 'AMAN';
        const pillCls = bStatus === 'MELEBIHI_BATAS' ? 'pill-coral' : bStatus === 'WASPADA' ? 'pill-amber' : 'pill-emerald';
        return `
          <div class="rail-act-tile" data-jump-view="activities">
            <div class="rail-act-top">
              <strong>${escapeHtml(act.title)}</strong>
              <span class="pill ${pillCls}">${escapeHtml(bStatus)}</span>
            </div>
            <div class="rail-act-meta">
              <span>${escapeHtml(act.location)}</span>
              <span>${escapeHtml(temp)} &middot; ${escapeHtml(fin.utilizationPercent ?? 0)}%</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderActivitiesView() {
    const wrap = $('activitiesList');
    const q = ($('searchActivity')?.value || '').trim().toLowerCase();
    const list = state.activities.filter((act) => {
      if (state.actStatusFilter && String(act.status).toUpperCase() !== state.actStatusFilter) return false;
      if (q && !`${act.title} ${act.location} ${act.leadResearcher}`.toLowerCase().includes(q)) return false;
      return true;
    });

    if (!list.length) {
      wrap.innerHTML = '<div class="card card-sub">Tidak ada kegiatan riset yang cocok dengan filter.</div>';
      return;
    }

    wrap.innerHTML = list
      .map((act) => {
        const fin = act.financialSummary || {};
        const pct = Math.min(100, Math.max(0, Number(fin.utilizationPercent) || 0));
        const bStatus = fin.budgetStatus || 'AMAN';
        const pillCls = bStatus === 'MELEBIHI_BATAS' ? 'pill-coral' : bStatus === 'WASPADA' ? 'pill-amber' : 'pill-emerald';
        const fillCls = bStatus === 'MELEBIHI_BATAS' ? 'danger' : bStatus === 'WASPADA' ? 'warn' : '';
        const w = act.currentWeather || {};
        const temp = w.temperatureFormatted || (w.temperature !== undefined ? `${w.temperature}°C` : '—');

        return `
          <article class="card activity-card">
            <div class="card-top" style="margin-bottom:0">
              <div>
                <h3>#${escapeHtml(act.id)} ${escapeHtml(act.title)}</h3>
                <div class="meta-line">${escapeHtml(act.location)} &middot; ${escapeHtml(act.unit || 'FT Untad')}</div>
              </div>
              <span class="pill ${pillCls}">${escapeHtml(bStatus)}</span>
            </div>
            <div class="meta-line">Ketua: <strong>${escapeHtml(act.leadResearcher || '-')}</strong> &middot; <span class="pill pill-soft">${escapeHtml(act.status || 'ACTIVE')}</span></div>
            <div>
              <div class="meta-line" style="display:flex;justify-content:space-between;margin-bottom:5px;">
                <span>${escapeHtml(fin.totalExpensesFormatted || 'Rp ' + (fin.totalSpentIDR || 0).toLocaleString('id-ID'))}</span>
                <strong>${escapeHtml(fin.utilizationPercent ?? 0)}% / ${escapeHtml(fin.budgetLimitFormatted || 'Rp ' + (act.budgetLimitIDR || 0).toLocaleString('id-ID'))}</strong>
              </div>
              <div class="progress-track"><div class="progress-fill ${fillCls}" style="width:${pct}%"></div></div>
            </div>
            <div class="weather-strip">
              <span>Cuaca: <strong>${escapeHtml(temp)}</strong> (${escapeHtml(w.condition || '—')})</span>
              <span class="pill pill-indigo">${escapeHtml(act.expenseCount ?? 0)} transaksi</span>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function populateActivitySelects(allActivities) {
    const filterSelect = $('filterExpenseActivity');
    const modalSelect = $('expenseActivitySelect');
    const prevFilter = filterSelect.value;

    const options = allActivities
      .map((a) => `<option value="${escapeHtml(a.id)}">#${escapeHtml(a.id)} — ${escapeHtml(a.title)}</option>`)
      .join('');

    filterSelect.innerHTML = `<option value="">Semua Kegiatan</option>${options}`;
    filterSelect.value = prevFilter;
    modalSelect.innerHTML = options || '<option value="">Belum ada kegiatan</option>';
  }

  async function loadActivities() {
    const res = await apiRequest('/v2/activities');
    if (!res.ok) {
      $('activitiesList').innerHTML = `<div class="card toast-err">Error ${res.status}: ${escapeHtml(res.data?.error || 'Gagal memuat kegiatan.')}</div>`;
      return;
    }
    state.activities = res.data.data || [];
    populateActivitySelects(state.activities);
    renderActivitiesView();
    renderRailActivities();
    renderFulfillmentCard();
  }

  function renderRailFeed() {
    const wrap = $('railFeed');
    const items = state.expenses
      .filter((e) => !state.feedCategory || String(e.category).toLowerCase() === state.feedCategory)
      .slice(-5)
      .reverse();

    if (!items.length) {
      wrap.innerHTML = '<div class="card-sub">Tidak ada transaksi pada kategori ini.</div>';
      return;
    }

    wrap.innerHTML = items
      .map((exp) => `
        <div class="feed-item">
          <div class="feed-left">
            <span class="feed-icon">${escapeHtml((exp.category || 'TX').slice(0, 2))}</span>
            <div class="feed-text">
              <strong>${escapeHtml(exp.title)}</strong>
              <small>${escapeHtml(exp.date)} &middot; ${escapeHtml(exp.submittedBy || '-')}</small>
            </div>
          </div>
          <span class="feed-amount">${escapeHtml(exp.cost?.formattedIDR || '—')}</span>
        </div>
      `)
      .join('');
  }

  function renderExpensesTable() {
    const tbody = $('expensesTableBody');
    const q = ($('searchExpense')?.value || '').trim().toLowerCase();
    const actId = $('filterExpenseActivity').value;
    const cat = $('filterExpenseCategory').value;

    const filtered = state.expenses.filter((exp) => {
      if (actId && String(exp.activityId) !== String(actId)) return false;
      if (cat && String(exp.category).toLowerCase() !== cat.toLowerCase()) return false;
      if (q && !`${exp.title} ${exp.notes} ${exp.submittedBy}`.toLowerCase().includes(q)) return false;
      return true;
    });

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="card-sub">Tidak ada pengeluaran yang cocok dengan filter.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered
      .map((exp) => `
        <tr>
          <td class="num">${escapeHtml(exp.date)}</td>
          <td>
            <strong>#${escapeHtml(exp.id)} ${escapeHtml(exp.title)}</strong>
            <div class="meta-line">${escapeHtml(exp.activity?.title || `Activity #${exp.activityId}`)}</div>
            ${exp.notes ? `<div class="meta-line">${escapeHtml(exp.notes)}</div>` : ''}
          </td>
          <td><span class="pill pill-indigo">${escapeHtml(exp.category)}</span></td>
          <td class="num">${escapeHtml(Number(exp.amount).toLocaleString('id-ID'))} ${escapeHtml(exp.currency)}</td>
          <td class="num"><strong>${escapeHtml(exp.cost?.formattedIDR || '—')}</strong></td>
          <td>${escapeHtml(exp.submittedBy || '-')}</td>
          <td>
            <button class="btn btn-danger" type="button" data-delete-expense="${escapeHtml(exp.id)}">Hapus</button>
          </td>
        </tr>
      `)
      .join('');
  }

  async function loadExpenses() {
    const res = await apiRequest('/v2/expenses');
    if (!res.ok) {
      $('expensesTableBody').innerHTML = `<tr><td colspan="7" class="toast-err">Error ${res.status}: ${escapeHtml(res.data?.error || 'Gagal memuat pengeluaran.')}</td></tr>`;
      return;
    }
    state.expenses = res.data.data || [];
    renderExpensesTable();
    renderRailFeed();
  }

  function renderRbacMatrix(role) {
    state.inspectedRole = role;
    $('rbacMatrixTitle').textContent = `Matriks Izin — Role ${role === 'admin' ? 'Admin' : 'Mahasiswa'}`;
    $('rbacRolePill').textContent = role;

    document.querySelectorAll('.role-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.inspectRole === role);
    });

    const groups = RBAC_MATRIX[role] || RBAC_MATRIX.admin;
    $('rbacMatrixGrid').innerHTML = groups
      .map(
        (g) => `
        <div class="perm-card">
          <h4>${escapeHtml(g.group)}</h4>
          ${g.items
            .map(
              ([label, allowed]) => `
            <div class="perm-row">
              <span>${escapeHtml(label)}</span>
              <span class="switch ${allowed ? 'on' : ''}" aria-label="${allowed ? 'Diizinkan' : 'Ditolak'}"></span>
            </div>
          `
            )
            .join('')}
        </div>
      `
      )
      .join('');
  }

  async function refreshAll() {
    await Promise.all([loadSummary(), loadActivities(), loadExpenses()]);
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = $('loginUsername').value.trim();
    const password = $('loginPassword').value;

    const res = await apiRequest('/v2/auth/login', {
      method: 'POST',
      body: { username, password }
    });

    if (!res.ok) {
      showToast(`Login gagal (${res.status}): ${res.data?.error || 'Kredensial tidak valid.'}`, 'err');
      return;
    }

    state.token = res.data.token;
    state.user = res.data.user;
    saveSession();
    renderSession();
    showToast(`Login berhasil sebagai ${state.user.fullName} (role: ${state.user.role}).`, 'ok');
    await refreshAll();
  }

  async function handleLogout() {
    if (state.token) {
      await apiRequest('/v2/auth/logout', { method: 'POST', auth: true }).catch(() => {});
    }
    state.token = null;
    state.user = null;
    saveSession();
    renderSession();
    showToast('Logout berhasil. Token sesi telah dicabut.', 'warn');
  }

  async function handleCreateActivity(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      title: String(fd.get('title') || '').trim(),
      location: String(fd.get('location') || '').trim(),
      budgetLimitIDR: Number(fd.get('budgetLimitIDR')),
      status: String(fd.get('status') || 'ACTIVE'),
      unit: String(fd.get('unit') || '').trim() || undefined,
      leadResearcher: String(fd.get('leadResearcher') || '').trim() || undefined,
      description: String(fd.get('description') || '').trim() || undefined
    };

    const res = await apiRequest('/v2/activities', { method: 'POST', auth: true, body: payload });
    if (!res.ok) {
      const tone = res.status === 403 ? 'warn' : 'err';
      const msg = `Gagal menambah kegiatan (${res.status}): ${res.data?.error || 'Akses ditolak.'}`;
      $('activityModalErr').textContent = msg;
      $('activityModalErr').className = `toast toast-${tone}`;
      showToast(msg, tone);
      return;
    }

    $('activityModalErr').classList.add('hidden');
    $('activityDialog').close();
    e.target.reset();
    showToast(`Kegiatan #${res.data.data.id} berhasil ditambahkan.`, 'ok');
    await refreshAll();
  }

  async function handleCreateExpense(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      activityId: Number(fd.get('activityId')),
      title: String(fd.get('title') || '').trim(),
      category: String(fd.get('category') || 'lainnya'),
      amount: Number(fd.get('amount')),
      currency: String(fd.get('currency') || 'IDR'),
      date: String(fd.get('date') || ''),
      notes: String(fd.get('notes') || '').trim()
    };

    const res = await apiRequest('/v2/expenses', { method: 'POST', auth: true, body: payload });
    if (!res.ok) {
      const msg = `Gagal menambah pengeluaran (${res.status}): ${res.data?.error || 'Periksa input / login.'}`;
      $('expenseModalErr').textContent = msg;
      $('expenseModalErr').className = 'toast toast-err';
      showToast(msg, 'err');
      return;
    }

    $('expenseModalErr').classList.add('hidden');
    $('expenseDialog').close();
    e.target.reset();
    showToast(`Pengeluaran #${res.data.data.id} disimpan (${res.data.data.cost?.formattedIDR || ''}).`, 'ok');
    await refreshAll();
  }

  async function handleDeleteExpense(id) {
    const res = await apiRequest(`/v2/expenses/${id}`, { method: 'DELETE', auth: true });
    if (!res.ok) {
      const tone = res.status === 403 ? 'warn' : 'err';
      const hint =
        res.status === 403
          ? 'RBAC aktif (403 Forbidden): hanya role admin yang boleh menghapus pengeluaran.'
          : res.data?.error || 'Gagal menghapus pengeluaran.';
      showToast(`${hint} (HTTP ${res.status})`, tone);
      return;
    }
    showToast(`Pengeluaran #${id} berhasil dihapus.`, 'ok');
    await refreshAll();
  }

  async function handleRunGraphQL() {
    const query = $('gqlQuery').value.trim();
    const rawVars = $('gqlVars').value.trim();
    let variables = null;
    if (rawVars) {
      try {
        variables = JSON.parse(rawVars);
      } catch (err) {
        showToast('Variables GraphQL bukan JSON yang valid.', 'err');
        return;
      }
    }

    const res = await apiRequest('/graphql', {
      method: 'POST',
      auth: true,
      body: { query, variables }
    });

    const badge = $('gqlStatusBadge');
    badge.textContent = `HTTP ${res.status}`;
    badge.className = `pill ${res.ok ? 'pill-emerald' : res.status === 403 ? 'pill-amber' : 'pill-coral'}`;
    $('gqlOutput').textContent = JSON.stringify(res.data, null, 2);
  }

  async function handleRunVersionAudit() {
    const [v1Res, v2Res] = await Promise.all([
      apiRequest('/v1/expenses'),
      apiRequest('/v2/expenses')
    ]);

    $('auditV1Status').textContent = v1Res.status === 501 ? '501 (Menunggu Issue #3)' : `HTTP ${v1Res.status}`;
    $('auditSunset').textContent = v1Res.headers.get('Sunset') || '(belum ada)';
    $('auditDeprecation').textContent = v1Res.headers.get('Deprecation') || '(belum ada)';
    $('auditLink').textContent = v1Res.headers.get('Link') || '(belum ada)';

    const v1Sample = Array.isArray(v1Res.data?.data) ? { ...v1Res.data, data: v1Res.data.data.slice(0, 2) } : v1Res.data;
    const v2Sample = Array.isArray(v2Res.data?.data) ? { ...v2Res.data, data: v2Res.data.data.slice(0, 2) } : v2Res.data;

    $('auditV1Body').textContent = JSON.stringify(v1Sample, null, 2);
    $('auditV2Body').textContent = JSON.stringify(v2Sample, null, 2);
    showToast(`Audit selesai: /v1 -> HTTP ${v1Res.status}, /v2 -> HTTP ${v2Res.status}.`, v1Res.ok ? 'ok' : 'warn');
  }

  function wireEvents() {
    document.querySelectorAll('.rail-btn[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    document.body.addEventListener('click', (e) => {
      const jumper = e.target.closest('[data-jump-view]');
      if (jumper) switchView(jumper.dataset.jumpView);
    });

    $('railRefreshBtn').addEventListener('click', async () => {
      await refreshAll();
      showToast('Data dashboard diperbarui dari API.', 'ok');
    });

    $('btnHeroAddExpense').addEventListener('click', () => {
      $('expenseModalErr').classList.add('hidden');
      $('expenseDialog').showModal();
    });

    $('btnQuickAudit').addEventListener('click', async () => {
      switchView('explorer');
      await handleRunVersionAudit();
    });

    document.querySelectorAll('[data-fulfill-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.fulfillScope = btn.dataset.fulfillScope;
        document.querySelectorAll('[data-fulfill-scope]').forEach((b) => b.classList.toggle('active', b === btn));
        renderFulfillmentCard();
      });
    });

    document.querySelectorAll('[data-feed-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.feedCategory = btn.dataset.feedCat;
        document.querySelectorAll('[data-feed-cat]').forEach((b) => b.classList.toggle('active', b === btn));
        renderRailFeed();
      });
    });

    document.querySelectorAll('[data-act-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.actStatusFilter = btn.dataset.actStatus;
        document.querySelectorAll('[data-act-status]').forEach((b) => b.classList.toggle('active', b === btn));
        renderActivitiesView();
      });
    });

    $('searchActivity').addEventListener('input', renderActivitiesView);
    $('filterExpenseActivity').addEventListener('change', renderExpensesTable);
    $('filterExpenseCategory').addEventListener('change', renderExpensesTable);
    $('searchExpense').addEventListener('input', renderExpensesTable);

    $('btnOpenActivityModal').addEventListener('click', () => {
      $('activityModalErr').classList.add('hidden');
      $('activityDialog').showModal();
    });
    $('btnOpenExpenseModal').addEventListener('click', () => {
      $('expenseModalErr').classList.add('hidden');
      $('expenseDialog').showModal();
    });
    document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
      btn.addEventListener('click', () => $(btn.dataset.closeDialog).close());
    });

    $('activityForm').addEventListener('submit', handleCreateActivity);
    $('expenseForm').addEventListener('submit', handleCreateExpense);

    $('expensesTableBody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete-expense]');
      if (btn) handleDeleteExpense(Number(btn.dataset.deleteExpense));
    });

    document.querySelectorAll('[data-gql-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = GQL_PRESETS[btn.dataset.gqlPreset];
        if (preset) {
          document.querySelectorAll('[data-gql-preset]').forEach((b) => b.classList.toggle('active', b === btn));
          $('gqlQuery').value = preset.query;
          $('gqlVars').value = preset.variables;
        }
      });
    });

    $('btnRunGraphQL').addEventListener('click', handleRunGraphQL);
    $('btnRunVersionAudit').addEventListener('click', handleRunVersionAudit);

    $('btnFillAdmin').addEventListener('click', () => {
      $('loginUsername').value = 'admin';
      $('loginPassword').value = 'admin123';
    });
    $('btnFillMhs').addEventListener('click', () => {
      $('loginUsername').value = 'mahasiswa';
      $('loginPassword').value = 'mhs123';
    });

    $('loginForm').addEventListener('submit', handleLogin);
    $('btnLogout').addEventListener('click', handleLogout);
    $('btnSecurityLogout').addEventListener('click', handleLogout);

    document.querySelectorAll('.role-card').forEach((card) => {
      card.addEventListener('click', () => renderRbacMatrix(card.dataset.inspectRole));
    });

    $('apiKeyInput').addEventListener('change', async () => {
      const val = getApiKey();
      if (val) sessionStorage.setItem('untad_api_key_v2', val);
      else sessionStorage.removeItem('untad_api_key_v2');
      await refreshAll();
    });
  }

  // Bootstrap
  const savedApiKey = sessionStorage.getItem('untad_api_key_v2');
  if (savedApiKey) $('apiKeyInput').value = savedApiKey;
  restoreSession();
  renderSession();
  renderRbacMatrix(state.user?.role === 'mahasiswa' ? 'mahasiswa' : 'admin');
  wireEvents();
  $('gqlQuery').value = GQL_PRESETS.activities.query;
  $('gqlVars').value = GQL_PRESETS.activities.variables;
  refreshAll();
})();
