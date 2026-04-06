// ═══════════════════════════════════════════════════════════════════════════
// QueueFlow — Landing Page Logic
// ═══════════════════════════════════════════════════════════════════════════

// Check if already logged in
(async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user.role === 'admin') {
        window.location.href = '/admin';
      } else {
        window.location.href = '/user-dashboard';
      }
    }
  } catch (e) { /* Not logged in, stay on page */ }
})();

// ── Auth Modal ────────────────────────────────────────────────────────────

let currentRole = 'user';

function showAuth(role) {
  currentRole = role;
  const overlay = document.getElementById('authOverlay');
  const adminAuth = document.getElementById('adminAuth');
  const userAuth = document.getElementById('userAuth');
  const errorEl = document.getElementById('authError');

  errorEl.style.display = 'none';

  if (role === 'admin') {
    adminAuth.style.display = 'block';
    userAuth.style.display = 'none';
  } else {
    adminAuth.style.display = 'none';
    userAuth.style.display = 'block';
  }

  overlay.classList.add('active');
  // Focus first input
  setTimeout(() => {
    const firstInput = overlay.querySelector('input:not([type=hidden])');
    if (firstInput) firstInput.focus();
  }, 300);
}

function hideAuth() {
  document.getElementById('authOverlay').classList.remove('active');
}

// Close on outside click
document.getElementById('authOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) hideAuth();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideAuth();
});

// ── Auth Tabs ─────────────────────────────────────────────────────────────

function switchAuthTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('userLoginForm');
  const registerForm = document.getElementById('userRegisterForm');

  if (tab === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
  } else {
    loginTab.classList.remove('active');
    registerTab.classList.add('active');
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
  }
  document.getElementById('authError').style.display = 'none';
}

// ── Login Handler ─────────────────────────────────────────────────────────

async function handleLogin(event, role) {
  event.preventDefault();
  const errorEl = document.getElementById('authError');
  errorEl.style.display = 'none';

  let username, password;
  if (role === 'admin') {
    username = document.getElementById('adminUsername').value;
    password = document.getElementById('adminPassword').value;
  } else {
    username = document.getElementById('userLoginUsername').value;
    password = document.getElementById('userLoginPassword').value;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.style.display = 'block';
      return;
    }

    if (data.user.role === 'admin') {
      window.location.href = '/admin';
    } else {
      window.location.href = '/user-dashboard';
    }
  } catch (err) {
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.style.display = 'block';
  }
}

// ── Register Handler ──────────────────────────────────────────────────────

async function handleRegister(event) {
  event.preventDefault();
  const errorEl = document.getElementById('authError');
  errorEl.style.display = 'none';

  const body = {
    username: document.getElementById('regUsername').value,
    password: document.getElementById('regPassword').value,
    name: document.getElementById('regName').value,
    phone: document.getElementById('regPhone').value,
    email: document.getElementById('regEmail').value,
    age: document.getElementById('regAge').value || null,
    gender: document.getElementById('regGender').value || null
  };

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Registration failed';
      errorEl.style.display = 'block';
      return;
    }

    window.location.href = '/user-dashboard';
  } catch (err) {
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.style.display = 'block';
  }
}

// ── Toast Notifications ───────────────────────────────────────────────────

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { info: 'ℹ️', sms: '📱', error: '❌', success: '✅' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
}
