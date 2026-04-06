const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const { db, generateUID, getNextPosition, recalculatePositions } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'queue-mgmt-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, name, phone, email, age, gender } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password, role, name, phone, email, age, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(username, hashedPassword, 'user', name, phone || null, email || null, age || null, gender || null);

    req.session.userId = result.lastInsertRowid;
    req.session.role = 'user';
    req.session.username = username;
    req.session.name = name;

    res.json({ success: true, user: { id: result.lastInsertRowid, username, name, role: 'user' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username;
    req.session.name = user.name;

    res.json({
      success: true,
      user: { id: user.id, username: user.username, name: user.name, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username,
      name: req.session.name,
      role: req.session.role
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DATA ROUTES (Departments & Institutions)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/departments', (req, res) => {
  const depts = db.prepare('SELECT * FROM departments ORDER BY name').all();
  res.json(depts);
});

app.get('/api/institutions', (req, res) => {
  const insts = db.prepare('SELECT * FROM institutions ORDER BY name').all();
  res.json(insts);
});

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Get queue entries with optional filters
app.get('/api/queue', requireAuth, (req, res) => {
  try {
    const { department, institution } = req.query;
    let query = 'SELECT * FROM queue_entries WHERE status = ?';
    const params = ['waiting'];

    if (department) {
      query += ' AND department = ?';
      params.push(department);
    }
    if (institution) {
      query += ' AND institution = ?';
      params.push(institution);
    }
    query += ' ORDER BY position ASC';
    const entries = db.prepare(query).all(...params);
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Add entry to queue
app.post('/api/queue', requireAdmin, (req, res) => {
  try {
    const { name, phone, email, age, gender, department, institution, purpose } = req.body;
    if (!name || !department || !institution) {
      return res.status(400).json({ error: 'Name, department, and institution are required' });
    }
    const uid = generateUID();
    const position = getNextPosition(department, institution);
    const result = db.prepare(
      `INSERT INTO queue_entries (uid, name, phone, email, age, gender, department, institution, purpose, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uid, name, phone || null, email || null, age || null, gender || null, department, institution, purpose || null, position);

    const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User: Join queue
app.post('/api/queue/join', requireAuth, (req, res) => {
  try {
    const { department, institution, purpose } = req.body;
    if (!department || !institution) {
      return res.status(400).json({ error: 'Department and institution are required' });
    }
    // Check if user already in queue for this dept/inst
    const existing = db.prepare(
      'SELECT id FROM queue_entries WHERE user_id = ? AND department = ? AND institution = ? AND status = ?'
    ).get(req.session.userId, department, institution, 'waiting');
    if (existing) {
      return res.status(400).json({ error: 'You are already in this queue' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    const uid = generateUID();
    const position = getNextPosition(department, institution);

    const result = db.prepare(
      `INSERT INTO queue_entries (uid, user_id, name, phone, email, age, gender, department, institution, purpose, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uid, user.id, user.name, user.phone, user.email, user.age, user.gender, department, institution, purpose || null, position);

    const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Update queue entry
app.put('/api/queue/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, age, gender, department, institution, purpose, position } = req.body;

    const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(id);
    if (!entry) {
      return res.status(404).json({ error: 'Queue entry not found' });
    }

    db.prepare(
      `UPDATE queue_entries SET name=?, phone=?, email=?, age=?, gender=?, department=?, institution=?, purpose=?, position=?
       WHERE id=?`
    ).run(
      name || entry.name,
      phone || entry.phone,
      email || entry.email,
      age || entry.age,
      gender || entry.gender,
      department || entry.department,
      institution || entry.institution,
      purpose || entry.purpose,
      position || entry.position,
      id
    );

    const updated = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(id);
    res.json({ success: true, entry: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete / serve (remove from queue)
app.delete('/api/queue/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(id);
    if (!entry) {
      return res.status(404).json({ error: 'Queue entry not found' });
    }

    db.prepare('UPDATE queue_entries SET status = ? WHERE id = ?').run('served', id);
    recalculatePositions(entry.department, entry.institution);

    // Check if someone moved to position 2 and notify them
    const secondInLine = db.prepare(
      'SELECT * FROM queue_entries WHERE department = ? AND institution = ? AND status = ? AND position = ? AND notified_at_second = 0'
    ).get(entry.department, entry.institution, 'waiting', 2);

    if (secondInLine && secondInLine.user_id) {
      const smsMessage = `You are now 2nd in line at ${secondInLine.department} - ${secondInLine.institution}! Please be ready.`;

      db.prepare(
        'INSERT INTO notifications (user_id, queue_entry_id, message, type) VALUES (?, ?, ?, ?)'
      ).run(
        secondInLine.user_id,
        secondInLine.id,
        `📱 ${smsMessage}`,
        'sms'
      );
      db.prepare('UPDATE queue_entries SET notified_at_second = 1 WHERE id = ?').run(secondInLine.id);

      // ── SMS Simulation ─────────────────────────────────────────────
      const phone = secondInLine.phone || '(no phone registered)';
      console.log('\n══════════════════════════════════════════════════════');
      console.log('📱 [SMS SENDER] Simulated SMS Notification');
      console.log(`   To: ${phone}`);
      console.log(`   Name: ${secondInLine.name}`);
      console.log(`   Message: ${smsMessage}`);
      console.log('══════════════════════════════════════════════════════\n');
    }

    res.json({ success: true, message: 'Entry removed from queue' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's position
app.get('/api/queue/position/:userId', requireAuth, (req, res) => {
  try {
    const entries = db.prepare(
      'SELECT * FROM queue_entries WHERE user_id = ? AND status = ? ORDER BY position ASC'
    ).all(req.params.userId, 'waiting');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full queue data ONLY for queues the current user has joined
app.get('/api/queue/my-active', requireAuth, (req, res) => {
  try {
    // 1) Find which (department, institution) combos the user is waiting in
    const myQueues = db.prepare(
      'SELECT DISTINCT department, institution FROM queue_entries WHERE user_id = ? AND status = ?'
    ).all(req.session.userId, 'waiting');

    if (myQueues.length === 0) {
      return res.json([]);
    }

    // 2) Fetch ALL waiting entries for those (dept, inst) pairs
    const conditions = myQueues.map(() => '(department = ? AND institution = ?)').join(' OR ');
    const params = ['waiting'];
    myQueues.forEach(q => { params.push(q.department, q.institution); });

    const entries = db.prepare(
      `SELECT * FROM queue_entries WHERE status = ? AND (${conditions}) ORDER BY institution, department, position ASC`
    ).all(...params);

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/notifications/:userId', requireAuth, (req, res) => {
  try {
    const notifications = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC'
    ).all(req.params.userId);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS (Admin)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/stats', requireAdmin, (req, res) => {
  try {
    const totalWaiting = db.prepare('SELECT COUNT(*) as count FROM queue_entries WHERE status = ?').get('waiting').count;
    const totalServed = db.prepare('SELECT COUNT(*) as count FROM queue_entries WHERE status = ?').get('served').count;
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('user').count;

    const byDepartment = db.prepare(
      'SELECT department, COUNT(*) as count FROM queue_entries WHERE status = ? GROUP BY department ORDER BY count DESC'
    ).all('waiting');

    const byInstitution = db.prepare(
      'SELECT institution, COUNT(*) as count FROM queue_entries WHERE status = ? GROUP BY institution ORDER BY count DESC'
    ).all('waiting');

    const avgWaitTime = db.prepare(
      `SELECT AVG((julianday('now') - julianday(joined_at)) * 24 * 60) as avgMinutes
       FROM queue_entries WHERE status = ?`
    ).get('waiting');

    res.json({
      totalWaiting,
      totalServed,
      totalUsers,
      byDepartment,
      byInstitution,
      avgWaitMinutes: Math.round(avgWaitTime.avgMinutes || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/admin', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/user-dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n🚀 Queue Management System running at http://localhost:${PORT}`);
  console.log(`📋 Admin Login: admin / admin123\n`);
});
