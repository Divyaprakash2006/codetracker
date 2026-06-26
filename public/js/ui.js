// ─── UI Helpers ────────────────────────────────────────────────────────────────

// Bootstrap Icon helpers (bi classes)
const Icons = {
  success: `<i class="bi bi-check-circle-fill" style="color:#198754;font-size:16px"></i>`,
  error:   `<i class="bi bi-x-circle-fill" style="color:#dc3545;font-size:16px"></i>`,
  info:    `<i class="bi bi-info-circle-fill" style="color:#0d6efd;font-size:16px"></i>`,
  trophy:  `<i class="bi bi-trophy-fill" style="font-size:40px;color:#ffc107"></i>`,
  user:    `<i class="bi bi-person-circle" style="font-size:40px;color:#6c757d"></i>`,
  file:    `<i class="bi bi-file-earmark-text" style="font-size:40px;color:#6c757d"></i>`,
  warn:    `<i class="bi bi-exclamation-triangle-fill" style="font-size:40px;color:#dc3545"></i>`,
  globe:   `<i class="bi bi-globe2" style="font-size:12px"></i>`,
  medal1:  `<i class="bi bi-award-fill" style="color:#ffc107;font-size:14px"></i>`,
  medal2:  `<i class="bi bi-award-fill" style="color:#adb5bd;font-size:14px"></i>`,
  medal3:  `<i class="bi bi-award-fill" style="color:#fd7e14;font-size:14px"></i>`,
};

// Toast notifications (custom bottom-right toasts, not BS toasts)
let toastTimer = {};
window.toast = (msg, type = 'info', duration = 4000) => {
  const container = document.getElementById('toast-container');
  const id = Date.now();
  const el = document.createElement('div');
  el.className = `toast-bs ${type}`;
  el.id = `toast-${id}`;
  el.innerHTML = `<span>${Icons[type] || Icons.info}</span><span>${msg}</span>`;
  container.appendChild(el);
  toastTimer[id] = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(30px)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 350);
  }, duration);
};

// Format relative time
window.relativeTime = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

// Format number with commas
window.fmtNum = (n) => (n || 0).toLocaleString();

// Difficulty badge (Bootstrap badges)
window.diffBadge = (diff) => {
  const map = {
    Easy:   ['bg-success-subtle text-success',            'Easy'],
    Medium: ['bg-warning-subtle text-warning-emphasis',   'Medium'],
    Hard:   ['bg-danger-subtle text-danger',              'Hard'],
  };
  const entry = map[diff];
  if (!entry) return ''; // Unknown / null / undefined → render nothing
  const [cls, label] = entry;
  return `<span class="badge ${cls} fw-semibold" style="font-size:.68rem">${label}</span>`;
};


// Generate avatar background gradient
window.avatarColor = (username) => {
  const colors = [
    'linear-gradient(135deg,#6610f2,#6f42c1)',
    'linear-gradient(135deg,#0d6efd,#0dcaf0)',
    'linear-gradient(135deg,#198754,#20c997)',
    'linear-gradient(135deg,#d63384,#fd7e14)',
    'linear-gradient(135deg,#0d6efd,#6610f2)',
    'linear-gradient(135deg,#fd7e14,#ffc107)',
  ];
  const idx = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return colors[idx];
};

// Build avatar element
window.buildAvatar = (user, size = 'md') => {
  const cls = size === 'lg' ? 'avatar-bs-lg' : 'avatar-bs';
  const initials = (user.displayName || user.username || '?')[0].toUpperCase();
  if (user.avatar) {
    return `<div class="${cls}" style="background:${avatarColor(user.username)}">
      <img src="${user.avatar}" alt="${user.username}" onerror="this.parentElement.innerHTML='${initials}'">
    </div>`;
  }
  return `<div class="${cls}" style="background:${avatarColor(user.username)}">${initials}</div>`;
};

// Build rank badge
window.rankBadge = (rank) => {
  const iconMap = { 1: Icons.medal1, 2: Icons.medal2, 3: Icons.medal3 };
  const clsMap  = { 1: 'rank-1', 2: 'rank-2', 3: 'rank-3' };
  if (rank <= 3) {
    return `<div class="rank-badge-bs ${clsMap[rank]}">${iconMap[rank]}</div>`;
  }
  return `<div class="rank-badge-bs rank-n fw-bold">${rank}</div>`;
};

// Build solved pills
window.solvedPills = (user) => `
  <div class="d-flex gap-1 flex-wrap">
    <span class="pill-bs pill-easy">${user.easySolved}E</span>
    <span class="pill-bs pill-medium">${user.mediumSolved}M</span>
    <span class="pill-bs pill-hard">${user.hardSolved}H</span>
  </div>`;

// Build progress bar
window.progressBar = (val, total, cls) => {
  const pct = total > 0 ? Math.min((val / total) * 100, 100).toFixed(1) : 0;
  return `<div class="prog-wrap">
    <div class="prog-bar">
      <div class="prog-fill ${cls}" style="width:${pct}%"></div>
    </div>
    <div class="prog-label">${pct}%</div>
  </div>`;
};

// Render leaderboard row
window.renderLeaderboardRow = (u) => {
  const periodCell = u.periodSolved 
    ? `<td><span class="badge-period-solved">+${u.periodSolved.total}</span></td>`
    : `<td class="d-none"></td>`;

  const badgeImg = u.activeBadge ? `<img src="${u.activeBadge.icon}" alt="${u.activeBadge.name}" class="user-badge-icon" title="${u.activeBadge.name}" data-bs-toggle="tooltip">` : '';

  return `
  <tr data-username="${u.username}" onclick="openUserModal('${u.username}')">
    <td class="ps-3">${rankBadge(u.rank)}</td>
    <td>
      <div class="d-flex align-items-center gap-2">
        ${buildAvatar(u)}
        <div>
          <div class="fw-semibold d-flex align-items-center gap-1" style="font-size:.88rem">
            <span>${u.username}</span>
            ${badgeImg}
          </div>
          <div class="text-muted" style="font-size:.7rem">#${fmtNum(u.ranking)} global</div>
        </div>
      </div>
    </td>
    <td><span class="fw-bold fs-6 text-dark">${fmtNum(u.totalSolved)}</span></td>
    ${periodCell}
    <td class="hide-mobile">${solvedPills(u)}</td>
    <td class="hide-mobile text-muted" style="font-size:.82rem">${u.lastSynced ? relativeTime(u.lastSynced) : '—'}</td>
    <td>
      <button class="btn btn-outline-danger btn-sm" onclick="event.stopPropagation();confirmRemove('${u.username}')">
        <i class="bi bi-trash3"></i>
      </button>
    </td>
  </tr>`;
};

// Render feed item
window.renderFeedItem = (s) => `
  <div class="feed-item-bs">
    <div class="feed-dot-bs ${s.difficulty}"></div>
    <div class="flex-grow-1 min-w-0">
      <div class="feed-title-bs">${s.title}</div>
      <div class="feed-meta-bs">
        <span class="feed-user-bs">@${s.username}</span>
        ${diffBadge(s.difficulty)}
        <span class="feed-lang-bs">${s.lang || ''}</span>
        <span class="feed-time-bs ms-auto">${relativeTime(s.timestamp)}</span>
      </div>
    </div>
  </div>`;

// Render user card (Bootstrap card)
window.renderUserCard = (u) => {
  const periodSection = u.periodSolved ? `
    <div class="alert alert-success py-2 px-3 border border-success-subtle mb-3" style="border-radius:10px; background-color:#eafaf1; border-color:#d5f5e3;">
      <div class="d-flex align-items-center justify-content-between mb-1">
        <span class="small fw-bold text-success-emphasis" style="font-size:0.75rem;"><i class="bi bi-calendar-check me-1"></i> Period Solved:</span>
        <span class="badge bg-success font-mono">+${u.periodSolved.total}</span>
      </div>
      <div class="period-diff-badge-container">
        <span class="period-diff-badge easy">${u.periodSolved.easy} E</span>
        <span class="period-diff-badge medium">${u.periodSolved.medium} M</span>
        <span class="period-diff-badge hard">${u.periodSolved.hard} H</span>
      </div>
    </div>
  ` : '';

  const badgeImg = u.activeBadge ? `<img src="${u.activeBadge.icon}" alt="${u.activeBadge.name}" class="user-badge-icon" title="${u.activeBadge.name}" data-bs-toggle="tooltip">` : '';
  const contestInfo = u.contestRating ? `
    <div class="text-muted mt-1" style="font-size:.71rem">
      <i class="bi bi-trophy-fill text-warning me-1" style="font-size: 11px;"></i>
      <span>Rating: <span class="fw-bold text-dark">${u.contestRating}</span> (${u.contestCount} contests)</span>
    </div>
  ` : '';

  const easyPct = u.easyTotal ? Math.min((u.easySolved / u.easyTotal) * 100, 100) : 0;
  const mediumPct = u.mediumTotal ? Math.min((u.mediumSolved / u.mediumTotal) * 100, 100) : 0;
  const hardPct = u.hardTotal ? Math.min((u.hardSolved / u.hardTotal) * 100, 100) : 0;

  return `
  <div class="col-sm-6 col-xl-4">
    <div class="card border-0 shadow-sm user-card-bs" onclick="openUserModal('${u.username}')">
      <div class="card-body p-3">
        <div class="d-flex align-items-center gap-2 mb-3">
          ${buildAvatar(u, 'lg')}
          <div class="min-w-0">
            <div class="fw-bold text-dark d-flex align-items-center gap-1" style="font-size:.95rem">
              <span>${u.username}</span>
              ${badgeImg}
            </div>
            <div class="text-muted" style="font-size:.71rem">${Icons.globe} Rank #${fmtNum(u.ranking)}</div>
            ${contestInfo}
          </div>
        </div>

        ${periodSection}

        <div class="mb-2 d-flex align-items-baseline gap-1">
          <span class="fw-black text-dark" style="font-size:1.9rem;line-height:1">${fmtNum(u.totalSolved)}</span>
          <span class="text-muted" style="font-size:.76rem">solved</span>
        </div>

        <div class="mb-3">
          <div class="diff-bar-row">
            <span class="diff-label-bs easy">Easy</span>
            <div class="diff-bar-wrap-bs"><div class="diff-bar-fill-bs easy" style="width:${easyPct}%"></div></div>
            <span class="diff-count-bs">${u.easySolved}</span>
          </div>
          <div class="diff-bar-row">
            <span class="diff-label-bs medium">Med</span>
            <div class="diff-bar-wrap-bs"><div class="diff-bar-fill-bs medium" style="width:${mediumPct}%"></div></div>
            <span class="diff-count-bs">${u.mediumSolved}</span>
          </div>
          <div class="diff-bar-row">
            <span class="diff-label-bs hard">Hard</span>
            <div class="diff-bar-wrap-bs"><div class="diff-bar-fill-bs hard" style="width:${hardPct}%"></div></div>
            <span class="diff-count-bs">${u.hardSolved}</span>
          </div>
        </div>

        <div class="d-flex align-items-center justify-content-between border-top pt-2 mt-1">
          <span class="text-muted" style="font-size:.66rem">Synced ${u.lastSynced ? relativeTime(u.lastSynced) : 'never'}</span>
          <div onclick="event.stopPropagation()">
            <button class="btn btn-outline-danger btn-sm" onclick="confirmRemove('${u.username}')">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
};

// Global escape HTML helper
window.escapeHtml = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Render Heatmap Calendar
window.renderHeatmapCalendar = (gridElement, monthsElement, submissionCalendarStr) => {
  if (!gridElement || !monthsElement) return;

  gridElement.innerHTML = '';
  monthsElement.innerHTML = '';

  let submissionCalendar = {};
  try {
    submissionCalendar = JSON.parse(submissionCalendarStr || '{}');
  } catch (e) {
    console.error('Failed to parse submissionCalendar', e);
  }

  // Convert submissionCalendar keys (Unix timestamps) to YYYY-MM-DD
  const calendarMap = {};
  for (const [timestamp, count] of Object.entries(submissionCalendar)) {
    const d = new Date(parseInt(timestamp) * 1000);
    const dateStr = d.getUTCFullYear() + '-' + 
                   String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                   String(d.getUTCDate()).padStart(2, '0');
    calendarMap[dateStr] = count;
  }

  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - 365);

  // Normalize dateCursor and todayUtc to UTC midnights
  const dateCursor = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0, 0));
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0));

  // Determine starting weekday padding (0 = Sunday, 1 = Monday, etc.)
  const startDay = dateCursor.getUTCDay();
  
  // Insert empty cells for padding
  for (let i = 0; i < startDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'heatmap-cell empty-placeholder';
    emptyCell.style.visibility = 'hidden';
    gridElement.appendChild(emptyCell);
  }

  const monthLabelPositions = {};
  let currentDayIndex = startDay;

  while (dateCursor <= todayUtc) {
    const dateStr = dateCursor.getUTCFullYear() + '-' + 
                   String(dateCursor.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                   String(dateCursor.getUTCDate()).padStart(2, '0');
                   
    const count = calendarMap[dateStr] || 0;

    let levelClass = 'level-0';
    if (count > 0 && count <= 2) levelClass = 'level-1';
    else if (count >= 3 && count <= 5) levelClass = 'level-2';
    else if (count >= 6 && count <= 10) levelClass = 'level-3';
    else if (count >= 11) levelClass = 'level-4';

    const cell = document.createElement('div');
    cell.className = `heatmap-cell ${levelClass}`;
    
    // Format date for tooltip
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    const dateFormatted = dateCursor.toLocaleDateString('en-US', options);
    const countText = count === 0 ? 'No submissions' : `${count} submission${count > 1 ? 's' : ''}`;
    
    cell.setAttribute('title', `${countText} on ${dateFormatted}`);
    cell.setAttribute('data-bs-toggle', 'tooltip');
    
    gridElement.appendChild(cell);

    // Track month labels
    if (dateCursor.getUTCDate() === 1 || (dateCursor.getTime() === Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0, 0))) {
      const colIndex = Math.floor(currentDayIndex / 7);
      const monthName = dateCursor.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
      
      // Only place label if it is far enough from previous month labels (at least 3 columns)
      const existingLabelCols = Object.values(monthLabelPositions);
      const isFarEnough = existingLabelCols.every(col => Math.abs(colIndex - col) > 3);
      
      if (isFarEnough) {
        monthLabelPositions[monthName] = colIndex;
      }
    }

    currentDayIndex++;
    dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
  }

  // Render month labels
  for (const [monthName, colIndex] of Object.entries(monthLabelPositions)) {
    const label = document.createElement('span');
    label.className = 'heatmap-month-label text-muted';
    label.style.position = 'absolute';
    label.style.left = `calc(${colIndex} * (10px + 2px))`;
    label.textContent = monthName;
    monthsElement.appendChild(label);
  }

  // Initialize Bootstrap tooltips
  try {
    const tooltipTriggerList = gridElement.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipTriggerList.forEach(tooltipTriggerEl => {
      new bootstrap.Tooltip(tooltipTriggerEl);
    });
  } catch (err) {
    console.warn('Bootstrap tooltips could not be initialized:', err);
  }
};

