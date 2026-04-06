// ═══════════════════════════════════════════════════════════════════════════
// QueueFlow — User Dashboard Logic
// ═══════════════════════════════════════════════════════════════════════════

let currentUser = null;
let previousPositions = {};
let refreshInterval = null;

// Notification sound (base64 encoded short beep)
const notifSound = new Audio('data:audio/wav;base64,UklGRl9vT19teleXJjag==');

// ── Init ──────────────────────────────────────────────────────────────────

(async function init() {
  await checkAuth();
  await loadDropdowns();
  await loadMyQueue();
  await loadViewQueue();
  await checkNotifications();

  // Auto-refresh every 5s
  refreshInterval = setInterval(async () => {
    await loadMyQueue();
    await loadViewQueue();
    await checkNotifications();
  }, 5000);

  const jForm = document.getElementById('joinQueueForm');
  if (jForm) {
    jForm.addEventListener('submit', handleJoinQueue);
  }
})();

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/'; return; }
    const data = await res.json();
    currentUser = data.user;
    document.getElementById('userName').textContent = data.user.name || 'User';
    document.getElementById('userAvatar').textContent = (data.user.name || 'U')[0].toUpperCase();
  } catch (e) {
    window.location.href = '/';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

// ── Tabs ──────────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`tab-${tab}`).classList.add('active');
  event.target.classList.add('active');

  if (tab === 'myqueue') loadMyQueue();
  if (tab === 'view') loadViewQueue();
}

// ── Load Dropdowns ────────────────────────────────────────────────────────

async function loadDropdowns() {
  try {
    const [deptRes, instRes] = await Promise.all([
      fetch('/api/departments'),
      fetch('/api/institutions')
    ]);
    const departments = await deptRes.json();
    const institutions = await instRes.json();

    const joinDept = document.getElementById('joinDepartment');
    const joinInst = document.getElementById('joinInstitution');

    departments.forEach(d => {
      joinDept.add(new Option(d.name, d.name));
    });

    institutions.forEach(i => {
      joinInst.add(new Option(i.name, i.name));
    });
  } catch (e) {
    console.error('Failed to load dropdowns:', e);
  }
}

// ── Join Queue ────────────────────────────────────────────────────────────

async function handleJoinQueue(event) {
  event.preventDefault();
  const body = {
    department: document.getElementById('joinDepartment').value,
    institution: document.getElementById('joinInstitution').value,
    purpose: document.getElementById('joinPurpose').value
  };

  try {
    const res = await fetch('/api/queue/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('Error', data.error, 'error');
      return;
    }
    showToast('Joined!', `You are #${data.entry.position} in the queue (${data.entry.uid})`, 'success');
    document.getElementById('joinQueueForm').reset();
    loadMyQueue();
    loadViewQueue();

    // Switch to My Position tab
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-myqueue').classList.add('active');
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
  } catch (e) {
    showToast('Error', 'Failed to join queue', 'error');
  }
}

// ── My Queue Position ─────────────────────────────────────────────────────

async function loadMyQueue() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/queue/position/${currentUser.id}`);
    const entries = await res.json();
    const container = document.getElementById('myQueueEntries');
    const noMsg = document.getElementById('noQueueMsg');

    if (entries.length === 0) {
      container.innerHTML = '';
      noMsg.style.display = 'block';
      return;
    }
    noMsg.style.display = 'none';

    container.innerHTML = entries.map(entry => {
      const prevPos = previousPositions[entry.id];
      const posChanged = prevPos !== undefined && prevPos !== entry.position;
      previousPositions[entry.id] = entry.position;

      return `
        <div class="glass-card my-position-card ${posChanged ? 'pulse' : ''}" style="margin-bottom:1.5rem;">
          <div class="position-number">#${entry.position}</div>
          <div class="position-label">Your position in queue</div>
          <div class="uid-display">${entry.uid}</div>
          <div style="margin-top:1rem;display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
            <span class="badge badge-primary" style="padding:0.4rem 0.8rem;font-size:0.8rem;">
              🏥 ${entry.department}
            </span>
            <span class="badge badge-accent" style="padding:0.4rem 0.8rem;font-size:0.8rem;">
              🏢 ${entry.institution}
            </span>
          </div>
          ${entry.position === 1 ? `
            <div style="margin-top:1.5rem;padding:1rem;background:rgba(0,206,201,0.1);border-radius:var(--radius-sm);border:1px solid var(--accent);">
              <strong style="color:var(--accent);">⚡ You're being served now!</strong>
            </div>
          ` : ''}
          ${entry.position === 2 ? `
            <div style="margin-top:1.5rem;padding:1rem;background:rgba(253,203,110,0.1);border-radius:var(--radius-sm);border:1px solid var(--warning);">
              <strong style="color:var(--warning);">⏳ You're next! Please be ready.</strong>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load position:', e);
  }
}

// ── View Queue (only queues user has joined) ─────────────────────────────

async function loadViewQueue() {
  try {
    const res = await fetch('/api/queue/my-active');
    if (!res.ok) return;
    const entries = await res.json();
    renderViewQueue(entries);
    document.getElementById('viewQueueCount').textContent = entries.length;
  } catch (e) {
    console.error('Failed to load queue view:', e);
  }
}

function renderViewQueue(entries) {
  const grid = document.getElementById('viewQueueGrid');

  if (entries.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>You haven't joined any queue</h3>
        <p>Join a queue from the "Join Queue" tab to see its live status here.</p>
      </div>
    `;
    return;
  }

  // Group entries by institution → department
  const groups = {};
  entries.forEach(entry => {
    const key = `${entry.institution}|||${entry.department}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  });

  let html = '';
  Object.keys(groups).sort().forEach(key => {
    const [institution, department] = key.split('|||');
    const groupEntries = groups[key];

    html += `
      <div class="queue-group">
        <div class="queue-group-header">
          <span class="group-icon">🏢</span>
          <span class="group-institution">${institution}</span>
          <span class="group-separator">›</span>
          <span class="group-icon">🏥</span>
          <span class="group-department">${department}</span>
          <span class="group-count">${groupEntries.length}</span>
        </div>
        <div class="queue-list">
    `;

    groupEntries.forEach((entry, index) => {
      const isFirst = index === 0;
      const isSecond = index === 1;
      const cardClass = isFirst ? 'now-serving' : (isSecond ? 'next-up' : '');
      const isMe = entry.user_id === currentUser?.id;

      html += `
        <div class="glass-card queue-card ${cardClass}" onclick="showDetail(${entry.id})" style="${isMe ? 'border-color:var(--primary-light);' : ''}">
          <div class="card-header">
            <div>
              ${isFirst ? '<div class="now-serving-label">⚡ NOW SERVING</div>' : ''}
              ${isSecond ? '<div class="now-serving-label" style="color:var(--warning);">⏳ NEXT UP</div>' : ''}
              <div class="name-text">${isFirst ? entry.name : (isMe ? '👤 You' : '—')}</div>
              <div class="uid-text">${entry.uid}</div>
            </div>
            <div class="position-badge">${entry.position}</div>
          </div>
          <div class="card-body">
            <div class="dept-text">🏥 ${entry.department}</div>
            <div class="dept-text">🏢 ${entry.institution}</div>
            ${isMe ? '<div class="dept-text" style="color:var(--primary-light);margin-top:0.25rem;">★ This is you</div>' : ''}
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

// ── Detail Modal ──────────────────────────────────────────────────────────

async function showDetail(id) {
  try {
    const res = await fetch('/api/queue/my-active');
    const entries = await res.json();
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    const isMe = entry.user_id === currentUser?.id;
    const grid = document.getElementById('detailGrid');

    grid.innerHTML = `
      <div class="detail-item">
        <div class="label">UID</div>
        <div class="value" style="font-family:monospace;color:var(--accent);">${entry.uid}</div>
      </div>
      <div class="detail-item">
        <div class="label">Position</div>
        <div class="value" style="font-size:1.5rem;font-weight:800;color:var(--primary-light);">#${entry.position}</div>
      </div>
      <div class="detail-item">
        <div class="label">Name</div>
        <div class="value">${isMe || entry.position === 1 ? entry.name : '—'}</div>
      </div>
      <div class="detail-item">
        <div class="label">Department</div>
        <div class="value">${entry.department}</div>
      </div>
      <div class="detail-item">
        <div class="label">Institution</div>
        <div class="value">${entry.institution}</div>
      </div>
      <div class="detail-item">
        <div class="label">Joined At</div>
        <div class="value">${new Date(entry.joined_at).toLocaleString()}</div>
      </div>
      ${isMe ? `
        <div class="detail-item">
          <div class="label">Purpose</div>
          <div class="value">${entry.purpose || '—'}</div>
        </div>
        <div class="detail-item">
          <div class="label">Status</div>
          <div class="value"><span class="status-dot active"></span> Waiting</div>
        </div>
      ` : ''}
    `;

    openModal('detailModal');
  } catch (e) {
    showToast('Error', 'Failed to load details', 'error');
  }
}

// ── Notifications ─────────────────────────────────────────────────────────

async function checkNotifications() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/notifications/${currentUser.id}`);
    const notifications = await res.json();
    const countEl = document.getElementById('notifCount');

    if (notifications.length > 0) {
      countEl.textContent = notifications.length;
      countEl.style.display = 'flex';

      // Show toast for each unread notification
      for (const notif of notifications) {
        showToast('📱 SMS Alert', notif.message, 'sms');
        // Play notification sound
        try { notifSound.play(); } catch (e) { /* silent fail */ }
        // Mark as read
        await fetch(`/api/notifications/${notif.id}/read`, { method: 'PUT' });
      }
    } else {
      countEl.style.display = 'none';
    }
  } catch (e) {
    console.error('Notification check failed:', e);
  }
}

function toggleNotifications() {
  showToast('Notifications', 'You will receive alerts when your turn approaches', 'info');
}

// ── Modal Helpers ─────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});

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
