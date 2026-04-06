const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'queue.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create Tables ──────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    name TEXT,
    phone TEXT,
    email TEXT,
    age INTEGER,
    gender TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS institutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS queue_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE NOT NULL,
    user_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    age INTEGER,
    gender TEXT,
    department TEXT NOT NULL,
    institution TEXT NOT NULL,
    purpose TEXT,
    position INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    notified_at_second INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    queue_entry_id INTEGER,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (queue_entry_id) REFERENCES queue_entries(id)
  );
`);

// ── Seed Data ──────────────────────────────────────────────────────────────

// Default admin account
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)').run(
    'admin', hashedPassword, 'admin', 'System Administrator'
  );
  console.log('✅ Default admin account created (admin / admin123)');
}

// Seed departments
const departments = [
  'Cardiology', 'Orthopedics', 'Neurology', 'Pediatrics',
  'Dermatology', 'General Medicine', 'Ophthalmology', 'ENT'
];

const insertDept = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)');
const insertDeptMany = db.transaction((depts) => {
  for (const d of depts) insertDept.run(d);
});
insertDeptMany(departments);

// Seed institutions
const institutions = [
  'City General Hospital', 'Metro Health Clinic', 'Sunrise Medical Center',
  'Apollo Care Institute', 'National Health Services', 'Green Valley Hospital'
];

const insertInst = db.prepare('INSERT OR IGNORE INTO institutions (name) VALUES (?)');
const insertInstMany = db.transaction((insts) => {
  for (const i of insts) insertInst.run(i);
});
insertInstMany(institutions);

// ── Helper Functions ───────────────────────────────────────────────────────

function generateUID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let uid = 'Q-';
  for (let i = 0; i < 6; i++) {
    uid += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure uniqueness
  const exists = db.prepare('SELECT id FROM queue_entries WHERE uid = ?').get(uid);
  if (exists) return generateUID();
  return uid;
}

function getNextPosition(department, institution) {
  const result = db.prepare(
    'SELECT MAX(position) as maxPos FROM queue_entries WHERE department = ? AND institution = ? AND status = ?'
  ).get(department, institution, 'waiting');
  return (result.maxPos || 0) + 1;
}

function recalculatePositions(department, institution) {
  const entries = db.prepare(
    'SELECT id FROM queue_entries WHERE department = ? AND institution = ? AND status = ? ORDER BY position ASC'
  ).all(department, institution, 'waiting');

  const updatePos = db.prepare('UPDATE queue_entries SET position = ? WHERE id = ?');
  const updateMany = db.transaction((entries) => {
    entries.forEach((entry, index) => {
      updatePos.run(index + 1, entry.id);
    });
  });
  updateMany(entries);
}

module.exports = {
  db,
  generateUID,
  getNextPosition,
  recalculatePositions
};
