/* ============================================================
   Shared API client + small utilities used across every dashboard.
   Configure the backend URL once here.
   ============================================================ */
const API_BASE = window.API_BASE_OVERRIDE || 'http://localhost:4000/api';

const Auth = {
  getToken() { return localStorage.getItem('gep_token'); },
  getUser() {
    try { return JSON.parse(localStorage.getItem('gep_user') || 'null'); }
    catch { return null; }
  },
  setSession(token, user) {
    localStorage.setItem('gep_token', token);
    localStorage.setItem('gep_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('gep_token');
    localStorage.removeItem('gep_user');
  },
  logout() {
    Auth.clear();
    window.location.href = 'index.html';
  },
  /**
   * Call at the top of every dashboard page. Redirects to login if not
   * authenticated, and redirects away if the role doesn't match the page.
   */
  guard(allowedRoles) {
    const token = Auth.getToken();
    const user = Auth.getUser();
    if (!token || !user) {
      window.location.href = 'index.html';
      return null;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      window.location.href = roleHome(user.role);
      return null;
    }
    return user;
  }
};

function roleHome(role) {
  switch (role) {
    case 'end_user': return 'user-dashboard.html';
    case 'admin': return 'admin-dashboard.html';
    case 'supreme_admin': return 'supreme-admin-dashboard.html';
    case 'ngo': return 'ngo-dashboard.html';
    default: return 'index.html';
  }
}

/**
 * Core fetch wrapper. Automatically attaches the JWT, handles JSON vs
 * FormData bodies, and normalizes error messages.
 */
async function apiFetch(path, { method = 'GET', body = null, isFormData = false } = {}) {
  const headers = {};
  const token = Auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData && body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
    });
  } catch (networkErr) {
    throw new Error('Could not reach the server. Please check your connection and that the backend is running.');
  }

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (res.status === 401) {
    Auth.clear();
    window.location.href = 'index.html';
    throw new Error('Session expired.');
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

/* ---------------- Toasts ---------------- */
function toast(message, type = 'info') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------------- Formatting helpers ---------------- */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function humanize(str) {
  if (!str) return '';
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

const CATEGORY_LABELS = {
  harassment: 'Harassment',
  gender_discrimination: 'Gender Discrimination',
  bullying: 'Bullying',
  abuse: 'Abuse',
  unfair_treatment: 'Unfair Treatment',
  mental_harassment: 'Mental Harassment',
  toxic_workplace: 'Toxic Workplace Behaviour',
  safety_violation: 'Safety Violation',
  other: 'Other Misconduct'
};

const LEVEL_LABELS = { admin: 'Administrator', supreme_admin: 'Supreme Administrator', ngo: 'NGO / INGO', closed: 'Closed' };
