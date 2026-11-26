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
    inspectedRole: 'admin',
    activeView: 'overview',
    pendingDeleteId: null,
    toastTimer: null,
    sidebarExpanded: false,
    sidebarTimeline: null
  };

  const $ = (id) => document.getElementById(id);

  function canAnimate() {
    return (
      typeof window.gsap !== 'undefined' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function animateViewEnter(panel) {
    if (!canAnimate() || !panel) return;
    const targets = panel.querySelectorAll('.hero-banner, .dark-strip, .card');
    if (!targets.length) return;
    window.gsap.fromTo(
      targets,
      { y: 12, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.28,
        stagger: 0.04,
        ease: 'power2.out',
        overwrite: 'auto',
        clearProps: 'transform,opacity'
      }
    );
  }

  function animateCountUp(el, targetValue, formatter) {
    if (!el) return;
    const end = Number(targetValue) || 0;
    if (!canAnimate() || end === 0) {
      el.textContent = formatter(end);
      return;
    }
    const counter = { val: 0 };
    window.gsap.to(counter, {
      val: end,
      duration: 0.55,
      ease: 'power2.out',
      overwrite: 'auto',
      onUpdate: () => {
        el.textContent = formatter(counter.val);
      },
      onComplete: () => {
        el.textContent = formatter(end);
      }
    });
  }

  function animateBars(container) {
    if (!canAnimate() || !container) return;
    const sticks = container.querySelectorAll('.bar-stick');
    if (!sticks.length) return;
    window.gsap.fromTo(
      sticks,
      { scaleY: 0, transformOrigin: 'bottom center' },
      {
        scaleY: 1,
        duration: 0.36,
        stagger: 0.045,
        ease: 'power2.out',
        overwrite: 'auto',
        clearProps: 'transform'
      }
    );
  }

  function animateBarcodeTicks(container) {
    if (!canAnimate() || !container) return;
    const ticks = container.querySelectorAll('.tick.filled, .tick.filled-hi');
    if (!ticks.length) return;
    window.gsap.fromTo(
      ticks,
      { scaleY: 0.25, opacity: 0.35, transformOrigin: 'bottom center' },
      {
        scaleY: 1,
        opacity: 1,
        duration: 0.24,
        stagger: 0.012,
        ease: 'power2.out',
        overwrite: 'auto',
        clearProps: 'transform,opacity'
      }
    );
  }

  function animateToast(el) {
    if (!canAnimate() || !el) return;
    window.gsap.fromTo(
      el,
      { y: -8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.22, ease: 'power3.out', overwrite: 'auto', clearProps: 'transform,opacity' }
    );
  }

  function animateDialogOpen(dialogEl) {
    if (!canAnimate() || !dialogEl) return;
    window.gsap.fromTo(
      dialogEl,
      { y: 10, scale: 0.97, opacity: 0 },
      {
        y: 0,
        scale: 1,
        opacity: 1,
        duration: 0.22,
        ease: 'power3.out',
        overwrite: 'auto',
        clearProps: 'transform,opacity'
      }
    );
  }

  function moveSidebarNotch(viewName, immediate = false) {
    const notch = $('sidebarActiveNotch');
    const activeBtn = document.querySelector(`.rail-btn[data-view="${viewName}"]`);
    if (!notch || !activeBtn) return;

    const targetY = activeBtn.offsetTop;
    if (immediate || !canAnimate()) {
      notch.style.transform = `translateY(${targetY}px)`;
      return;
    }

    window.gsap.to(notch, {
      y: targetY,
      duration: 0.34,
      ease: 'back.out(1.25)',
      overwrite: 'auto'
    });
  }

  function setSidebarExpanded(expand) {
    const sidebar = $('sidebar');
    const expandBtn = $('btnSidebarExpand');
    if (!sidebar) return;

    const next = Boolean(expand);
    if (state.sidebarExpanded === next) return;
    state.sidebarExpanded = next;

    if (state.sidebarTimeline) {
      state.sidebarTimeline.kill();
      state.sidebarTimeline = null;
    }

    if (expandBtn) expandBtn.setAttribute('aria-expanded', String(next));

    const reveals = sidebar.querySelectorAll('.sb-reveal');

    if (!canAnimate()) {
      sidebar.dataset.expanded = String(next);
      sidebar.style.width = next ? '242px' : '74px';
      const activeView = document.querySelector('.rail-btn.active[data-view]')?.dataset.view || 'overview';
      moveSidebarNotch(activeView, true);
      return;
    }

    if (next) {
      sidebar.dataset.expanded = 'true';
      const tl = window.gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => {
          const activeView = document.querySelector('.rail-btn.active[data-view]')?.dataset.view || 'overview';
          moveSidebarNotch(activeView, true);
        }
      });

      tl.addLabel('shell', 0)
        .to(sidebar, { width: 242, duration: 0.38, ease: 'power3.inOut' }, 'shell')
        .addLabel('labels', 'shell+=0.12')
        .fromTo(
          reveals,
          { autoAlpha: 0, x: -10, filter: 'blur(6px)' },
          {
            autoAlpha: 1,
            x: 0,
            filter: 'blur(0px)',
            duration: 0.26,
            stagger: 0.014,
            ease: 'power2.out',
            clearProps: 'filter,transform'
          },
          'labels'
        );

      state.sidebarTimeline = tl;
    } else {
      const tl = window.gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        onComplete: () => {
          sidebar.dataset.expanded = 'false';
          window.gsap.set(reveals, { clearProps: 'all' });
          const activeView = document.querySelector('.rail-btn.active[data-view]')?.dataset.view || 'overview';
          moveSidebarNotch(activeView, true);
        }
      });

      tl.addLabel('labelsOut', 0)
        .to(
          reveals,
          { autoAlpha: 0, x: -6, filter: 'blur(4px)', duration: 0.14, stagger: 0.006, ease: 'power2.in' },
          'labelsOut'
        )
        .addLabel('shellOut', 'labelsOut+=0.08')
        .to(sidebar, { width: 74, duration: 0.34, ease: 'power3.inOut' }, 'shellOut');

      state.sidebarTimeline = tl;
    }
  }

  function renderSidebarProjects() {
    const wrap = $('sidebarProjects');
    if (!wrap) return;
    const dotColors = ['#f59e0b', '#10b981', '#fb7185'];
    const items = state.activities.slice(0, 3);
    if (!items.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = items
      .map((act, idx) => `
        <button class="sb-proj-item" type="button" data-jump-activity="${escapeHtml(act.id)}" data-tip="${escapeHtml(act.title)}">
          <span class="sb-proj-dot" style="background:${dotColors[idx % dotColors.length]}"></span>
          <span class="sb-proj-name sb-reveal">${escapeHtml(act.title)}</span>
          <span class="sb-proj-count sb-reveal">${escapeHtml(act.expenseCount ?? 0)}</span>
        </button>
      `)
      .join('');
  }

  function todayIsoDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function renderCalendarStrip() {
    const now = new Date();
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    $('calendarMonthTitle').textContent = `${months[now.getMonth()]}, ${now.getFullYear()}`;

    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());

    $('weekStrip').innerHTML = days
      .map((label, idx) => {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + idx);
        const isToday = d.toDateString() === now.toDateString();
        return `<div class="day-pill${isToday ? ' today' : ''}"><span>${label}</span><strong>${d.getDate()}</strong>${isToday ? '<i></i>' : ''}</div>`;
      })
      .join('');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function hideToast() {
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    $('toast').className = 'toast hidden';
  }

  function showToast(message, tone = 'ok') {
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    $('toastMessage').textContent = message;
    $('toast').className = `toast toast-${tone}`;
    animateToast($('toast'));
    if (tone === 'ok') {
      state.toastTimer = setTimeout(hideToast, 5000);
    }
  }

  async function withButtonLoading(btn, loadingLabel, fn) {
    if (!btn) return fn();
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = loadingLabel;
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
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

  function isTokenExpired(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length !== 3) return true;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      return typeof payload.exp === 'number' && Date.now() / 1000 >= payload.exp;
    } catch (err) {
      return true;
    }
  }

  async function apiRequest(url, options = {}) {
    try {
      const res = await fetch(url, {
        method: options.method || 'GET',
        headers: buildHeaders(Boolean(options.auth)),
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const data = await res.json().catch(() => null);
      if (options.auth && res.status === 401 && state.token) {
        state.token = null;
        state.user = null;
        saveSession();
        renderSession();
      }
      return { ok: res.ok, status: res.status, headers: res.headers, data };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        headers: new Headers(),
        data: { error: 'Server tidak dapat dihubungi. Pastikan server berjalan.' }
      };
    }
  }

  function switchView(viewName) {
    if (!VIEW_TITLES[viewName] || state.activeView === viewName) return;
    state.activeView = viewName;
    $('viewTitle').textContent = VIEW_TITLES[viewName];

    document.querySelectorAll('.rail-btn[data-view]').forEach((btn) => {
      const active = btn.dataset.view === viewName;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    let activePanel = null;
    document.querySelectorAll('.view-panel').forEach((panel) => {
      const isCurrent = panel.id === `view-${viewName}`;
      panel.classList.toggle('active', isCurrent);
      if (isCurrent) activePanel = panel;
    });
    moveSidebarNotch(viewName);
    animateViewEnter(activePanel);
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
      if (saved && saved.token && saved.user && !isTokenExpired(saved.token)) {
        state.token = saved.token;
        state.user = saved.user;
      } else if (saved) {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  function isMahasiswaSession() {
    return Boolean(state.token && state.user && state.user.role === 'mahasiswa');
  }

  function applyRoleVisibility() {
    const hideAdmin = isMahasiswaSession();
    $('btnOpenActivityModal')?.classList.toggle('hidden', hideAdmin);
    $('btnSidebarAddActivity')?.classList.toggle('hidden', hideAdmin);

    const gqlDeletePreset = document.querySelector('[data-gql-preset="delete"]');
    if (gqlDeletePreset) {
      gqlDeletePreset.classList.toggle('hidden', hideAdmin);
      if (hideAdmin && gqlDeletePreset.classList.contains('active')) {
        document.querySelectorAll('[data-gql-preset]').forEach((b) => {
          b.classList.toggle('active', b.dataset.gqlPreset === 'activities');
        });
        $('gqlQuery').value = GQL_PRESETS.activities.query;
        $('gqlVars').value = GQL_PRESETS.activities.variables;
      }
    }
  }

  function renderSession() {
    const badge = $('sessionBadge');
    const railAvatar = $('railAvatar');
    const logoutBtn = $('btnLogout');
    const secLogout = $('btnSecurityLogout');
    const profileName = $('sbProfileName');
    const profileRole = $('sbProfileRole');

    if (state.user && state.token) {
      const role = state.user.role === 'admin' ? 'admin' : 'mahasiswa';
      badge.className = `session-pill session-${role}`;
      badge.textContent = `${state.user.username} (${role})`;
      railAvatar.className = `rail-avatar ${role}`;
      railAvatar.textContent = state.user.username.slice(0, 2).toUpperCase();
      railAvatar.title = `${state.user.fullName} (${role})`;
      if (profileName) profileName.textContent = state.user.fullName || state.user.username;
      if (profileRole) profileRole.textContent = `Role: ${role}`;
      logoutBtn.classList.remove('hidden');
      secLogout.classList.remove('hidden');
      renderRbacMatrix(role);
    } else {
      badge.className = 'session-pill session-guest';
      badge.textContent = 'Belum Login';
      railAvatar.className = 'rail-avatar guest';
      railAvatar.textContent = 'G';
      railAvatar.title = 'Belum Login';
      if (profileName) profileName.textContent = 'Belum Login';
      if (profileRole) profileRole.textContent = 'Klik untuk masuk';
      logoutBtn.classList.add('hidden');
      secLogout.classList.add('hidden');
    }
    applyRoleVisibility();
    if (state.expenses.length) renderExpensesTable();
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
    animateBars(container);
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
    animateCountUp($('fulfillPct'), pct, (v) => `${v.toFixed(1).replace(/\.0$/, '')}%`);

    const totalTicks = 32;
    const filledTicks = Math.min(totalTicks, Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * totalTicks)));
    const barHtml = Array.from({ length: totalTicks }, (_, idx) => {
      if (idx < filledTicks) {
        return `<span class="tick ${idx >= totalTicks - 6 ? 'filled-hi' : 'filled'}"></span>`;
      }
      return '<span class="tick"></span>';
    }).join('');
    $('barcodeBar').innerHTML = barHtml;
    animateBarcodeTicks($('barcodeBar'));

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

    const remaining = Number(r.sisaAnggaranTotalIDR ?? Math.max(0, plafon - spent)) || 0;
    const fmtIdr = (v) => `Rp ${Math.round(v).toLocaleString('id-ID')}`;

    animateCountUp($('kpiSpent'), spent, fmtIdr);
    $('kpiPlafon').textContent = `Plafon: ${r.totalPlafonFormatted || 'Rp 0'}`;
    animateCountUp($('kpiRemaining'), remaining, fmtIdr);
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
      .map((a) => `<option value="${escapeHtml(a.id)}">#${escapeHtml(a.id)} - ${escapeHtml(a.title)}</option>`)
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
    renderSidebarProjects();
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

    const hideDelete = isMahasiswaSession();
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
            <div class="row-actions">
              <button class="btn btn-table-edit" type="button" data-edit-expense="${escapeHtml(exp.id)}">Edit</button>
              ${hideDelete ? '' : `<button class="btn btn-danger" type="button" data-delete-expense="${escapeHtml(exp.id)}">Hapus</button>`}
            </div>
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
    const expBadge = $('sbExpenseCount');
    if (expBadge) expBadge.textContent = String(state.expenses.length);
    renderExpensesTable();
    renderRailFeed();
  }

  function renderRbacMatrix(role) {
    state.inspectedRole = role;
    $('rbacMatrixTitle').textContent = `Matriks Izin: Role ${role === 'admin' ? 'Admin' : 'Mahasiswa'}`;
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

  function openExpenseModal(expense = null) {
    $('expenseModalErr').classList.add('hidden');
    if (expense) {
      $('expenseEditId').value = String(expense.id);
      $('expenseModalTitle').innerHTML = `Edit Pengeluaran #${escapeHtml(expense.id)} (<code>PUT /v2/expenses/${escapeHtml(expense.id)}</code>)`;
      $('btnSubmitExpense').textContent = 'Perbarui Pengeluaran';
      $('expenseActivitySelect').value = String(expense.activityId);
      $('expenseTitleInput').value = expense.title || '';
      $('expenseCategoryInput').value = String(expense.category || 'lainnya').toLowerCase();
      $('expenseDateInput').value = expense.date || todayIsoDate();
      $('expenseAmountInput').value = String(expense.amount ?? '');
      $('expenseCurrencyInput').value = String(expense.currency || 'IDR').toUpperCase();
      $('expenseNotesInput').value = expense.notes || '';
    } else {
      $('expenseForm').reset();
      $('expenseEditId').value = '';
      $('expenseModalTitle').innerHTML = 'Tambah Pengeluaran Riset (<code>POST /v2/expenses</code>)';
      $('btnSubmitExpense').textContent = 'Simpan Pengeluaran';
      $('expenseDateInput').value = todayIsoDate();
    }
    $('expenseDialog').showModal();
    animateDialogOpen($('expenseDialog'));
  }

  function openDeleteConfirm(id) {
    const exp = state.expenses.find((e) => Number(e.id) === Number(id));
    state.pendingDeleteId = Number(id);
    const detail = exp
      ? `"${exp.title}" (${exp.cost?.formattedIDR || `${exp.amount} ${exp.currency}`})`
      : `pengeluaran #${id}`;
    $('confirmMessage').textContent = `Hapus ${detail}? Tindakan ini tidak dapat dibatalkan.`;
    $('confirmDialog').showModal();
    animateDialogOpen($('confirmDialog'));
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = $('loginUsername').value.trim();
    const password = $('loginPassword').value;

    await withButtonLoading($('btnSubmitLogin'), 'Memproses...', async () => {
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
    });
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

    await withButtonLoading($('btnSubmitActivity'), 'Menyimpan...', async () => {
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
    });
  }

  async function handleCreateExpense(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const editId = String(fd.get('editId') || '').trim();
    const isEdit = editId !== '';
    const payload = {
      activityId: Number(fd.get('activityId')),
      title: String(fd.get('title') || '').trim(),
      category: String(fd.get('category') || 'lainnya'),
      amount: Number(fd.get('amount')),
      currency: String(fd.get('currency') || 'IDR'),
      date: String(fd.get('date') || ''),
      notes: String(fd.get('notes') || '').trim()
    };

    const url = isEdit ? `/v2/expenses/${editId}` : '/v2/expenses';
    const method = isEdit ? 'PUT' : 'POST';

    await withButtonLoading($('btnSubmitExpense'), isEdit ? 'Memperbarui...' : 'Menyimpan...', async () => {
      const res = await apiRequest(url, { method, auth: true, body: payload });
      if (!res.ok) {
        const msg = `Gagal ${isEdit ? 'memperbarui' : 'menambah'} pengeluaran (${res.status}): ${res.data?.error || 'Periksa input / login.'}`;
        $('expenseModalErr').textContent = msg;
        $('expenseModalErr').className = 'toast toast-err';
        showToast(msg, 'err');
        return;
      }

      $('expenseModalErr').classList.add('hidden');
      $('expenseDialog').close();
      e.target.reset();
      $('expenseEditId').value = '';
      showToast(
        `Pengeluaran #${res.data.data.id} ${isEdit ? 'diperbarui' : 'disimpan'} (${res.data.data.cost?.formattedIDR || ''}).`,
        'ok'
      );
      await refreshAll();
    });
  }

  async function handleDeleteExpense(id) {
    await withButtonLoading($('btnConfirmDelete'), 'Menghapus...', async () => {
      const res = await apiRequest(`/v2/expenses/${id}`, { method: 'DELETE', auth: true });
      $('confirmDialog').close();
      state.pendingDeleteId = null;
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
    });
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

    $('auditV1Status').textContent = `HTTP ${v1Res.status}`;
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
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        btn.style.setProperty('--my', `${e.clientY - rect.top}px`);
      });
    });

    $('btnSidebarExpand')?.addEventListener('click', () => setSidebarExpanded(!state.sidebarExpanded));
    $('btnSidebarCollapse')?.addEventListener('click', () => setSidebarExpanded(false));
    $('btnSidebarSearch')?.addEventListener('click', () => {
      if (!state.sidebarExpanded) setSidebarExpanded(true);
      setTimeout(() => $('sidebarSearchInput')?.focus(), 180);
    });

    $('sidebarSearchInput')?.addEventListener('input', (e) => {
      const q = e.target.value;
      $('searchExpense').value = q;
      if (q.trim() && state.activeView !== 'expenses') {
        switchView('expenses');
      }
      renderExpensesTable();
    });

    $('btnSidebarAddActivity')?.addEventListener('click', () => {
      $('activityModalErr').classList.add('hidden');
      $('activityDialog').showModal();
      animateDialogOpen($('activityDialog'));
    });

    async function handleManualRefresh() {
      await refreshAll();
      showToast('Data dashboard diperbarui dari API.', 'ok');
    }

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarExpanded(!state.sidebarExpanded);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!state.sidebarExpanded) setSidebarExpanded(true);
        setTimeout(() => $('sidebarSearchInput')?.focus(), 180);
      }
    });

    document.body.addEventListener('click', (e) => {
      const projBtn = e.target.closest('[data-jump-activity]');
      if (projBtn) {
        const actId = Number(projBtn.dataset.jumpActivity);
        const act = state.activities.find((item) => Number(item.id) === actId);
        $('searchActivity').value = act ? act.title : '';
        switchView('activities');
        renderActivitiesView();
        return;
      }
      const jumper = e.target.closest('[data-jump-view]');
      if (jumper) switchView(jumper.dataset.jumpView);
    });

    $('railRefreshBtn').addEventListener('click', handleManualRefresh);

    $('btnHeroAddExpense').addEventListener('click', () => openExpenseModal());

    $('toastClose').addEventListener('click', hideToast);

    $('btnToggleApiKey').addEventListener('click', () => {
      const input = $('apiKeyInput');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      $('btnToggleApiKey').textContent = showing ? 'Lihat' : 'Sembunyi';
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
      animateDialogOpen($('activityDialog'));
    });
    $('btnOpenExpenseModal').addEventListener('click', () => openExpenseModal());
    document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
      btn.addEventListener('click', () => $(btn.dataset.closeDialog).close());
    });

    $('activityForm').addEventListener('submit', handleCreateActivity);
    $('expenseForm').addEventListener('submit', handleCreateExpense);

    $('expensesTableBody').addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-expense]');
      if (editBtn) {
        const exp = state.expenses.find((item) => Number(item.id) === Number(editBtn.dataset.editExpense));
        if (exp) openExpenseModal(exp);
        return;
      }
      const delBtn = e.target.closest('[data-delete-expense]');
      if (delBtn) openDeleteConfirm(Number(delBtn.dataset.deleteExpense));
    });

    $('btnConfirmDelete').addEventListener('click', () => {
      if (state.pendingDeleteId !== null) handleDeleteExpense(state.pendingDeleteId);
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
  renderCalendarStrip();
  restoreSession();
  renderSession();
  renderRbacMatrix(state.user?.role === 'mahasiswa' ? 'mahasiswa' : 'admin');
  wireEvents();
  moveSidebarNotch('overview', true);
  $('gqlQuery').value = GQL_PRESETS.activities.query;
  $('gqlVars').value = GQL_PRESETS.activities.variables;
  refreshAll();
})();
