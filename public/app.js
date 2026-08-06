const firebaseApp = firebase.initializeApp(firebaseConfig);
const auth = firebaseApp.auth();
const localTokenKey = 'fairvoice_local_token';
const authModeKey = 'fairvoice_auth_mode';

function querySelector(selector) {
  return document.querySelector(selector);
}

function formatStatus(status) {
  const normalized = status.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `<span class="status-pill status-${normalized}">${status}</span>`;
}

function getStoredAuthMode() {
  return localStorage.getItem(authModeKey) || 'user';
}

function setStoredAuthMode(mode) {
  localStorage.setItem(authModeKey, mode);
}

function clearLocalAuth() {
  localStorage.removeItem(localTokenKey);
  localStorage.removeItem(authModeKey);
}

function getLocalToken() {
  return localStorage.getItem(localTokenKey);
}

async function getToken() {
  const mode = getStoredAuthMode();
  if (mode === 'admin') {
    const token = getLocalToken();
    if (!token) {
      throw new Error('Not authenticated as admin');
    }
    return token;
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Not authenticated as user');
  }
  return currentUser.getIdToken();
}

async function requireLoggedIn(pageRole) {
  if (pageRole === 'user') {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = '/login.html';
        return;
      }
      if (querySelector('#user-email')) {
        querySelector('#user-email').textContent = user.email;
      }
      if (querySelector('#user-name')) {
        querySelector('#user-name').textContent = user.displayName || user.email;
      }
      if (pageRole) {
        await loadDashboard(pageRole);
      }
    });
    return;
  }

  const token = getLocalToken();
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const response = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error('Authorization failed');
    }
    const user = await response.json();
    if (querySelector('#user-email')) {
      querySelector('#user-email').textContent = user.email;
    }
    if (querySelector('#user-name')) {
      querySelector('#user-name').textContent = user.name || user.email;
    }
    await loadDashboard(pageRole);
  } catch (error) {
    console.error(error);
    clearLocalAuth();
    window.location.href = '/login.html';
  }
}

async function loadDashboard(role) {
  try {
    const token = await getToken();
    const response = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error('Authorization failed');
    }
    const user = await response.json();
    const currentUserElement = querySelector('#current-user');
    if (currentUserElement) {
      currentUserElement.textContent = user.email;
    }

    if (role === 'user') {
      await loadUserReports(token);
    } else {
      await loadAdminReports(token);
    }
  } catch (error) {
    console.error(error);
    alert('Unable to load dashboard. Please sign in again.');
    clearLocalAuth();
    await auth.signOut();
    window.location.href = '/login.html';
  }
}

async function loadUserReports(token) {
  const response = await fetch('/api/reports', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const reports = await response.json();
  const tableBody = querySelector('#report-list tbody');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  for (const report of reports) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${report.id}</td>
      <td>${report.title}</td>
      <td>${report.assigned_level}</td>
      <td>${formatStatus(report.status)}</td>
      <td>${new Date(report.created_at).toLocaleString()}</td>
      <td>${report.evidence_path ? `<a href="${report.evidence_path}" target="_blank">View</a>` : 'None'}</td>
      <td>${report.notes ? report.notes.replace(/\n/g, '<br>') : '—'}</td>
      <td>${report.status.includes('Escalated') ? '<button class="secondary" disabled>Escalated</button>' : `<button class="secondary" onclick="escalateReport(${report.id})">Escalate</button>`}</td>
    `;
    tableBody.appendChild(row);
  }
}

async function loadAdminReports(token) {
  const response = await fetch('/api/reports/all', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const reports = await response.json();
  const tableBody = querySelector('#admin-report-list tbody');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  for (const report of reports) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${report.id}</td>
      <td>${report.title}</td>
      <td>${report.user_email}</td>
      <td>${report.assigned_level}</td>
      <td>${formatStatus(report.status)}</td>
      <td>${new Date(report.created_at).toLocaleString()}</td>
      <td>${report.evidence_path ? `<a href="${report.evidence_path}" target="_blank">View</a>` : 'None'}</td>
      <td>${report.notes ? report.notes.replace(/\n/g, '<br>') : '—'}</td>
      <td><button onclick="showActionForm(${report.id})">Take action</button></td>
    `;
    tableBody.appendChild(row);
  }
}

async function uploadEvidence(event) {
  event.preventDefault();
  const fileInput = querySelector('#evidence');
  const file = fileInput.files[0];
  if (!file) {
    alert('Please select a file to upload.');
    return;
  }
  const token = await getToken();
  const formData = new FormData();
  formData.append('evidence', file);
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    alert(error.error || 'Upload failed');
    return;
  }
  const result = await response.json();
  querySelector('#evidence-path').value = result.url;
  alert('Evidence uploaded. Now submit the report.');
}

async function submitReport(event) {
  event.preventDefault();
  const title = querySelector('#report-title').value.trim();
  const description = querySelector('#report-description').value.trim();
  const evidence_path = querySelector('#evidence-path').value.trim();
  if (!title || !description) {
    alert('Please provide both title and description.');
    return;
  }
  const token = await getToken();
  const response = await fetch('/api/reports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title, description, evidence_path }),
  });
  if (!response.ok) {
    const error = await response.json();
    alert(error.error || 'Could not create report');
    return;
  }
  querySelector('#new-report-form').reset();
  querySelector('#evidence-path').value = '';
  alert('Report submitted successfully.');
  await loadUserReports(token);
}

async function escalateReport(reportId) {
  const target = prompt('Escalate to which level? Enter Administrator, Suprime Administrator, or NGO/INGO');
  if (!target) return;
  const level = target.trim();
  if (!['Administrator', 'Suprime Administrator', 'NGO/INGO'].includes(level)) {
    alert('Invalid escalation target.');
    return;
  }
  const token = await getToken();
  const response = await fetch(`/api/reports/${reportId}/escalate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ level }),
  });
  if (!response.ok) {
    const error = await response.json();
    alert(error.error || 'Could not escalate report');
    return;
  }
  alert('Report escalated.');
  await loadUserReports(token);
}

function showActionForm(reportId) {
  querySelector('#selected-report-id').value = reportId;
  querySelector('#action-modal').classList.remove('hidden');
}

async function submitAction(event) {
  event.preventDefault();
  const reportId = querySelector('#selected-report-id').value;
  const status = querySelector('#action-status').value;
  const notes = querySelector('#action-notes').value.trim();
  if (!reportId || !status) {
    alert('Choose an action and report first.');
    return;
  }
  const token = await getToken();
  const response = await fetch(`/api/reports/${reportId}/action`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, notes }),
  });
  if (!response.ok) {
    const error = await response.json();
    alert(error.error || 'Could not update report');
    return;
  }
  querySelector('#action-modal').classList.add('hidden');
  querySelector('#action-form').reset();
  alert('Report updated successfully.');
  await loadAdminReports(token);
}

function closeActionModal() {
  querySelector('#action-modal').classList.add('hidden');
}

async function signOut() {
  clearLocalAuth();
  await auth.signOut();
  window.location.href = '/login.html';
}

async function handleLogin(event) {
  event.preventDefault();
  const email = querySelector('#email').value.trim();
  const password = querySelector('#password').value.trim();
  const authType = document.querySelector('input[name="auth-type"]:checked').value;
  const mode = document.querySelector('input[name="auth-mode"]:checked').value;

  try {
    if (authType === 'admin') {
      if (mode === 'signin') {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Admin sign in failed');
        }
        const result = await response.json();
        localStorage.setItem(localTokenKey, result.token);
        setStoredAuthMode('admin');
        routeAdminUser(result.role);
        return;
      }

      const setupKey = querySelector('#setup-key').value.trim();
      const role = querySelector('#admin-role').value;
      const name = querySelector('#name').value.trim() || email.split('@')[0];
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, role, setupKey }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Admin registration failed');
      }
      const result = await response.json();
      localStorage.setItem(localTokenKey, result.token);
      setStoredAuthMode('admin');
      routeAdminUser(result.role);
      return;
    }

    if (mode === 'signin') {
      await auth.signInWithEmailAndPassword(email, password);
    } else {
      await auth.createUserWithEmailAndPassword(email, password);
      const currentUser = auth.currentUser;
        const name = querySelector('#name').value.trim() || email.split('@')[0];
        if (currentUser) {
          await currentUser.updateProfile({ displayName: name });
        }
      }
    setStoredAuthMode('user');
    window.location.href = '/user.html';
  } catch (error) {
    alert(error.message || 'Authentication failed');
  }
}

function routeAdminUser(role) {
  if (role === 'Administrator') {
    window.location.href = '/admin.html';
  } else if (role === 'Suprime Administrator') {
    window.location.href = '/superadmin.html';
  } else if (role === 'NGO/INGO') {
    window.location.href = '/ngo.html';
  } else {
    window.location.href = '/login.html';
  }
}

function updateAdminLoginFields() {
  const authType = document.querySelector('input[name="auth-type"]:checked').value;
  const mode = document.querySelector('input[name="auth-mode"]:checked').value;
  const setupKeyRow = querySelector('#setup-key-row');
  const adminRoleRow = querySelector('#admin-role-row');
  const authModeLabels = document.querySelectorAll('.mode-label');

  if (authType === 'admin') {
    authModeLabels.forEach((label) => label.classList.remove('hidden'));
    if (mode === 'signup') {
      setupKeyRow.classList.remove('hidden');
      adminRoleRow.classList.remove('hidden');
    } else {
      setupKeyRow.classList.add('hidden');
      adminRoleRow.classList.add('hidden');
    }
  } else {
    setupKeyRow.classList.add('hidden');
    adminRoleRow.classList.add('hidden');
    authModeLabels.forEach((label) => label.classList.remove('hidden'));
  }
}

window.app = {
  requireLoggedIn,
  uploadEvidence,
  submitReport,
  submitAction,
  closeActionModal,
  signOut,
  handleLogin,
  updateAdminLoginFields,
};
