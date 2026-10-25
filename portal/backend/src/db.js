import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/portal.db')
const db = new Database(dbPath)

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL')

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      nama_lengkap TEXT NOT NULL,
      email TEXT,
      phone TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cs',
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portal_users (
      id TEXT PRIMARY KEY,
      pelanggan_id TEXT UNIQUE NOT NULL,
      nama_lengkap TEXT NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      is_custom_password INTEGER DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_cache (
      pelanggan_id TEXT PRIMARY KEY,
      main_pelanggan_uuid TEXT,
      paket_name TEXT,
      harga_layanan REAL,
      alamat TEXT,
      pop_name TEXT,
      status_layanan TEXT,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT UNIQUE NOT NULL,
      pelanggan_id TEXT NOT NULL,
      kategori TEXT NOT NULL,
      judul TEXT NOT NULL,
      deskripsi TEXT NOT NULL,
      foto_lampiran TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      prioritas TEXT NOT NULL DEFAULT 'medium',
      assigned_to_staff_id TEXT,
      resolution_notes TEXT,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY,
      pelanggan_id TEXT NOT NULL,
      tagihan_id TEXT NOT NULL,
      periode TEXT NOT NULL,
      nominal REAL NOT NULL,
      qr_string TEXT,
      qr_image_url TEXT,
      status TEXT DEFAULT 'pending',
      expired_at DATETIME,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS impersonate_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_username TEXT NOT NULL,
      target_pelanggan_id TEXT NOT NULL,
      reason TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portal_announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      banner_type TEXT DEFAULT 'info',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS live_assist_sessions (
      pelanggan_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      staff_id TEXT,
      staff_name TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Seed default admin staff if empty
  const countStaff = db.prepare('SELECT count(*) as c FROM staff_users').get()
  if (countStaff.c === 0) {
    const adminPass = bcrypt.hashSync('aufa2026', 10)
    db.prepare(`
      INSERT INTO staff_users (id, username, nama_lengkap, phone, role, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('staff-admin-1', 'admin', 'Superadmin AUFA', '081228240369', 'superadmin', adminPass)

    db.prepare(`
      INSERT INTO staff_users (id, username, nama_lengkap, phone, role, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('staff-cs-1', 'cs1', 'Customer Service AUFA', '081228240369', 'cs', adminPass)

    db.prepare(`
      INSERT INTO staff_users (id, username, nama_lengkap, phone, role, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('staff-tek-1', 'teknisi1', 'Mas Budi (Teknisi Lapangan)', '081228240369', 'teknisi', adminPass)

    console.log('Default staff seeded: admin, cs1, teknisi1 (pass: aufa2026)')
  }

  // Seed default customer: 260300202 (Abdul Kholiq) with pass: 12345678
  const checkCust = db.prepare('SELECT id FROM portal_users WHERE pelanggan_id = ?').get('260300202')
  if (!checkCust) {
    const defPass = bcrypt.hashSync('12345678', 10)
    db.prepare(`
      INSERT INTO portal_users (id, pelanggan_id, nama_lengkap, phone, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run('cust-1', '260300202', 'ABDUL KHOLIQ', '6285814572578', defPass)

    db.prepare(`
      INSERT INTO customer_cache (pelanggan_id, paket_name, harga_layanan, alamat, pop_name, status_layanan)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('260300202', '5 Mbps Family', 100000, 'Sumberbendo, Jogoroto', 'POP Jogoroto', 'aktif')

    console.log('Default customer 260300202 seeded (pass: 12345678)')
  }

  console.log('Database initialized successfully.')
}

export default db