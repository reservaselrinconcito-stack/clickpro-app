/**
 * Dexie Bridge Adapter — wraps existing Dexie DB in the IDbAdapter interface.
 *
 * Used ONLY in web/browser mode. Never loaded in Tauri builds.
 *
 * Phase 2 type notes:
 *  - `private table()` must use `unknown` cast then narrow, because Dexie's
 *    Table type is parameterized per-table and the TotalGestProDB type doesn't
 *    expose a typed index signature. The `as DexieTable` cast is the minimal
 *    safe boundary — all callers immediately invoke Dexie's own typed methods.
 *  - Filter fallback uses `Record<string, unknown>` to avoid any-spreading.
 */

import { TotalGestProDB } from '../../../db';
import {
  IDbAdapter, TableName, QueryOptions, FilterMap, AdapterStats,
  subscribeToTable, notifyTable,
} from './interface';
import { IS_READONLY } from '../environment';

// Minimal Dexie table interface — enough to type the operations we call
interface DexieTable {
  get(id: string): Promise<unknown>;
  put(data: unknown): Promise<unknown>;
  update(id: string, changes: Record<string, unknown>): Promise<number>;
  delete(id: string): Promise<void>;
  toArray(): Promise<unknown[]>;
  count(): Promise<number>;
  where(key: string): DexieWhereClause;
  orderBy(key: string): DexieCollection;
}

interface DexieWhereClause {
  equals(val: unknown): DexieCollection;
}

interface DexieCollection {
  toArray(): Promise<unknown[]>;
  reverse(): DexieCollection;
}

// Map adapter table names to Dexie table names
const DEXIE_TABLE: Record<TableName, string> = {
  settings: 'settings',
  contacts: 'contacts',
  items: 'items',
  templates: 'templates',
  quotes: 'quotes',
  recurring_quotes: 'recurringQuotes',
  invoices: 'invoices',
  recurring_invoices: 'recurringInvoices',
  expenses: 'expenses',
  payments: 'payments',
  communications: 'communications',
  inbox_threads: 'inboxThreads',
  inbox_messages: 'inboxMessages',
  inbox_templates: 'inboxTemplates',
  email_templates: 'emailTemplates',
  counters: 'counters',
};

export class DexieBridgeAdapter implements IDbAdapter {
  constructor(private db: TotalGestProDB) { }

  isReady(): boolean {
    return true;
  }

  // The cast to DexieTable is the single controlled any-boundary in this file.
  // Dexie doesn't expose a typed index-based table accessor without generics.
  private table(name: TableName): DexieTable {
    return (this.db as unknown as Record<string, DexieTable>)[DEXIE_TABLE[name]];
  }

  async get<T>(table: TableName, id: string): Promise<T | null> {
    const result = await this.table(table).get(id);
    return (result as T) ?? null;
  }

  async put<T extends { id: string }>(table: TableName, data: T): Promise<string> {
    if (IS_READONLY) return data.id;
    await this.table(table).put(data);
    notifyTable(table);
    return data.id;
  }

  async update<T>(table: TableName, id: string, partial: Partial<T>): Promise<void> {
    if (IS_READONLY) return;
    await this.table(table).update(id, {
      ...(partial as Record<string, unknown>),
      updatedAt: Date.now(),
    });
    notifyTable(table);
  }

  async delete(table: TableName, id: string): Promise<void> {
    if (IS_READONLY) return;
    await this.table(table).delete(id);
    notifyTable(table);
  }

  async query<T>(table: TableName, options: QueryOptions = {}): Promise<T[]> {
    let results: T[];
    const t = this.table(table);

    if (options.filter) {
      const entries = Object.entries(options.filter) as [string, string | number | boolean][];
      if (entries.length > 0) {
        const [key, val] = entries[0];
        const dexieKey = toCamelCase(key);
        try {
          const col = t.where(dexieKey).equals(val);
          const rows = await col.toArray();
          // Apply remaining filter entries in JS
          results = (rows as T[]).filter(r => {
            const record = r as Record<string, unknown>;
            return entries.every(([k, v]) => record[toCamelCase(k)] === v);
          });
        } catch {
          // Index not available — full scan with JS filter
          const all = await t.toArray() as T[];
          results = all.filter(r => {
            const record = r as Record<string, unknown>;
            return entries.every(([k, v]) => record[toCamelCase(k)] === v);
          });
        }
      } else {
        results = (await t.toArray()) as T[];
      }
    } else {
      results = (await t.toArray()) as T[];
    }

    if (options.orderBy) {
      const parts = options.orderBy.split(' ');
      const col = toCamelCase(parts[0]);
      const desc = parts[1]?.toUpperCase() === 'DESC';
      try {
        const ordered = await t.orderBy(col).toArray() as T[];
        if (desc) ordered.reverse();
        results = ordered;
      } catch {
        // orderBy not indexed — keep existing order
      }
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async count(table: TableName, filter?: FilterMap): Promise<number> {
    if (!filter || Object.keys(filter).length === 0) {
      return this.table(table).count();
    }
    const results = await this.query(table, { filter });
    return results.length;
  }

  subscribe(table: TableName, callback: () => void): () => void {
    return subscribeToTable(table, callback);
  }

  notify(table: TableName): void {
    notifyTable(table);
  }

  async stats(): Promise<AdapterStats> {
    const tables: TableName[] = [
      'contacts', 'invoices', 'quotes', 'expenses', 'items', 'templates',
    ];
    const result: AdapterStats = {};
    for (const t of tables) {
      result[t] = await this.count(t);
    }
    return result;
  }
}

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
