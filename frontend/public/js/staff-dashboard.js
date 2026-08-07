/* ============================================================
   Shared logic for the three staff dashboards (Administrator,
   Supreme Administrator, NGO/INGO). Each page calls
   initStaffDashboard(config) with role-specific action labels.
   ============================================================ */

function initStaffDashboard(config) {
  const user = Auth.guard([config.role]);
  if (!user) return;

  let queueCache = [];
  let allCache = [];

  function route() {
    const hash = (window.location.hash || '#queue').slice(1);
    mountSidebar(user, hash);

    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

    if (hash === 'queue') {
      show('viewQueue');
      setTitle('My Queue', 'Cases currently assigned to you, ordered by priority.');
      loadQueue();
    } else if (hash === 'all') {
      show('viewAll');
      setTitle('All Reports', 'Full oversight list across every stage, for accountability.');
      loadAll();
    } else if (hash === 'resources') {
      show('viewResources');
      setTitle('Support Resources', 'Resources you can point employees to.');
      loadResources();
    } else if (hash === 'staff' && config.role === 'supreme_admin') {
      show('viewStaff');
      setTitle('Manage Staff Accounts', 'Create and manage Administrator, Supreme Administrator, and NGO accounts.');
      loadStaff();
    } else {
      window.location.hash = '#queue';
    }
    loadStats();
  }
  window.addEventListener('hashchange', route);

  function show(id) { const el = document.getElementById(id); if (el) el.style.display = 'block'; }
  function setTitle(t, s) {
    document.getElementById('pageTitle').textContent = t;
    document.getElementById('pageSub').textContent = s;
  }

  async function loadStats() {
    try {
      const s = await apiFetch('/reports/stats');
      document.getElementById('statQueue').textContent = s.pendingInQueue;
      document.getElementById('statHigh').textContent = s.highPriority;
      document.getElementById('statResolved').textContent = s.resolvedByYou;
      document.getElementById('statTotal').textContent = s.totalPlatformReports;
    } catch (err) { /* non-fatal */ }
  }

  async function loadQueue() {
    const mount = document.getElementById('queueMount');
    mount.innerHTML = '<div class="loader"><div class="spinner"></div> Loading your queue…</div>';
    try {
      const data = await apiFetch('/reports/queue');
      queueCache = data.queue;
      if (queueCache.length === 0) {
        mount.innerHTML = `<div class="empty-state"><div class="icon">✅</div><p>Your queue is empty. Nice work.</p></div>`;
        return;
      }
      mount.innerHTML = `<div class="report-list">${queueCache.map(reportRowHtml).join('')}</div>`;
      mount.querySelectorAll('.report-row').forEach(row => {
        row.addEventListener('click', () => openStaffReportDetail(row.dataset.id, true));
      });
    } catch (err) {
      mount.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
    }
  }

  async function loadAll() {
    const mount = document.getElementById('allMount');
    mount.innerHTML = '<div class="loader"><div class="spinner"></div> Loading all reports…</div>';
    try {
      const data = await apiFetch('/reports/all');
      allCache = data.reports;
      renderAllFiltered();
    } catch (err) {
      mount.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
    }
  }

  function renderAllFiltered(filter) {
    const mount = document.getElementById('allMount');
    let rows = allCache;
    if (filter && filter !== 'all') rows = rows.filter(r => r.status === filter);
    if (rows.length === 0) {
      mount.innerHTML = `<div class="empty-state"><p>No reports match this filter.</p></div>`;
      return;
    }
    mount.innerHTML = `<div class="report-list">${rows.map(reportRowHtml).join('')}</div>`;
    mount.querySelectorAll('.report-row').forEach(row => {
      row.addEventListener('click', () => openStaffReportDetail(row.dataset.id, false));
    });
  }

  const allFilterTabs = [
    { key: 'all', label: 'All' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'escalated_supreme', label: 'Escalated to Supreme' },
    { key: 'escalated_ngo', label: 'Escalated to NGO' },
    { key: 'legal_action', label: 'Legal Action' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' }
  ];
  function renderAllTabs() {
    const mount = document.getElementById('allFilterTabs');
    mount.innerHTML = allFilterTabs.map((f, i) => `<button class="filter-tab ${i === 0 ? 'active' : ''}" data-key="${f.key}">${f.label}</button>`).join('');
    mount.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        mount.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderAllFiltered(btn.dataset.key);
      });
    });
  }

  async function openStaffReportDetail(id, isOwnQueue) {
    ensureModalMount();
    openReportModalRaw('<div class="loader"><div class="spinner"></div> Loading report…</div>');
    try {
      const data = await apiFetch(`/reports/${id}`);
      const r = data.report;
      const canAct = isOwnQueue && r.current_level === config.role && !['resolved', 'closed', 'legal_action'].includes(r.status);

      openReportModalRaw(`
        <h3>${escapeHtml(r.title)}</h3>
        <p style="color:#6b7f81;font-size:0.85rem;font-family:var(--font-mono);margin-bottom:18px;">${r.report_code}</p>
        ${ladderHtml(r.current_level)}
        <div class="kv">
          <dt>Status</dt><dd>${pillHtml(r.status)}</dd>
          <dt>Category</dt><dd>${CATEGORY_LABELS[r.category] || humanize(r.category)}</dd>
          <dt>Priority</dt><dd>${priorityHtml(r.priority)}</dd>
          <dt>Reported by</dt><dd>${r.is_anonymous ? 'Anonymous' : escapeHtml(r.reporter_name || 'Unknown')}</dd>
          <dt>Department</dt><dd>${escapeHtml(r.reporter_department || '—')}</dd>
          <dt>Filed on</dt><dd>${formatDate(r.created_at)}</dd>
          <dt>Location</dt><dd>${escapeHtml(r.location || '—')}</dd>
          <dt>Concerning</dt><dd>${escapeHtml(r.accused_info || '—')}</dd>
        </div>
        <p style="margin-top:14px;">${escapeHtml(r.description)}</p>
        <h4 style="margin-top:20px;">Evidence</h4>
        ${evidenceListHtml(data.evidence, r.id)}
        <h4 style="margin-top:20px;">Case Timeline</h4>
        ${timelineHtml(data.timeline)}

        ${canAct ? `
          <h4 style="margin-top:20px;">Take Action</h4>
          <div class="action-box">
            <textarea id="actionNote" placeholder="Add a note about this action (required for escalation, resolution, and closure)"></textarea>
            <div class="action-row">
              <button class="btn btn-secondary btn-sm" data-action="comment">Add Comment</button>
              ${config.canEscalate ? `<button class="btn btn-outline btn-sm" data-action="escalate">Escalate to ${config.escalateLabel}</button>` : ''}
              ${config.canLegalAction ? `<button class="btn btn-outline btn-sm" data-action="legal_action">Refer to Legal Action</button>` : ''}
              <button class="btn btn-primary btn-sm" data-action="resolve">Mark Resolved</button>
              <button class="btn btn-danger btn-sm" data-action="closed">Close Case</button>
            </div>
          </div>
        ` : ''}
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeReportModal()">Close</button>
        </div>
      `);

      if (canAct) {
        document.querySelectorAll('[data-action]').forEach(btn => {
          btn.addEventListener('click', () => submitAction(id, btn.dataset.action, btn));
        });
      }
    } catch (err) {
      openReportModalRaw(`<p>${err.message}</p><div class="modal-actions"><button class="btn btn-secondary" onclick="closeReportModal()">Close</button></div>`);
    }
  }

  async function submitAction(id, actionType, btn) {
    const note = document.getElementById('actionNote').value.trim();
    if (['escalate', 'resolve', 'closed', 'legal_action'].includes(actionType) && !note) {
      toast('Please add a short note before taking this action.', 'error');
      return;
    }
    const originalText = btn.textContent;
    document.querySelectorAll('[data-action]').forEach(b => b.disabled = true);
    btn.textContent = 'Working…';
    try {
      const res = await apiFetch(`/reports/${id}/actions`, { method: 'POST', body: { action_type: actionType, note } });
      toast(res.message || 'Action recorded.', 'success');
      closeReportModal();
      loadQueue();
      loadStats();
      if (document.getElementById('viewAll').style.display === 'block') loadAll();
    } catch (err) {
      toast(err.message, 'error');
      document.querySelectorAll('[data-action]').forEach(b => b.disabled = false);
      btn.textContent = originalText;
    }
  }

  async function loadResources() {
    const mount = document.getElementById('resourceMount');
    try {
      const data = await apiFetch('/resources');
      mount.innerHTML = `<div class="resource-grid">${data.resources.map(r => `
        <div class="resource-card">
          <div class="rtype">${humanize(r.resource_type)}</div>
          <h3>${escapeHtml(r.title)}</h3>
          <p style="font-size:0.88rem;color:#55696c;">${escapeHtml(r.description || '')}</p>
          ${r.contact_info ? `<div class="contact">${escapeHtml(r.contact_info)}</div>` : ''}
        </div>
      `).join('')}</div>`;
    } catch (err) {
      mount.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
    }
  }

  /* -------- Supreme Admin only: staff management -------- */
  async function loadStaff() {
    const mount = document.getElementById('staffMount');
    if (!mount) return;
    mount.innerHTML = '<div class="loader"><div class="spinner"></div> Loading staff accounts…</div>';
    try {
      const data = await apiFetch('/users/staff');
      if (data.staff.length === 0) {
        mount.innerHTML = `<div class="empty-state"><p>No staff accounts yet.</p></div>`;
      } else {
        mount.innerHTML = `<div class="report-list">${data.staff.map(s => `
          <div class="report-row" style="cursor:default;">
            <div class="rr-main">
              <div class="rr-title">${escapeHtml(s.full_name)}</div>
              <div class="rr-meta"><span>${escapeHtml(s.email)}</span><span>${humanize(s.role)}</span><span>${escapeHtml(s.department || '')}</span></div>
            </div>
            <span class="pill ${s.is_active ? 'pill-resolved' : 'pill-closed'}">${s.is_active ? 'Active' : 'Disabled'}</span>
            <button class="btn btn-secondary btn-sm" data-toggle="${s.id}" data-active="${s.is_active}">${s.is_active ? 'Disable' : 'Enable'}</button>
          </div>
        `).join('')}</div>`;
        mount.querySelectorAll('[data-toggle]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.toggle;
            const isActive = btn.dataset.active === '1' || btn.dataset.active === 'true';
            try {
              await apiFetch(`/users/staff/${id}/active`, { method: 'PATCH', body: { is_active: !isActive } });
              toast('Staff account updated.', 'success');
              loadStaff();
            } catch (err) { toast(err.message, 'error'); }
          });
        });
      }
    } catch (err) {
      mount.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
    }

    const form = document.getElementById('createStaffForm');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = document.getElementById('staffError');
        errBox.classList.remove('show');
        const btn = document.getElementById('createStaffBtn');
        btn.disabled = true; btn.textContent = 'Creating…';
        try {
          const payload = {
            full_name: document.getElementById('staffName').value.trim(),
            email: document.getElementById('staffEmail').value.trim(),
            password: document.getElementById('staffPassword').value,
            role: document.getElementById('staffRole').value,
            department: document.getElementById('staffDepartment').value.trim()
          };
          await apiFetch('/users/staff', { method: 'POST', body: payload });
          toast('Staff account created.', 'success');
          form.reset();
          loadStaff();
        } catch (err) {
          errBox.textContent = err.message;
          errBox.classList.add('show');
        } finally {
          btn.disabled = false; btn.textContent = 'Create staff account';
        }
      });
    }
  }

  renderAllTabs();
  route();
}
