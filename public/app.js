(() => {
  const STORAGE_KEY = 'untad_api_session_v2';

  const state = {
    token: null,
    user: null,
    activities: [],
    expenses: []
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
    const logoutBtn = $('btnLogout');
    if (state.user && state.token) {
      const roleClass = state.user.role === 'admin' ? 'session-admin' : 'session-mahasiswa';
      badge.className = `session-badge ${roleClass}`;
      badge.textContent = `${state.user.username} (${state.user.role})`;
      logoutBtn.classList.remove('hidden');
    } else {
      badge.className = 'session-badge session-guest';
      badge.textContent = 'Belum Login';
      logoutBtn.classList.add('hidden');
    }
  }

  async function loadSummary() {
    const res = await apiRequest('/v2/expenses/summary');
    if (!res.ok || !res.data) {
      $('kpiSpent').textContent = `Error ${res.status}`;
      $('kpiPlafon').textContent = res.data?.error || 'Gagal memuat ringkasan.';
      return;
    }

    const r = res.data.ringkasanUmum || {};
    const w = res.data.cuacaAcuanUntad || {};
    const k = res.data.sumberKurs || {};

    $('kpiSpent').textContent = r.totalPengeluaranFormatted || 'Rp 0';
    $('kpiPlafon').textContent = `Plafon: ${r.totalPlafonFormatted || 'Rp 0'}`;
    $('kpiRemaining').textContent = r.sisaAnggaranTotalFormatted || 'Rp 0';
    $('kpiCounts').textContent = `${r.totalKegiatan ?? 0} kegiatan · ${r.totalCatatanPengeluaran ?? 0} pengeluaran`;

    const temp = w.temperatureFormatted || (w.temperature !== undefined ? `${w.temperature}°C` : '—');
    $('kpiWeather').textContent = `${temp} · ${w.condition || '—'}`;
    $('kpiWeatherMeta').textContent = `${w.lokasi || 'Untad Palu'} (${w.status || w.sumber || '—'})`;

    $('kpiRateStatus').textContent = k.status || '—';
    $('kpiRateSource').textContent = `${k.provider || 'ExchangeRate-API'} (${k.sumber || '—'})`;
  }

  function renderActivities() {
    const wrap = $('activitiesList');
    if (!state.activities.length) {
      wrap.innerHTML = '<div class="card muted">Belum ada data kegiatan untuk filter ini.</div>';
      return;
    }

    wrap.innerHTML = state.activities
      .map((act) => {
        const fin = act.financialSummary || {};
        const pct = Math.min(100, Math.max(0, Number(fin.utilizationPercent) || 0));
        const bStatus = fin.budgetStatus || 'AMAN';
        const statusCls = bStatus === 'MELEBIHI_BATAS' ? 'danger' : bStatus === 'WASPADA' ? 'warn' : 'ok';
        const w = act.currentWeather || {};
        const temp = w.temperatureFormatted || (w.temperature !== undefined ? `${w.temperature}°C` : '—');

        return `
          <article class="card activity-card">
            <div class="activity-top">
              <div>
                <h3>#${escapeHtml(act.id)} ${escapeHtml(act.title)}</h3>
                <div class="meta-line">${escapeHtml(act.location)} &middot; ${escapeHtml(act.unit || 'FT Untad')}</div>
              </div>
              <span class="badge badge-${statusCls}">${escapeHtml(bStatus)}</span>
            </div>
            <div class="meta-line">Ketua: <strong>${escapeHtml(act.leadResearcher || '-')}</strong> &middot; Status: <strong>${escapeHtml(act.status || 'ACTIVE')}</strong></div>
            <div>
              <div class="meta-line" style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span>Realisasi: ${escapeHtml(fin.totalExpensesFormatted || 'Rp ' + (fin.totalSpentIDR || 0).toLocaleString('id-ID'))}</span>
                <span>${escapeHtml(fin.utilizationPercent ?? 0)}% dari ${escapeHtml(fin.budgetLimitFormatted || 'Rp ' + (act.budgetLimitIDR || 0).toLocaleString('id-ID'))}</span>
              </div>
              <div class="progress-track"><div class="progress-fill ${statusCls}" style="width:${pct}%"></div></div>
            </div>
            <div class="weather-strip">
              <span>Cuaca: <strong>${escapeHtml(temp)}</strong> (${escapeHtml(w.condition || '—')})</span>
              <span>${escapeHtml(act.expenseCount ?? 0)} transaksi</span>
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
    const status = $('filterActivityStatus').value;
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await apiRequest(`/v2/activities${qs}`);
    if (!res.ok) {
      $('activitiesList').innerHTML = `<div class="card toast-err">Error ${res.status}: ${escapeHtml(res.data?.error || 'Gagal memuat kegiatan.')}</div>`;
      return;
    }
    state.activities = res.data.data || [];
    renderActivities();
    if (!status) {
      populateActivitySelects(state.activities);
    }
  }

  function renderExpenses() {
    const tbody = $('expensesTableBody');
    if (!state.expenses.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">Tidak ada catatan pengeluaran untuk filter ini.</td></tr>';
      return;
    }

    tbody.innerHTML = state.expenses
      .map((exp) => {
        const cost = exp.cost || {};
        const act = exp.activity || {};
        return `
          <tr>
            <td class="num">${escapeHtml(exp.date)}</td>
            <td>
              <strong>#${escapeHtml(exp.id)} ${escapeHtml(exp.title)}</strong>
              <div class="meta-line">${escapeHtml(act.title || `Activity #${exp.activityId}`)}</div>
              ${exp.notes ? `<div class="meta-line">${escapeHtml(exp.notes)}</div>` : ''}
            </td>
            <td><span class="badge">${escapeHtml(exp.category)}</span></td>
            <td class="num">${escapeHtml(Number(exp.amount).toLocaleString('id-ID'))} ${escapeHtml(exp.currency)}</td>
            <td class="num"><strong>${escapeHtml(cost.formattedIDR || '—')}</strong></td>
            <td>${escapeHtml(exp.submittedBy || '-')}</td>
            <td>
              <button class="btn btn-sm btn-danger" type="button" data-delete-expense="${escapeHtml(exp.id)}">Hapus</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  async function loadExpenses() {
    const params = new URLSearchParams();
    const actId = $('filterExpenseActivity').value;
    const cat = $('filterExpenseCategory').value;
    if (actId) params.set('activityId', actId);
    if (cat) params.set('category', cat);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest(`/v2/expenses${qs}`);
    if (!res.ok) {
      $('expensesTableBody').innerHTML = `<tr><td colspan="7" class="toast-err">Error ${res.status}: ${escapeHtml(res.data?.error || 'Gagal memuat pengeluaran.')}</td></tr>`;
      return;
    }
    state.expenses = res.data.data || [];
    renderExpenses();
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
    showToast(
      `Pengeluaran #${res.data.data.id} disimpan (${res.data.data.cost?.formattedIDR || ''}).`,
      'ok'
    );
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
    badge.className = `badge ${res.ok ? 'badge-ok' : res.status === 403 ? 'badge-warn' : 'badge-danger'}`;
    $('gqlOutput').textContent = JSON.stringify(res.data, null, 2);
  }

  async function handleRunVersionAudit() {
    const [v1Res, v2Res] = await Promise.all([
      apiRequest('/v1/expenses'),
      apiRequest('/v2/expenses')
    ]);

    $('auditV1Status').textContent =
      v1Res.status === 501 ? '501 (Menunggu Issue #3)' : `HTTP ${v1Res.status}`;
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
    $('btnRefreshAll').addEventListener('click', refreshAll);

    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        document.querySelectorAll('.tab').forEach((t) => {
          const active = t === btn;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('.tab-panel').forEach((p) => {
          p.classList.toggle('active', p.id === `tab-${target}`);
        });
      });
    });

    $('filterActivityStatus').addEventListener('change', loadActivities);
    $('filterExpenseActivity').addEventListener('change', loadExpenses);
    $('filterExpenseCategory').addEventListener('change', loadExpenses);

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
          $('gqlQuery').value = preset.query;
          $('gqlVars').value = preset.variables;
        }
      });
    });

    $('btnRunGraphQL').addEventListener('click', handleRunGraphQL);
    $('btnRunVersionAudit').addEventListener('click', handleRunVersionAudit);
  }

  // Bootstrap
  restoreSession();
  renderSession();
  wireEvents();
  $('gqlQuery').value = GQL_PRESETS.activities.query;
  $('gqlVars').value = GQL_PRESETS.activities.variables;
  refreshAll();
})();
