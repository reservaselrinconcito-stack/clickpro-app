/**
 * db-adapter.ts — v2.4.0
 *
 * Changes from v2.3.0:
 * - Added migration v3: peluquería tables (hair_services, professionals,
 *   business_hours, schedule_blocks, appointments, inbox_messages,
 *   web_config, calendar_config)
 * - Non-destructive: only adds new tables / indexes
 */

import Database from '@tauri-apps/plugin-sql';
import { isTauri } from './tauri-utils';
import { MIGRATION_V3_PELUQUERIA } from '../verticals/peluqueria/migrations/v3-peluqueria';
import { MIGRATION_V4_SYNC } from '../verticals/peluqueria/migrations/v4-sync';

export interface DbAdapter {
  isReady: boolean;
  dbPath: string | null;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  open(path: string): Promise<void>;
  close(): Promise<void>;
  runMigrations(): Promise<void>;
}

export class SqliteAdapter implements DbAdapter {
  private db: Database | null = null;
  isReady = false;
  dbPath: string | null = null;

  async open(dbFilePath: string): Promise<void> {
    this.db = await Database.load(`sqlite:${dbFilePath}`);
    this.dbPath = dbFilePath;
    await this.runMigrations();
    this.isReady = true;
  }

  async close(): Promise<void> {
    if (this.db) { await this.db.close(); this.db = null; this.isReady = false; }
  }

  async execute(sql: string, params: unknown[] = []) {
    if (!this.db) throw new Error('Database not open');
    return this.db.execute(sql, params);
  }

  async select<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.db) throw new Error('Database not open');
    return this.db.select<T>(sql, params);
  }

  async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not open');

    await this.db.execute('PRAGMA journal_mode=WAL');
    await this.db.execute('PRAGMA foreign_keys=ON');

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    const applied = await this.db.select<{ version: number }>(
      'SELECT version FROM _migrations ORDER BY version ASC'
    );
    const appliedVersions = new Set(applied.map(r => r.version));

    for (const migration of MIGRATIONS) {
      if (!appliedVersions.has(migration.version)) {
        console.log(`Applying migration v${migration.version}…`);
        await this.db.execute('BEGIN TRANSACTION');
        try {
          for (const stmt of migration.statements) {
            await this.db.execute(stmt);
          }
          await this.db.execute(
            'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)',
            [migration.version, Date.now()]
          );
          await this.db.execute('COMMIT');
          console.log(`Migration v${migration.version} OK`);
        } catch (err) {
          await this.db.execute('ROLLBACK');
          throw new Error(`Migration v${migration.version} failed: ${err}`);
        }
      }
    }
  }
}

// ─── All migrations in order ──────────────────────────────────────────────────

const MIGRATIONS = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'client',
        name TEXT NOT NULL,
        tax_id TEXT, email TEXT, phone TEXT,
        address TEXT, city TEXT, postal_code TEXT, country TEXT DEFAULT 'ES',
        notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        price REAL NOT NULL DEFAULT 0, tax_rate REAL NOT NULL DEFAULT 21,
        unit TEXT DEFAULT 'unidad', category TEXT, active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS invoice_series (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, prefix TEXT NOT NULL,
        next_number INTEGER NOT NULL DEFAULT 1, type TEXT NOT NULL DEFAULT 'invoice',
        active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, type TEXT NOT NULL,
        number TEXT, series_id TEXT, contact_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft', date TEXT NOT NULL,
        due_date TEXT, subtotal REAL NOT NULL DEFAULT 0,
        tax_total REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
        notes TEXT, internal_notes TEXT,
        rectificative_of TEXT, rectificative_reason TEXT,
        verifactu_hash TEXT, verifactu_chain_hash TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (series_id) REFERENCES invoice_series(id),
        FOREIGN KEY (contact_id) REFERENCES contacts(id)
      )`,
      `CREATE TABLE IF NOT EXISTS document_lines (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL,
        item_id TEXT, description TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1, price REAL NOT NULL DEFAULT 0,
        tax_rate REAL NOT NULL DEFAULT 21, subtotal REAL NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL,
        amount REAL NOT NULL, date TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'transfer', reference TEXT, notes TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY, action TEXT NOT NULL,
        entity_type TEXT, entity_id TEXT,
        description TEXT NOT NULL, user TEXT, metadata TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS verifactu_queue (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT, submitted_at INTEGER, created_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )`,
    ],
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS email_templates (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL,
        body TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'invoice',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`,
    ],
  },
  // v3: Peluquería vertical (imported from migration file)
  MIGRATION_V3_PELUQUERIA,
  // v4: Sync support — external_id + sync_config table
  MIGRATION_V4_SYNC,
];

// ─── Singleton ─────────────────────────────────────────────────────────────────

let _adapter: SqliteAdapter | null = null;

export function getDbAdapter(): SqliteAdapter {
  if (!_adapter) _adapter = new SqliteAdapter();
  return _adapter;
}

export async function initializeDatabase(dbFilePath: string): Promise<SqliteAdapter> {
  const adapter = getDbAdapter();
  if (!adapter.isReady) await adapter.open(dbFilePath);
  return adapter;
}
