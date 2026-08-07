(function () {
  const user = Auth.guard(['end_user']);
  if (!user) return;

  let selectedFiles = [];
  let myReportsCache = [];
  let currentFilter = 'all';

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'admin', label: 'Sent to Administrator' },
    { key: 'supreme_admin', label: 'Sent to Supreme Admin' },
    { key: 'ngo', label: 'Sent to NGO/INGO' },
    { key: 'resolved', label: 'Resolved' }
  ];

  function route() {
    const hash = (window.location.hash || '#new').slice(1);
    const activeKey = ['admin', 'supreme_admin', 'ngo'].includes(hash) ? hash : (hash === 'mine' ? 'mine' : hash);
    mountSidebar(user, activeKey);

    document.getElementById('viewNew').style.display = 'none';
    document.getElementById('viewList').style.display = 'none';
    document.getElementById('viewResources').style.display = 'none';

    if (hash === 'new') {
      document.getElementById('viewNew').style.display = 'block';
      document.getElementById('pageTitle').textContent = 'New Report';
      document.getElementById('pageSub').textContent = 'File a confidential report. You control how much you share.';
    } else if (hash === 'resources') {
      document.getElementById('viewResources').style.display = 'block';
      document.getElementById('pageTitle').textContent = 'Support Resources';
      document.getElementById('pageSub').textContent = 'Confidential help is available whenever you need it.';
      loadResources();
    } else {
      // mine, admin, supreme_admin, ngo -> all render the list view with a preset filter
      document.getElementById('viewList').style.display = 'block';
      currentFilter = ['admin', 'supreme_admin', 'ngo'].includes(hash) ? hash : 'all';
      document.getElementById('pageTitle').textContent = 'My Reports';
      document.getElementById('pageSub').textContent = 'Track every report you have filed and its current stage.';
      renderFilterTabs();
      loadMyReports();
    }
  }
  window.addEventListener('hashchange', route);

  function renderFilterTabs() {
    const mount = document.getElementById('filterTabs');
    mount.innerHTML = FILTERS.map(f => `<button class="filter-tab ${f.key === currentFilter ? 'active' : ''}" data-key="${f.key}">${f.label}</button>`).join('');
    mount.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.key;
        renderFilterTabs();
        renderMyReportsList();
      });
    });
  }

  async function loadMyReports() {
    const mount = document.getElementById('reportListMount');
    mount.innerHTML = '<div class="loader"><div class="spinner"></div> Loading your reports…</div>';
    try {
      const data = await apiFetch('/reports/mine');
      myReportsCache = data.reports;
      renderMyReportsList();
    } catch (err) {
      mount.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
    }
  }

  function renderMyReportsList() {
    const mount = document.getElementById('reportListMount');
    let rows = myReportsCache;
    if (currentFilter === 'resolved') {
      rows = rows.filter(r => r.status === 'resolved' || r.status === 'closed');
    } else if (currentFilter !== 'all') {
      rows = rows.filter(r => r.current_level === currentFilter && r.status !== 'resolved' && r.status !== 'closed');
    }

    if (rows.length === 0) {
      mount.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>No reports here yet.</p></div>`;
      return;
    }
    mount.innerHTML = `<div class="report-list">${rows.map(reportRowHtml).join('')}</div>`;
    mount.querySelectorAll('.report-row').forEach(row => {
      row.addEventListener('click', () => openMyReportDetail(row.dataset.id));
    });
  }

  async function openMyReportDetail(id) {
    ensureModalMount();
    openReportModalRaw('<div class="loader"><div class="spinner"></div> Loading report…</div>');
    try {
      const data = await apiFetch(`/reports/${id}`);
      const r = data.report;
      const canEscalate = !['resolved', 'closed', 'legal_action'].includes(r.status) && r.current_level !== 'ngo';
      openReportModalRaw(`
        <h3>${escapeHtml(r.title)}</h3>
        <p style="color:#6b7f81;font-size:0.85rem;font-family:var(--font-mono);margin-bottom:18px;">${r.report_code}</p>
        ${ladderHtml(r.current_level)}
        <div class="kv">
          <dt>Status</dt><dd>${pillHtml(r.status)}</dd>
          <dt>Category</dt><dd>${CATEGORY_LABELS[r.category] || humanize(r.category)}</dd>
          <dt>Priority</dt><dd>${priorityHtml(r.priority)}</dd>
          <dt>Filed on</dt><dd>${formatDate(r.created_at)}</dd>
          <dt>Anonymous</dt><dd>${r.is_anonymous ? 'Yes' : 'No'}</dd>
        </div>
        <p style="margin-top:14px;">${escapeHtml(r.description)}</p>
        <h4 style="margin-top:20px;">Evidence</h4>
        ${evidenceListHtml(data.evidence, r.id)}
        <h4 style="margin-top:20px;">Case Timeline</h4>
        ${timelineHtml(data.timeline)}
        ${canEscalate ? `
          <div class="modal-actions" style="justify-content:flex-start; margin-top:22px;">
            <button class="btn btn-danger btn-sm" id="escalateBtn">Not resolved — escalate this case</button>
          </div>
        ` : ''}
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeReportModal()">Close</button>
        </div>
      `);
      const escBtn = document.getElementById('escalateBtn');
      if (escBtn) {
        escBtn.addEventListener('click', async () => {
          escBtn.disabled = true;
          escBtn.textContent = 'Escalating…';
          try {
            const res = await apiFetch(`/reports/${id}/self-escalate`, { method: 'POST' });
            toast(res.message, 'success');
            closeReportModal();
            loadMyReports();
          } catch (err) {
            toast(err.message, 'error');
            escBtn.disabled = false;
            escBtn.textContent = 'Not resolved — escalate this case';
          }
        });
      }
    } catch (err) {
      openReportModalRaw(`<p>${err.message}</p><div class="modal-actions"><button class="btn btn-secondary" onclick="closeReportModal()">Close</button></div>`);
    }
  }
  window.openMyReportDetail = openMyReportDetail;

  async function loadResources() {
    const mount = document.getElementById('resourceMount');
    try {
      const data = await apiFetch('/resources');
      if (data.resources.length === 0) {
        mount.innerHTML = `<div class="empty-state"><p>No resources published yet.</p></div>`;
        return;
      }
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

  /* ---------------- New report form ---------------- */
  const fileDrop = document.getElementById('fileDrop');
  const fileInput = document.getElementById('fileInput');
  const fileChipList = document.getElementById('fileChipList');

  fileDrop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    for (const f of fileInput.files) {
      if (selectedFiles.length >= 5) { toast('You can attach up to 5 files.', 'error'); break; }
      selectedFiles.push(f);
    }
    fileInput.value = '';
    renderChips();
  });
  function renderChips() {
    fileChipList.innerHTML = selectedFiles.map((f, i) => `
      <span class="file-chip">${escapeHtml(f.name)} <button type="button" data-i="${i}">×</button></span>
    `).join('');
    fileChipList.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedFiles.splice(Number(btn.dataset.i), 1);
        renderChips();
      });
    });
  }

  const reportForm = document.getElementById('reportForm');
  const reportError = document.getElementById('reportError');
  const reportSuccess = document.getElementById('reportSuccess');
  const submitBtn = document.getElementById('submitReportBtn');

  reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    reportError.classList.remove('show');
    reportSuccess.classList.remove('show');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const fd = new FormData();
      fd.append('category', document.getElementById('category').value);
      fd.append('title', document.getElementById('title').value.trim());
      fd.append('description', document.getElementById('description').value.trim());
      fd.append('incident_date', document.getElementById('incident_date').value);
      fd.append('priority', document.getElementById('priority').value);
      fd.append('location', document.getElementById('location').value.trim());
      fd.append('accused_info', document.getElementById('accused_info').value.trim());
      fd.append('is_anonymous', document.getElementById('is_anonymous').checked);
      selectedFiles.forEach(f => fd.append('evidence', f));

      const data = await apiFetch('/reports', { method: 'POST', body: fd, isFormData: true });
      reportSuccess.textContent = `${data.message} Tracking code: ${data.report.report_code}`;
      reportSuccess.classList.add('show');
      reportForm.reset();
      selectedFiles = [];
      renderChips();
      toast('Report submitted.', 'success');
    } catch (err) {
      reportError.textContent = err.message;
      reportError.classList.add('show');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit report securely';
    }
  });

  route();
})();
