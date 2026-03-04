/**
 * SQLiteAdapter — Tauri invoke() bridge to Rust SQLite commands.
 *
 * All data operations are guarded by assertReady(): they throw a clear
 * error if called before markReady() has been invoked. This prevents
 * silent empty-result failures during the startup window.
 *
 * Lifecycle:
 *   1. new SQLiteAdapter()          — created in initAdapter()
 *   2. invoke('init_data_folder')   — Rust opens the .sqlite file
 *   3. adapter.verify()             — test query confirms DB responds
 *   4. adapter.markReady()          — unlocks all operations
 *   5. setDbReady(true)             — React re-renders, routes mount
 */

import { invoke } from '@tauri-apps/api/core';
import {
  IDbAdapter, TableName, QueryOptions, FilterMap, AdapterStats,
  subscribeToTable, notifyTable,
} from './interface';
import { IS_READONLY } from '../environment';

// Maps TableName enum values to Rust command table name strings
const TABLE_MAP: Record<TableName, string> = {
  settings: 'settings',
  contacts: 'contacts',
  items: 'items',
  templates: 'templates',
  quotes: 'quotes',
  recurring_quotes: 'recurring_quotes',
  invoices: 'invoices',
  recurring_invoices: 'recurring_invoices',
  expenses: 'expenses',
  payments: 'payments',
  communications: 'communications',
  inbox_threads: 'inbox_threads',
  inbox_messages: 'inbox_messages',
  inbox_templates: 'inbox_templates',
  email_templates: 'email_templates',
  counters: 'counters',
};

export class SQLiteAdapter implements IDbAdapter {
  private _ready = false;

  /** True after markReady() — all operations allowed */
  isReady(): boolean {
    return this._ready;
  }

  /**
   * Unlock the adapter.
   * Called by DataFolderSetup AFTER:
   *   1. invoke('init_data_folder') returned successfully
   *   2. verify() returned true
   */
  markReady(): void {
    this._ready = true;
    console.log('[SQLiteAdapter] ✓ ready');
  }

  /**
   * Test query — confirms the Rust side is responding.
   * Counts settings rows (always exists, even on empty DB).
   * Throws if Rust command fails.
   */
  async verify(): Promise<boolean> {
    const n = await invoke<number>('db_count', {
      table: 'settings',
      filter: null,
    });
    if (typeof n !== 'number') {
      throw new Error(`verify() unexpected response: ${JSON.stringify(n)}`);
    }
    console.log(`[SQLiteAdapter] verify() OK — settings rows: ${n}`);
    return true;
  }

  // ─── Internal guard ──────────────────────────────────────────────────────

  private assertReady(op: string): void {
    if (!this._ready) {
      throw new Error(
        `[SQLiteAdapter] Operation blocked: ${op}\n` +
        `Database is not ready. DataFolderSetup must complete before any query.\n` +
        `Call sequence: init_data_folder → verify() → markReady() → setDbReady(true)`
      );
    }
  }

  // ─── IDbAdapter implementation ───────────────────────────────────────────

  async get<T>(table: TableName, id: string): Promise<T | null> {
    this.assertReady(`get(${table}, ${id})`);
    try {
      return await invoke<T | null>('db_get', {
        table: TABLE_MAP[table],
        id,
      });
    } catch (err) {
      console.error(`[SQLiteAdapter] get(${table}, ${id}):`, err);
      return null;
    }
  }

  async put<T extends { id: string }>(table: TableName, data: T): Promise<string> {
    this.assertReady(`put(${table})`);
    if (IS_READONLY) return data.id;
    try {
      const id = await invoke<string>('db_put', {
        table: TABLE_MAP[table],
        id: data.id,
        data,
      });
      notifyTable(table);
      return id;
    } catch (err) {
      console.error(`[SQLiteAdapter] put(${table}):`, err);
      throw err;
    }
  }

  async update<T>(table: TableName, id: string, partial: Partial<T>): Promise<void> {
    this.assertReady(`update(${table}, ${id})`);
    if (IS_READONLY) return;
    const existing = await this.get<T>(table, id);
    if (!existing) {
      throw new Error(`[SQLiteAdapter] update: record not found — ${table}/${id}`);
    }
    await this.put(table, { ...existing, ...partial, id } as T & { id: string });
  }

  async delete(table: TableName, id: string): Promise<void> {
    this.assertReady(`delete(${table}, ${id})`);
    if (IS_READONLY) return;
    try {
      await invoke<boolean>('db_delete', {
        table: TABLE_MAP[table],
        id,
      });
      notifyTable(table);
    } catch (err) {
      console.error(`[SQLiteAdapter] delete(${table}, ${id}):`, err);
      throw err;
    }
  }

  async query<T>(table: TableName, options: QueryOptions = {}): Promise<T[]> {
    this.assertReady(`query(${table})`);
    try {
      return await invoke<T[]>('db_query', {
        table: TABLE_MAP[table],
        filter: options.filter ?? null,
        orderBy: options.orderBy ?? null,
        limit: options.limit ?? null,
      });
    } catch (err) {
      console.error(`[SQLiteAdapter] query(${table}):`, err);
      return [];
    }
  }

  async count(table: TableName, filter?: FilterMap): Promise<number> {
    this.assertReady(`count(${table})`);
    try {
      return await invoke<number>('db_count', {
        table: TABLE_MAP[table],
        filter: filter ?? null,
      });
    } catch (err) {
      console.error(`[SQLiteAdapter] count(${table}):`, err);
      return 0;
    }
  }

  subscribe(table: TableName, callback: () => void): () => void {
    return subscribeToTable(table, callback);
  }

  notify(table: TableName): void {
    notifyTable(table);
  }

  async stats(): Promise<AdapterStats> {
    // stats() is allowed before ready — used by DesktopBackup UI
    if (!this._ready) return {};
    try {
      return await invoke<AdapterStats>('db_stats');
    } catch {
      return {};
    }
  }
}
