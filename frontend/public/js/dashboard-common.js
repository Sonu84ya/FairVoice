/* ============================================================
   Shared dashboard chrome used by all four dashboards:
   sidebar rendering, status pills, escalation ladder, and a
   reusable report-detail modal.
   ============================================================ */

const NAV_CONFIG = {
  end_user: {
    roleTag: 'Employee',
    groups: [
      { label: 'Report', items: [
        { key: 'new', label: 'New Report', icon: '✎', href: 'user-dashboard.html#new' },
        { key: 'mine', label: 'View My Reports', icon: '☰', href: 'user-dashboard.html#mine' }
      ]},
      { label: 'Case stages', items: [
        { key: 'admin', label: 'Sent to Administrator', icon: '①', href: 'user-dashboard.html#admin' },
        { key: 'supreme_admin', label: 'Sent to Supreme Admin', icon: '②', href: 'user-dashboard.html#supreme_admin' },
        { key: 'ngo', label: 'Sent to NGO / INGO', icon: '③', href: 'user-dashboard.html#ngo' }
      ]},
      { label: 'Support', items: [
        { key: 'resources', label: 'Support Resources', icon: '♥', href: 'user-dashboard.html#resources' }
      ]}
    ]
  },
  admin: {
    roleTag: 'Administrator',
    groups: [
      { label: 'Reports', items: [
        { key: 'queue', label: 'My Queue', icon: '☰', href: 'admin-dashboard.html#queue' },
        { key: 'all', label: 'All Reports', icon: '⊞', href: 'admin-dashboard.html#all' }
      ]},
      { label: 'Support', items: [
        { key: 'resources', label: 'Support Resources', icon: '♥', href: 'admin-dashboard.html#resources' }
      ]}
    ]
  },
  supreme_admin: {
    roleTag: 'Supreme Administrator',
    groups: [
      { label: 'Reports', items: [
        { key: 'queue', label: 'Escalated to Me', icon: '☰', href: 'supreme-admin-dashboard.html#queue' },
        { key: 'all', label: 'All Reports', icon: '⊞', href: 'supreme-admin-dashboard.html#all' }
      ]},
      { label: 'Administration', items: [
        { key: 'staff', label: 'Manage Staff Accounts', icon: '⚙', href: 'supreme-admin-dashboard.html#staff' }
      ]},
      { label: 'Support', items: [
        { key: 'resources', label: 'Support Resources', icon: '♥', href: 'supreme-admin-dashboard.html#resources' }
      ]}
    ]
  },
  ngo: {
    roleTag: 'NGO / INGO Partner',
    groups: [
      { label: 'Cases', items: [
        { key: 'queue', label: 'Escalated Cases', icon: '☰', href: 'ngo-dashboard.html#queue' },
        { key: 'all', label: 'All Reports', icon: '⊞', href: 'ngo-dashboard.html#all' }
      ]},
      { label: 'Support', items: [
        { key: 'resources', label: 'Support Resources', icon: '♥', href: 'ngo-dashboard.html#resources' }
      ]}
    ]
  }
};

function renderSidebar(user, activeKey, badgeCounts = {}) {
  const cfg = NAV_CONFIG[user.role];
  const groupsHtml = cfg.groups.map(g => `
    <div class="nav-group">
      <div class="label">${g.label}</div>
      ${g.items.map(item => `
        <a class="nav-link ${item.key === activeKey ? 'active' : ''}" href="${item.href}" data-key="${item.key}">
          <span aria-hidden="true">${item.icon}</span>
          <span>${item.label}</span>
          ${badgeCounts[item.key] ? `<span class="badge">${badgeCounts[item.key]}</span>` : ''}
        </a>
      `).join('')}
    </div>
  `).join('');

  return `
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <div class="mark">GE</div>
        <div>
          <div class="name">Safe Reporting</div>
          <div class="role-tag">${cfg.roleTag}</div>
        </div>
      </div>
      ${groupsHtml}
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="avatar">${initials(user.full_name)}</div>
          <div class="who">
            <div class="name">${user.full_name}</div>
            <div class="email">${user.email}</div>
          </div>
        </div>
        <button class="nav-link" id="logoutBtn" style="width:100%;">
          <span aria-hidden="true">⏻</span><span>Sign out</span>
        </button>
      </div>
    </aside>
  `;
}

function mountSidebar(user, activeKey, badgeCounts) {
  document.getElementById('sidebarMount').innerHTML = renderSidebar(user, activeKey, badgeCounts);
  document.getElementById('logoutBtn').addEventListener('click', Auth.logout);
  const menuBtn = document.getElementById('mobileMenuBtn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }
}

function pillHtml(status) {
  return `<span class="pill pill-${status}">${humanize(status)}</span>`;
}
function priorityHtml(priority) {
  return `<span class="priority-dot priority-${priority}">${humanize(priority)}</span>`;
}

function reportRowHtml(r) {
  const reporterLine = r.is_anonymous
    ? 'Anonymous report'
    : (r.reporter_name ? `Filed by ${r.reporter_name}${r.reporter_department ? ' · ' + r.reporter_department : ''}` : '');
  return `
    <div class="report-row" data-id="${r.id}">
      <div class="rr-main">
        <div class="rr-code">${r.report_code || ''}</div>
        <div class="rr-title">${escapeHtml(r.title)}</div>
        <div class="rr-meta">
          <span>${CATEGORY_LABELS[r.category] || humanize(r.category)}</span>
          ${reporterLine ? `<span>${reporterLine}</span>` : ''}
          <span>${formatDate(r.created_at)}</span>
        </div>
      </div>
      ${priorityHtml(r.priority)}
      ${pillHtml(r.status)}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function ladderHtml(currentLevel) {
  const steps = [
    { key: 'admin', label: 'Administrator' },
    { key: 'supreme_admin', label: 'Supreme Admin' },
    { key: 'ngo', label: 'NGO / INGO' }
  ];
  const order = ['admin', 'supreme_admin', 'ngo', 'closed'];
  const currentIdx = order.indexOf(currentLevel);
  return `
    <div class="ladder">
      ${steps.map((s, i) => {
        const stepIdx = order.indexOf(s.key);
        const done = currentLevel === 'closed' || stepIdx < currentIdx;
        const current = stepIdx === currentIdx;
        return `
          <div class="ladder-step ${done ? 'done' : ''} ${current ? 'current' : ''}">
            <div class="ladder-line"></div>
            <div class="dot">${done && !current ? '✓' : i + 1}</div>
            <div class="label">${s.label}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ---------------- Report detail modal (shared) ---------------- */
function ensureModalMount() {
  if (document.getElementById('reportModal')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="modal-backdrop" id="reportModal">
      <div class="modal" id="reportModalBody"></div>
    </div>
  `;
  document.body.appendChild(div);
  document.getElementById('reportModal').addEventListener('click', (e) => {
    if (e.target.id === 'reportModal') closeReportModal();
  });
}
function closeReportModal() {
  const el = document.getElementById('reportModal');
  if (el) el.classList.remove('open');
}
function openReportModalRaw(innerHtml) {
  ensureModalMount();
  document.getElementById('reportModalBody').innerHTML = innerHtml;
  document.getElementById('reportModal').classList.add('open');
}

function timelineHtml(timeline) {
  if (!timeline || timeline.length === 0) return '<p style="color:#8b9c9e;font-size:0.85rem;">No activity yet.</p>';
  return `<div class="timeline">${timeline.map(t => `
    <div class="tl-item ${t.action_type}">
      <div class="tl-dot"></div>
      <div class="tl-body">
        <div class="tl-head">${humanize(t.action_type)} ${t.actor_name ? '· ' + escapeHtml(t.actor_name) : (t.actor_role ? '· ' + humanize(t.actor_role) : '')}</div>
        <div class="tl-when">${formatDateTime(t.created_at)}</div>
        ${t.note ? `<div class="tl-note">${escapeHtml(t.note)}</div>` : ''}
      </div>
    </div>
  `).join('')}</div>`;
}

function evidenceListHtml(evidence, reportId) {
  if (!evidence || evidence.length === 0) return '<p style="color:#8b9c9e;font-size:0.85rem;">No evidence attached.</p>';
  return `<div class="evidence-list">${evidence.map(ev => `
    <div class="evidence-item">
      <span>📎 ${escapeHtml(ev.original_name)} <span style="color:#8b9c9e;">(${formatBytes(ev.size_bytes)})</span></span>
      <button class="btn btn-secondary btn-sm" onclick="downloadEvidence(${reportId}, ${ev.id})">Download</button>
    </div>
  `).join('')}</div>`;
}

async function downloadEvidence(reportId, evidenceId) {
  const token = Auth.getToken();
  try {
    const res = await fetch(`${API_BASE}/reports/${reportId}/evidence/${evidenceId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Could not download this file.');
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : 'evidence-file';
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    toast(err.message, 'error');
  }
}
