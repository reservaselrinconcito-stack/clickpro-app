/**
 * ContikPro Core — DB Adapter Interface
 *
 * This abstraction layer decouples UI and services from the
 * underlying storage engine (Dexie/IndexedDB or SQLite/Tauri).
 *
 * All pages and services import from here, never from dexie directly.
 */

// ─── Core types ───────────────────────────────────────────────────────────────

export type TableName =
  | 'settings'
  | 'contacts'
  | 'items'
  | 'templates'
  | 'quotes'
  | 'recurring_quotes'
  | 'invoices'
  | 'recurring_invoices'
  | 'expenses'
  | 'payments'
  | 'communications'
  | 'inbox_threads'
  | 'inbox_messages'
  | 'inbox_templates'
  | 'email_templates'
  | 'counters';

export type FilterMap = Record<string, string | number | boolean>;

export interface QueryOptions {
  filter?: FilterMap;
  orderBy?: string;         // e.g. "date DESC"
  limit?: number;
}

export interface AdapterStats {
  [table: string]: number;
  db_size_bytes?: number;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface IDbAdapter {
  /** Returns true if adapter is ready to use */
  isReady(): boolean;

  /** Get a single record by id. Returns null if not found. */
  get<T>(table: TableName, id: string): Promise<T | null>;

  /** Insert or replace a record (upsert). Must include id field. */
  put<T extends { id: string }>(table: TableName, data: T): Promise<string>;

  /** Update partial fields of a record. */
  update<T>(table: TableName, id: string, partial: Partial<T>): Promise<void>;

  /** Delete a record by id. */
  delete(table: TableName, id: string): Promise<void>;

  /** Query all records matching optional filter. */
  query<T>(table: TableName, options?: QueryOptions): Promise<T[]>;

  /** Count records matching optional filter. */
  count(table: TableName, filter?: FilterMap): Promise<number>;

  /** Subscribe to changes on a table. Returns unsubscribe fn. */
  subscribe(table: TableName, callback: () => void): () => void;

  /** Notify all subscribers for a table (called after mutations). */
  notify(table: TableName): void;

  /** Get db stats (record counts, size). */
  stats(): Promise<AdapterStats>;
}

// ─── Event bus (reactivity) ───────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeToTable(table: TableName, fn: Listener): () => void {
  if (!listeners.has(table)) listeners.set(table, new Set());
  listeners.get(table)!.add(fn);
  return () => listeners.get(table)?.delete(fn);
}

export function notifyTable(table: TableName): void {
  listeners.get(table)?.forEach(fn => fn());
}

// Notify multiple tables at once (for bulk ops)
export function notifyTables(tables: TableName[]): void {
  tables.forEach(t => notifyTable(t));
}

// ─── Current adapter singleton ────────────────────────────────────────────────

let _adapter: IDbAdapter | null = null;
const _readyListeners: Array<() => void> = [];

export function setAdapter(adapter: IDbAdapter): void {
  _adapter = adapter;
  _readyListeners.forEach(fn => fn());
  _readyListeners.length = 0;
}

export function getAdapter(): IDbAdapter {
  if (!_adapter) throw new Error('DB adapter not initialized. Call setAdapter() first.');
  return _adapter;
}

export function isAdapterReady(): boolean {
  return _adapter?.isReady() ?? false;
}

export function onAdapterReady(fn: () => void): void {
  if (_adapter?.isReady()) { fn(); return; }
  _readyListeners.push(fn);
}
