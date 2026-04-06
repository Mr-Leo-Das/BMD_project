// ═══════════════════════════════════════════════════════════════════════════
// QueueFlow — Admin Dashboard Logic
// ═══════════════════════════════════════════════════════════════════════════

let currentUser = null;
let deleteTargetId = null;
let refreshInterval = null;

// ── Init ──────────────────────────────────────────────────────────────────

(async function init() {
  await checkAuth();
  await loadDropdowns();
  await loadStats();
  await loadQueue();
  // Auto-refresh every 5 seconds
  refreshInterval = setInterval(() => {
    loadQueue();
    loadStats();
  }, 5000);

  const qForm = document.getElementById('queueForm');
  if (qForm) {
    qForm.addEventListener('submit', handleQueueSubmit);
  }
})();

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/'; return; }
    const data = await res.json();
    if (data.user.role !== 'admin') { window.location.href = '/'; return; }
    currentUser = data.user;
    document.getElementById('adminName').textContent = data.user.name || 'Admin';
    document.getElementById('adminAvatar').textContent = (data.user.name || 'A')[0].toUpperCase();
  } catch (e) {
    window.location.href = '/';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
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

    const filterDept = document.getElementById('filterDepartment');
    const filterInst = document.getElementById('filterInstitution');
    const formDept = document.getElementById('formDepartment');
    const formInst = document.getElementById('formInstitution');

    departments.forEach(d => {
      const opt1 = new Option(d.name, d.name);
      const opt2 = new Option(d.name, d.name);
      filterDept.add(opt1);
      formDept.add(opt2);
    });

    institutions.forEach(i => {
      const opt1 = new Option(i.name, i.name);
      const opt2 = new Option(i.name, i.name);
      filterInst.add(opt1);
      formInst.add(opt2);
    });
  } catch (e) {
    console.error('Failed to load dropdowns:', e);
  }
}

// ── Statistics ────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const stats = await res.json();
    document.getElementById('statWaiting').textContent = stats.totalWaiting;
    document.getElementById('statServed').textContent = stats.totalServed;
    document.getElementById('statDepts').textContent = stats.byDepartment.length;
    document.getElementById('statAvgWait').textContent = stats.avgWaitMinutes + 'm';
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

// ── Load Queue ────────────────────────────────────────────────────────────

async function loadQueue() {
  const dept = document.getElementById('filterDepartment').value;
  const inst = document.getElementById('filterInstitution').value;
  const params = new URLSearchParams();
  if (dept) params.set('department', dept);
  if (inst) params.set('institution', inst);

  try {
    const res = await fetch(`/api/queue?${params}`);
    if (!res.ok) return;
    const entries = await res.json();
    renderQueue(entries);
    document.getElementById('queueCount').textContent = entries.length;
  } catch (e) {
    console.error('Failed to load queue:', e);
  }
}

function renderQueue(entries) {
  const grid = document.getElementById('queueGrid');

  if (entries.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>Queue is Empty</h3>
        <p>No patients are currently waiting. Use "Add to Queue" to begin.</p>
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

      html += `
        <div class="glass-card queue-card ${cardClass}" onclick="showDetail(${entry.id})">
          <div class="card-header">
            <div>
              ${isFirst ? '<div class="now-serving-label">⚡ NOW SERVING</div>' : ''}
              ${isSecond ? '<div class="now-serving-label" style="color:var(--warning);">⏳ NEXT UP</div>' : ''}
              <div class="name-text">${entry.name}</div>
              <div class="uid-text">${entry.uid}</div>
            </div>
            <div class="position-badge">${entry.position}</div>
          </div>
          <div class="card-body">
            <div class="dept-text">🏥 ${entry.department}</div>
            <div class="dept-text">🏢 ${entry.institution}</div>
          </div>
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); showEditModal(${entry.id})" title="Edit">
              ✏️ Edit
            </button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); showDeleteConfirm(${entry.id})" title="Remove" style="color:var(--danger);">
              🗑️ Remove
            </button>
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

// ── Add/Edit Modal ────────────────────────────────────────────────────────

function showAddModal() {
  document.getElementById('modalTitle').innerHTML = '<span class="text-gradient">Add to Queue</span>';
  document.getElementById('formSubmitBtn').textContent = '➕ Add to Queue';
  document.getElementById('editId').value = '';
  document.getElementById('queueForm').reset();
  openModal('addEditModal');
}

async function showEditModal(id) {
  try {
    const dept = document.getElementById('filterDepartment').value;
    const inst = document.getElementById('filterInstitution').value;
    const params = new URLSearchParams();
    if (dept) params.set('department', dept);
    if (inst) params.set('institution', inst);
    const res = await fetch(`/api/queue?${params}`);
    const entries = await res.json();
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    document.getElementById('modalTitle').innerHTML = '<span class="text-gradient">Edit Entry</span>';
    document.getElementById('formSubmitBtn').textContent = '💾 Update Entry';
    document.getElementById('editId').value = entry.id;
    document.getElementById('formName').value = entry.name || '';
    document.getElementById('formPhone').value = entry.phone || '';
    document.getElementById('formEmail').value = entry.email || '';
    document.getElementById('formAge').value = entry.age || '';
    document.getElementById('formGender').value = entry.gender || '';
    document.getElementById('formDepartment').value = entry.department || '';
    document.getElementById('formInstitution').value = entry.institution || '';
    document.getElementById('formPurpose').value = entry.purpose || '';
    openModal('addEditModal');
  } catch (e) {
    showToast('Error', 'Failed to load entry details', 'error');
  }
}

async function handleQueueSubmit(event) {
  event.preventDefault();
  const editId = document.getElementById('editId').value;
  const body = {
    name: document.getElementById('formName').value,
    phone: document.getElementById('formPhone').value,
    email: document.getElementById('formEmail').value,
    age: document.getElementById('formAge').value || null,
    gender: document.getElementById('formGender').value || null,
    department: document.getElementById('formDepartment').value,
    institution: document.getElementById('formInstitution').value,
    purpose: document.getElementById('formPurpose').value
  };

  try {
    let res;
    if (editId) {
      res = await fetch(`/api/queue/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
    const data = await res.json();
    if (!res.ok) {
      showToast('Error', data.error, 'error');
      return;
    }
    closeModal('addEditModal');
    showToast('Success', editId ? 'Entry updated successfully' : `Added ${data.entry.name} as ${data.entry.uid}`, 'info');
    loadQueue();
    loadStats();
  } catch (e) {
    showToast('Error', 'Failed to save entry', 'error');
  }
}

// ── Delete ────────────────────────────────────────────────────────────────

function showDeleteConfirm(id) {
  deleteTargetId = id;
  openModal('deleteModal');
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  try {
    const res = await fetch(`/api/queue/${deleteTargetId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      showToast('Error', data.error, 'error');
      return;
    }
    closeModal('deleteModal');
    showToast('Served', 'Patient removed from queue', 'info');
    deleteTargetId = null;
    loadQueue();
    loadStats();
  } catch (e) {
    showToast('Error', 'Failed to remove entry', 'error');
  }
}

// ── Detail Modal ──────────────────────────────────────────────────────────

async function showDetail(id) {
  try {
    const dept = document.getElementById('filterDepartment').value;
    const inst = document.getElementById('filterInstitution').value;
    const params = new URLSearchParams();
    if (dept) params.set('department', dept);
    if (inst) params.set('institution', inst);
    const res = await fetch(`/api/queue?${params}`);
    const entries = await res.json();
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

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
        <div class="label">Full Name</div>
        <div class="value">${entry.name}</div>
      </div>
      <div class="detail-item">
        <div class="label">Phone</div>
        <div class="value">${entry.phone || '—'}</div>
      </div>
      <div class="detail-item">
        <div class="label">Email</div>
        <div class="value">${entry.email || '—'}</div>
      </div>
      <div class="detail-item">
        <div class="label">Age</div>
        <div class="value">${entry.age || '—'}</div>
      </div>
      <div class="detail-item">
        <div class="label">Gender</div>
        <div class="value">${entry.gender || '—'}</div>
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
        <div class="label">Purpose</div>
        <div class="value">${entry.purpose || '—'}</div>
      </div>
      <div class="detail-item full-width">
        <div class="label">Joined At</div>
        <div class="value">${new Date(entry.joined_at).toLocaleString()}</div>
      </div>
    `;

    document.getElementById('detailActions').innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="closeModal('detailModal'); showEditModal(${entry.id})">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="closeModal('detailModal'); showDeleteConfirm(${entry.id})">🗑️ Remove</button>
    `;

    openModal('detailModal');
  } catch (e) {
    showToast('Error', 'Failed to load details', 'error');
  }
}

// ── Modal Helpers ─────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// Close on Escape
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
