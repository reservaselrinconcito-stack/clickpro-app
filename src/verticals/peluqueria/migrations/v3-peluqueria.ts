/**
 * Peluquería migration v3 — safe, additive only.
 *
 * Add this to the MIGRATIONS array in db-adapter.ts after version 2.
 * It only creates NEW tables; it never touches existing ones.
 */

export const MIGRATION_V3_PELUQUERIA = {
  version: 3,
  statements: [
    // ── Hair Services (service catalog) ─────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS hair_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      buffer_minutes INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      color_hex TEXT DEFAULT '#6366f1',
      category TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    // ── Professionals (empleados) ────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS professionals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      phone TEXT,
      email TEXT,
      color_hex TEXT NOT NULL DEFAULT '#8b5cf6',
      active INTEGER NOT NULL DEFAULT 1,
      work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
      work_start TEXT NOT NULL DEFAULT '09:00',
      work_end TEXT NOT NULL DEFAULT '20:00',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    // ── Business Hours ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS business_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week INTEGER NOT NULL,
      open INTEGER NOT NULL DEFAULT 1,
      start_time TEXT NOT NULL DEFAULT '09:00',
      end_time TEXT NOT NULL DEFAULT '20:00'
    )`,

    // Seed default business hours Mon–Sat
    `INSERT OR IGNORE INTO business_hours (day_of_week, open, start_time, end_time) VALUES
      (1, 1, '09:00', '20:00'),
      (2, 1, '09:00', '20:00'),
      (3, 1, '09:00', '20:00'),
      (4, 1, '09:00', '20:00'),
      (5, 1, '09:00', '20:00'),
      (6, 1, '09:00', '14:00'),
      (0, 0, '09:00', '14:00')`,

    // ── Schedule Blocks (vacaciones, cierres) ────────────────────────────────
    `CREATE TABLE IF NOT EXISTS schedule_blocks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      professional_id TEXT,
      start_datetime INTEGER NOT NULL,
      end_datetime INTEGER NOT NULL,
      reason TEXT,
      recurring INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
    )`,

    // ── Appointments (citas) ──────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      client_email TEXT,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      professional_id TEXT,
      professional_name TEXT,
      start_datetime INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      buffer_minutes INTEGER NOT NULL DEFAULT 0,
      end_datetime INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      origin TEXT NOT NULL DEFAULT 'manual',
      notes TEXT,
      inbox_message_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
      FOREIGN KEY (service_id) REFERENCES hair_services(id) ON DELETE RESTRICT,
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
      FOREIGN KEY (inbox_message_id) REFERENCES inbox_messages(id) ON DELETE SET NULL
    )`,

    `CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_datetime)`,
    `CREATE INDEX IF NOT EXISTS idx_appointments_professional ON appointments(professional_id)`,
    `CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)`,
    `CREATE INDEX IF NOT EXISTS idx_appointments_contact ON appointments(contact_id)`,

    // ── Inbox Messages ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS inbox_messages (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'reservation-request',
      status TEXT NOT NULL DEFAULT 'unread',
      sender_name TEXT NOT NULL,
      sender_phone TEXT,
      sender_email TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      preferred_datetime INTEGER,
      preferred_service_id TEXT,
      preferred_service_name TEXT,
      preferred_professional_id TEXT,
      appointment_id TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      read_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    `CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_messages(status)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_created ON inbox_messages(created_at DESC)`,

    // ── Web Config ────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS web_config (
      id TEXT PRIMARY KEY DEFAULT 'main',
      business_name TEXT,
      tagline TEXT,
      description TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      whatsapp TEXT,
      hours_text TEXT,
      -- URL del Cloudflare Worker de reservas (configurable, no hardcodeado)
      public_api_base_url TEXT,
      template TEXT NOT NULL DEFAULT 'moderna',
      sections TEXT NOT NULL DEFAULT '{}',
      photos TEXT NOT NULL DEFAULT '[]',
      meta_title TEXT,
      meta_description TEXT,
      published_url TEXT,
      last_published_at INTEGER,
      is_draft INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    // ── Calendar Config (per-user preferences) ────────────────────────────────
    `CREATE TABLE IF NOT EXISTS calendar_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,

    `INSERT OR IGNORE INTO calendar_config (key, value) VALUES
      ('slot_interval_minutes', '30'),
      ('default_view', 'week'),
      ('show_weekends', '0')`,
  ],
};
