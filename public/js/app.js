// ─── App State ─────────────────────────────────────────────────────────────────
let state = {
  users: [],
  leaderboard: [],
  feed: [],
  activeTab: 'leaderboard',
  refreshInterval: null,
  lastRefresh: null,
  isSyncing: false,
  // Period filter states
  periodStart: null,
  periodEnd: null,
  activePreset: 'all',
  sortBy: 'total'
};

// ─── DOM Refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ─── Initialize ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSidebarState();
  setupTabs();
  setupForm();
  setupModal();
  setupPeriodFilter();
  setupExport();
  setupCredentialsForm();
  loadAll();
  startAutoRefresh();
  updateClock();
  setInterval(updateClock, 30000);
});

// ─── Auto Refresh ──────────────────────────────────────────────────────────────
const startAutoRefresh = () => {
  state.refreshInterval = setInterval(() => {
    loadAll(true);
  }, 60000);
};

const updateClock = () => {
  const el = $('last-refresh');
  if (el && state.lastRefresh) {
    el.textContent = `Last updated ${relativeTime(state.lastRefresh)}`;
  }
};

// ─── Load All Data ─────────────────────────────────────────────────────────────
const loadAll = async (silent = false) => {
  if (!silent) showSkeletons();
  try {
    const [lbRes, feedRes] = await Promise.allSettled([
      API.getLeaderboard(state.periodStart, state.periodEnd, state.sortBy),
      API.getFeed(),
    ]);

    if (lbRes.status === 'fulfilled') {
      state.leaderboard = lbRes.value.data || [];
      state.users = state.leaderboard;
    }
    if (feedRes.status === 'fulfilled') {
      state.feed = feedRes.value.data || [];
    }

    state.lastRefresh = new Date();

    // Toggle period column visibility dynamically
    const periodHeader = $('th-period-solved');
    if (periodHeader) {
      if (state.periodStart) {
        periodHeader.classList.remove('d-none');
      } else {
        periodHeader.classList.add('d-none');
      }
    }

    renderAll();
    updateClock();
  } catch (err) {
    if (!silent) toast('Failed to load data: ' + err.message, 'error');
  }
};

// ─── Render Everything ─────────────────────────────────────────────────────────
const renderAll = () => {
  renderStats();
  renderLeaderboard();
  renderCards();
  renderFeed();
};

// ─── Stats Bar ─────────────────────────────────────────────────────────────────
const renderStats = () => {
  const u = state.leaderboard;
  $('stat-users').textContent     = u.length;
  $('stat-total').textContent     = fmtNum(u.reduce((a,x) => a + x.totalSolved, 0));
  $('stat-hard').textContent      = fmtNum(u.reduce((a,x) => a + x.hardSolved, 0));
  $('stat-feed').textContent      = state.feed.length;
};

// ─── Tabs ──────────────────────────────────────────────────────────────────
const setupTabs = () => {
  document.querySelectorAll('.sidebar-menu-bs .menu-item-bs').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-menu-bs .menu-item-bs').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
      state.activeTab = btn.dataset.tab;

      // Hide or show dashboard-only panels
      const isDashboard = btn.dataset.tab === 'leaderboard' || btn.dataset.tab === 'cards';
      const statsBar = $('stats-bar');
      const addUserCard = $('add-user-card');
      const periodCard = $('period-filter-card');

      if (statsBar) statsBar.style.display = isDashboard ? 'flex' : 'none';
      if (addUserCard) addUserCard.style.display = isDashboard ? 'block' : 'none';
      if (periodCard) periodCard.style.display = isDashboard ? 'block' : 'none';

      // On mobile, auto-close the sidebar when a menu item is clicked
      const container = $('app-container');
      if (container && container.classList.contains('mobile-expanded')) {
        container.classList.remove('mobile-expanded');
      }
    });
  });
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────
const renderLeaderboard = () => {
  const tbody = $('leaderboard-body');
  if (!state.leaderboard.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
      <div class="icon">${Icons.trophy}</div>
      <h3>No users tracked yet</h3>
      <p>Add a LeetCode username above to get started.</p>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML = state.leaderboard.map(renderLeaderboardRow).join('');
};

// ─── Cards View ────────────────────────────────────────────────────────────────
const renderCards = () => {
  const grid = $('users-grid');
  if (!state.users.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="icon">${Icons.user}</div>
      <h3>No users tracked yet</h3>
      <p>Use the form above to add a LeetCode username.</p>
    </div>`;
    return;
  }
  grid.innerHTML = state.users.map(renderUserCard).join('');
};

// ─── Activity Feed ─────────────────────────────────────────────────────────────
const renderFeed = () => {
  const list = $('feed-list');
  if (!state.feed.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="icon">${Icons.file}</div>
      <h3>No activity yet</h3>
      <p>Submissions will appear here after syncing.</p>
    </div>`;
    return;
  }
  list.innerHTML = state.feed.map(renderFeedItem).join('');
};

// ─── Skeleton Loaders ──────────────────────────────────────────────────────
const showSkeletons = () => {
  const lbSkeleton = Array(3).fill(0).map(() => `
    <tr><td colspan="6" class="p-3">
      <div class="placeholder-wave"><span class="placeholder col-12 rounded"></span></div>
    </td></tr>`).join('');
  $('leaderboard-body').innerHTML = lbSkeleton;

  $('feed-list').innerHTML = Array(4).fill(0).map(() => `
    <div class="p-3 border rounded-3 mb-2">
      <div class="placeholder-wave"><span class="placeholder col-8 rounded mb-2 d-block" style="height:12px"></span></div>
      <div class="placeholder-wave"><span class="placeholder col-4 rounded" style="height:10px"></span></div>
    </div>`).join('');
};

// ─── Add User Form ─────────────────────────────────────────────────────────────
const setupForm = () => {
  const form    = $('add-user-form');
  const input   = $('username-input');
  const addBtn  = $('add-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = input.value.trim();
    if (!username) return;

    addBtn.disabled = true;
    addBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Adding...';

    try {
      await API.addUser(username);
      toast(`@${username} added to tracker!`, 'success');
      input.value = '';
      await loadAll();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      addBtn.disabled = false;
      addBtn.innerHTML = '<i class="bi bi-plus-lg"></i> Add User';
    }
  });
};

// ─── Manual Sync ──────────────────────────────────────────────────────────────
window.manualSync = async () => {
  if (state.isSyncing) return;
  const btn = $('sync-btn');
  state.isSyncing = true;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="d-none d-sm-inline">Syncing...</span>';

  try {
    const res = await API.syncAll();
    toast(`Synced ${res.synced} user(s) successfully`, 'success');
    await loadAll();
  } catch (err) {
    toast('Sync failed: ' + err.message, 'error');
  } finally {
    state.isSyncing = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> <span class="d-none d-sm-inline">Sync Now</span>';
  }
};

// ─── Remove User ──────────────────────────────────────────────────────────
window.confirmRemove = (username) => {
  $('remove-username').textContent = username;
  const bsModal = new bootstrap.Modal($('confirm-remove-modal'));
  bsModal.show();
  $('confirm-remove-btn').onclick = async () => {
    try {
      await API.removeUser(username);
      toast(`Removed @${username}`, 'info');
      bsModal.hide();
      await loadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
};

// ─── User Detail Modal ────────────────────────────────────────────────────────
window.openUserModal = async (username) => {
  const modal = $('user-detail-modal');
  const body  = $('user-modal-body');

  body.innerHTML = `<div style="text-align:center;padding:40px">
    <div class="spinner-border text-primary" role="status"></div>
    <p style="color:var(--text-muted);margin-top:12px;font-size:0.85rem">Loading profile...</p>
  </div>`;
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();

  try {
    const res  = await API.getUserDetail(username);
    const u    = res.data;
    const subs = u.submissions || [];

    const lbEntry = state.leaderboard.find(x => x.username.toLowerCase() === u.username.toLowerCase());
    const periodSolved = lbEntry ? lbEntry.periodSolved : null;
    const periodSection = periodSolved ? `
      <div class="alert alert-success py-2 px-3 border border-success-subtle mb-3" style="border-radius:10px; background-color:#eafaf1; border-color:#d5f5e3; font-size: 0.82rem;">
        <div class="d-flex align-items-center justify-content-between mb-1">
          <span class="fw-bold text-success-emphasis"><i class="bi bi-calendar-check me-1"></i> Period Solved:</span>
          <span class="badge bg-success font-mono">+${periodSolved.total}</span>
        </div>
        <div class="period-diff-badge-container">
          <span class="period-diff-badge easy">${periodSolved.easy} Easy</span>
          <span class="period-diff-badge medium">${periodSolved.medium} Med</span>
          <span class="period-diff-badge hard">${periodSolved.hard} Hard</span>
        </div>
      </div>
    ` : '';

    const activeBadgeImg = u.activeBadge ? `<img src="${u.activeBadge.icon}" alt="${u.activeBadge.name}" class="user-badge-icon" title="${u.activeBadge.name}" data-bs-toggle="tooltip">` : '';

    const badgesSection = u.badges && u.badges.length > 0 ? `
      <div class="mb-4">
        <div class="text-uppercase text-muted fw-semibold mb-2" style="font-size:.7rem;letter-spacing:.07em">Earned Badges (${u.badges.length})</div>
        <div class="d-flex flex-wrap gap-2">
          ${u.badges.map(b => `
            <div class="modal-badge-item" title="${b.name}" data-bs-toggle="tooltip">
              <img src="${b.icon}" alt="${b.name}">
              <span>${b.name}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    const contestSection = u.contestRating ? `
      <div class="mb-4">
        <div class="text-uppercase text-muted fw-semibold mb-2" style="font-size:.7rem;letter-spacing:.07em">Contest Performance</div>
        <div class="contest-widget">
          <div class="row g-2 text-center">
            <div class="col-4">
              <div class="contest-stat-value text-primary">${u.contestRating}</div>
              <div class="contest-stat-label">Rating</div>
            </div>
            <div class="col-4 border-start border-2">
              <div class="contest-stat-value">${u.contestGlobalRanking ? fmtNum(u.contestGlobalRanking) : '—'}</div>
              <div class="contest-stat-label">Global Rank</div>
            </div>
            <div class="col-4 border-start border-2">
              <div class="contest-stat-value text-success">${u.contestTopPercent ? u.contestTopPercent.toFixed(2) + '%' : '—'}</div>
              <div class="contest-stat-label">Top Percent</div>
            </div>
          </div>
          <div class="text-center text-muted small mt-2 pt-2 border-top" style="font-size: 0.72rem;">
            Attended <span class="fw-semibold text-dark">${u.contestCount}</span> official contest(s)
          </div>
        </div>
      </div>
    ` : '';

    const mapLang = (lang) => {
      if (!lang) return '';
      const lower = lang.toLowerCase();
      if (lower.startsWith('python')) return 'language-python';
      if (lower === 'cpp') return 'language-cpp';
      if (lower === 'csharp') return 'language-csharp';
      if (lower === 'golang') return 'language-go';
      return `language-${lower}`;
    };

    const submissionsListHtml = subs.length ? subs.slice(0, 10).map(s => {
      const codeViewerBtn = `
        <button class="btn btn-link btn-sm text-decoration-none p-0 ms-auto text-primary fw-semibold" style="font-size:.68rem"
                onclick="event.stopPropagation(); toggleSubmissionCode('${s.submissionId}', '${u.username}')">
          View Code <i class="bi bi-chevron-down ms-1" id="chevron-${s.submissionId}"></i>
        </button>
      `;

      const codeContainer = `
        <div id="code-collapse-${s.submissionId}" class="d-none">
          <div class="submission-code-container">
            <div class="submission-code-header">
              <span class="submission-code-lang">${s.lang || 'Code'}</span>
              <div class="d-flex align-items-center gap-2">
                <button class="copy-code-btn" onclick="event.stopPropagation(); copyToClipboard('${s.submissionId}')">
                  <i class="bi bi-copy me-1"></i>Copy
                </button>
                <button class="expand-code-btn" id="expand-btn-${s.submissionId}" onclick="event.stopPropagation(); toggleFullscreenCode('${s.submissionId}')">
                  <i class="bi bi-arrows-angle-expand me-1"></i>Full Screen
                </button>
              </div>
            </div>
            <pre class="submission-code-body"><code id="code-text-${s.submissionId}" class="${mapLang(s.lang)}">${escapeHtml(s.code || '')}</code></pre>
          </div>
        </div>
      `;

      return `
        <div class="py-2 border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div class="feed-dot-bs ${s.difficulty}" style="flex-shrink:0;margin-top:0"></div>
            <div class="flex-grow-1 text-truncate">
              <div class="fw-semibold text-dark text-truncate" style="font-size:.84rem">${s.title}</div>
              <div class="d-flex align-items-center gap-1 mt-1 text-muted" style="font-size:.68rem">
                ${diffBadge(s.difficulty)}
                <span class="font-mono">${s.lang || ''}</span>
                <span>·</span>
                <span>${relativeTime(s.timestamp)}</span>
              </div>
            </div>
            ${codeViewerBtn}
          </div>
          ${codeContainer}
        </div>
      `;
    }).join('') : '<p class="text-muted text-center py-3 mb-0" style="font-size:.84rem">No submissions cached yet.</p>';

    body.innerHTML = `
      <div class="d-flex align-items-center gap-3 mb-4">
        ${buildAvatar(u, 'lg')}
        <div>
          <h5 class="fw-black mb-0 d-flex align-items-center gap-2">
            <span>${u.displayName || u.username}</span>
            ${activeBadgeImg}
          </h5>
          <div class="text-muted d-flex align-items-center gap-1" style="font-size:.78rem">
            @${u.username}
            <span class="text-secondary">·</span>
            ${Icons.globe} Global Rank #${fmtNum(u.ranking)}
          </div>
        </div>
      </div>

      ${periodSection}
      ${contestSection}
      ${badgesSection}

      <div class="row g-2 mb-4">
        <div class="col-4">
          <div class="bg-success-subtle border border-success-subtle rounded-3 p-3 text-center">
            <div class="fw-black text-success fs-4">${u.easySolved}</div>
            <div class="text-success fw-semibold" style="font-size:.7rem">Easy</div>
          </div>
        </div>
        <div class="col-4">
          <div class="bg-warning-subtle border border-warning-subtle rounded-3 p-3 text-center">
            <div class="fw-black text-warning-emphasis fs-4">${u.mediumSolved}</div>
            <div class="text-warning-emphasis fw-semibold" style="font-size:.7rem">Medium</div>
          </div>
        </div>
        <div class="col-4">
          <div class="bg-danger-subtle border border-danger-subtle rounded-3 p-3 text-center">
            <div class="fw-black text-danger fs-4">${u.hardSolved}</div>
            <div class="text-danger fw-semibold" style="font-size:.7rem">Hard</div>
          </div>
        </div>
      </div>

      <div class="mb-3">
        <div class="text-uppercase text-muted fw-semibold mb-2" style="font-size:.7rem;letter-spacing:.07em">Recent Submissions</div>
        ${submissionsListHtml}
      </div>

      <div class="text-end text-muted" style="font-size:.7rem">
        Last synced: ${u.lastSynced ? new Date(u.lastSynced).toLocaleString() : 'Never'}
      </div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-state-bs text-center py-5">
      <div class="empty-icon">${Icons.warn}</div>
      <h6 class="text-secondary">Error loading profile</h6>
      <p class="text-muted" style="font-size:.83rem">${err.message}</p>
    </div>`;
  }
};

// ─── Modal Setup (Bootstrap handles this natively via data-bs-dismiss) ───────
const setupModal = () => {
  const modalEl = $('user-detail-modal');
  if (modalEl) {
    modalEl.addEventListener('hide.bs.modal', () => {
      document.querySelectorAll('.submission-code-container.fullscreen-code').forEach(el => {
        el.classList.remove('fullscreen-code');
      });
      document.body.style.overflow = '';
    });
  }
};

window.closeModal = (id) => {
  const instance = bootstrap.Modal.getInstance($(id));
  if (instance) instance.hide();
};

// ─── Period Filter Setup & Logic ─────────────────────────────────────────────
const setupPeriodFilter = () => {
  const presetContainer = $('period-presets-group');
  const customContainer = $('custom-date-container');
  const startInput = $('period-start-input');
  const endInput = $('period-end-input');
  const applyBtn = $('apply-custom-btn');
  const sortSelect = $('sort-select');

  if (!presetContainer) return;

  // Initialize values based on state
  updatePeriodBadge();
  updateSortDropdown();

  // Handle Preset Clicks
  presetContainer.querySelectorAll('.preset-btn-bs').forEach(btn => {
    btn.addEventListener('click', async () => {
      presetContainer.querySelectorAll('.preset-btn-bs').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const preset = btn.dataset.preset;
      state.activePreset = preset;

      if (preset === 'custom') {
        customContainer.classList.remove('d-none');
        // Clear previous custom dates to avoid confusing state
        startInput.value = '';
        endInput.value = '';
      } else {
        customContainer.classList.add('d-none');
        calculatePresetDates(preset);
        updatePeriodBadge();
        updateSortDropdown();
        await loadAll();
      }
    });
  });

  // Apply Custom Date Range
  const applyCustomDateRange = async (showErrors = false) => {
    const startVal = startInput.value;
    const endVal = endInput.value;
    if (!startVal || !endVal) {
      if (showErrors) {
        toast('Please select both start and end dates.', 'error');
      }
      return;
    }
    if (new Date(startVal) > new Date(endVal)) {
      toast('Start date cannot be after end date.', 'error');
      return;
    }

    // Include full day for end date: 23:59:59
    state.periodStart = new Date(startVal + 'T00:00:00').toISOString();
    state.periodEnd = new Date(endVal + 'T23:59:59').toISOString();
    updatePeriodBadge();
    updateSortDropdown();
    await loadAll();
  };

  // Bind events for automatic and manual application
  startInput.addEventListener('change', () => applyCustomDateRange(false));
  endInput.addEventListener('change', () => applyCustomDateRange(false));
  applyBtn.addEventListener('click', () => applyCustomDateRange(true));

  // Handle Sort Select Change
  sortSelect.addEventListener('change', async () => {
    state.sortBy = sortSelect.value;
    await loadAll();
  });
};

const calculatePresetDates = (preset) => {
  if (preset === 'all') {
    state.periodStart = null;
    state.periodEnd = null;
    return;
  }

  const now = new Date();
  let start = new Date();
  
  if (preset === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (preset === 'week') {
    // Start of current week (Monday)
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
  } else if (preset === 'month') {
    // 1st of current month
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  state.periodStart = start.toISOString();
  state.periodEnd = now.toISOString();
};

const updatePeriodBadge = () => {
  const badge = $('active-period-badge');
  if (!badge) return;
  
  if (!state.periodStart) {
    badge.textContent = 'All Time';
    badge.className = 'badge bg-primary-subtle text-primary border border-primary-subtle';
  } else {
    const startStr = new Date(state.periodStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endStr = new Date(state.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    
    let label = '';
    if (state.activePreset === 'today') label = 'Today';
    else if (state.activePreset === 'week') label = 'This Week';
    else if (state.activePreset === 'month') label = 'This Month';
    else label = 'Custom Range';
    
    badge.textContent = `${label} (${startStr} - ${endStr})`;
    badge.className = 'badge bg-success-subtle text-success border border-success-subtle';
  }
};

const updateSortDropdown = () => {
  const sortSelect = $('sort-select');
  const sortPeriodOpt = $('sort-period-option');
  if (!sortSelect || !sortPeriodOpt) return;

  if (state.periodStart) {
    const wasDisabled = sortPeriodOpt.disabled;
    sortPeriodOpt.disabled = false;
    // Auto-switch sort to period solved only if transitioning from "All Time" (previously disabled)
    if (wasDisabled && state.sortBy === 'total') {
      state.sortBy = 'period';
      sortSelect.value = 'period';
    }
  } else {
    sortPeriodOpt.disabled = true;
    state.sortBy = 'total';
    sortSelect.value = 'total';
  }
};

// ─── Sidebar Functions ──────────────────────────────────────────────────────
window.toggleSidebar = () => {
  const container = $('app-container');
  if (!container) return;

  const isMobile = window.innerWidth < 992;
  if (isMobile) {
    container.classList.toggle('mobile-expanded');
  } else {
    container.classList.toggle('collapsed');
    // Save preference
    const isCollapsed = container.classList.contains('collapsed');
    localStorage.setItem('sidebar_collapsed', isCollapsed ? 'true' : 'false');
  }
};

window.initSidebarState = () => {
  const container = $('app-container');
  if (!container) return;
  const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  const isMobile = window.innerWidth < 992;
  if (isCollapsed && !isMobile) {
    container.classList.add('collapsed');
  }
};

// ─── Export Report Handler ───────────────────────────────────────────────────
const setupExport = () => {
  const btn = $('export-report-btn');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Disable button during export to avoid double-clicks
    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm text-success me-2"></span><span class="menu-text-bs text-success">Exporting...</span>';

    try {
      let query = '';
      const params = [];
      if (state.periodStart) params.push(`startDate=${encodeURIComponent(state.periodStart)}`);
      if (state.periodEnd) params.push(`endDate=${encodeURIComponent(state.periodEnd)}`);
      if (params.length > 0) {
        query = '?' + params.join('&');
      }
      
      const token = localStorage.getItem('auth_token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/users/report${query}`, {
        method: 'GET',
        headers
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Export failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leetcode_report_${state.activePreset}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast('Report exported successfully!', 'success');
    } catch (err) {
      toast('Failed to export report: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalContent;
    }
  });
};

// ─── Code Viewer & Copy Helpers ──────────────────────────────────────────────
window.toggleSubmissionCode = async (id, username) => {
  const container = $(`code-collapse-${id}`);
  const chevron = $(`chevron-${id}`);
  const codeEl = $(`code-text-${id}`);
  if (container) {
    if (container.classList.contains('d-none')) {
      container.classList.remove('d-none');
      if (chevron) {
        chevron.classList.remove('bi-chevron-down');
        chevron.classList.add('bi-chevron-up');
      }
      
      // If code is empty/not loaded, fetch it
      if (codeEl && !codeEl.textContent.trim()) {
        codeEl.innerHTML = `<span class="spinner-border spinner-border-sm text-secondary" role="status"></span> Loading code...`;
        try {
          const res = await API.getSubmissionCode(id, username);
          codeEl.textContent = res.code;
          if (window.hljs) {
            window.hljs.highlightElement(codeEl);
          }
        } catch (err) {
          codeEl.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle-fill me-1"></i>${err.message}</span>`;
        }
      } else {
        // Trigger highlight.js if not already highlighted
        if (codeEl && window.hljs && !codeEl.classList.contains('hljs') && !codeEl.querySelector('.spinner-border') && !codeEl.querySelector('.text-danger')) {
          window.hljs.highlightElement(codeEl);
        }
      }
    } else {
      container.classList.add('d-none');
      if (chevron) {
        chevron.classList.remove('bi-chevron-up');
        chevron.classList.add('bi-chevron-down');
      }
    }
  }
};

window.toggleFullscreenCode = (id) => {
  const container = document.querySelector(`#code-collapse-${id} .submission-code-container`);
  const btn = $(`expand-btn-${id}`);
  if (container) {
    const isFullscreen = container.classList.toggle('fullscreen-code');
    if (isFullscreen) {
      if (btn) btn.innerHTML = '<i class="bi bi-arrows-angle-contract me-1"></i>Minimize';
      document.body.style.overflow = 'hidden';
    } else {
      if (btn) btn.innerHTML = '<i class="bi bi-arrows-angle-expand me-1"></i>Full Screen';
      document.body.style.overflow = '';
    }
  }
};

window.copyToClipboard = (id) => {
  const codeEl = $(`code-text-${id}`);
  if (codeEl) {
    navigator.clipboard.writeText(codeEl.textContent);
    toast('Code copied to clipboard!', 'success');
  }
};

// ─── LeetCode Settings Credentials Configuration ──────────────────────────────
const setupCredentialsForm = async () => {
  const form = $('settings-credentials-form');
  const sessionInput = $('settings-session');
  const csrfInput = $('settings-csrf');
  const saveBtn = $('save-credentials-btn');
  const statusText = $('credentials-status-text');

  if (!form) return;

  // Load current status
  const updateStatus = async () => {
    try {
      statusText.textContent = 'Checking configuration...';
      const res = await API.getCredentials();
      if (res.hasSession && res.hasCsrfToken) {
        statusText.innerHTML = '<span class="text-success"><i class="bi bi-check-circle-fill"></i> Active</span>';
        sessionInput.value = res.leetcodeSession || '';
        csrfInput.value = res.leetcodeCsrfToken || '';
      } else {
        statusText.innerHTML = '<span class="text-warning"><i class="bi bi-exclamation-triangle-fill"></i> Not configured (public data only)</span>';
        sessionInput.value = '';
        csrfInput.value = '';
      }
    } catch (err) {
      statusText.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill"></i> Failed to verify configuration</span>`;
    }
  };

  await updateStatus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sessionVal = sessionInput.value.trim();
    const csrfVal = csrfInput.value.trim();

    if (!sessionVal && !csrfVal) {
      toast('Please enter your credentials to save.', 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Saving...';

    try {
      await API.saveCredentials(sessionVal, csrfVal);
      toast('LeetCode credentials saved successfully!', 'success');
      sessionInput.value = '';
      csrfInput.value = '';
      await updateStatus();
      // Reload leaderboard/users to update cards/rows
      await loadAll(true);
    } catch (err) {
      toast('Failed to save credentials: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="bi bi-floppy-fill me-1"></i> Save Credentials';
    }
  });
};

window.togglePasswordVisibility = (id) => {
  const el = $(id);
  const eye = $(id + '-eye');
  if (el) {
    if (el.type === 'password') {
      el.type = 'text';
      if (eye) {
        eye.classList.remove('bi-eye');
        eye.classList.add('bi-eye-slash');
      }
    } else {
      el.type = 'password';
      if (eye) {
        eye.classList.remove('bi-eye-slash');
        eye.classList.add('bi-eye');
      }
    }
  }
};
