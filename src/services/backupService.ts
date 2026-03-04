/**
 * backupService.ts — Unified backup API
 *
 * Phase 3: Single surface exposed to the UI regardless of environment.
 *
 * Desktop (Tauri):
 *   backupNow()           → Rust create_backup  (VACUUM INTO — atomic SQLite snapshot)
 *   listDesktopBackups()  → Rust list_backups
 *   restoreDesktopBackup()→ Rust restore_backup + notifyTables() so React re-renders
 *
 * Web fallback:
 *   backupNow()           → JSON export via adapter.query (all tables → download)
 *   restoreBackup()       → adapter.put (JSON restore)
 *   analyzeBackupFile()   → parse + validate JSON backup
 *
 * Phase 4: Dexie/IndexedDB is NEVER referenced directly here.
 *          All data access goes through the adapter abstraction.
 */

import { IS_TAURI } from '@/core/environment';
import { getAdapter, notifyTables } from '@/core/db-adapter';
import type { TableName } from '@/core/db-adapter';
import { v4 as uuidv4 } from 'uuid';
import type {
  Contact, Invoice, Quote, Expense, CatalogItem, CompanySettings,
  DocumentTemplate, RecurringInvoiceTemplate, RecurringQuoteTemplate,
  Payment, Counter, InboxThread, InboxMessage, InboxTemplate, EmailTemplate,
} from '../../types';

export const CURRENT_BACKUP_VERSION = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackupData {
  version:           number;
  timestamp:         number;
  settings?:         CompanySettings[];
  contacts?:         Contact[];
  items?:            CatalogItem[];
  invoices?:         Invoice[];
  quotes?:           Quote[];
  expenses?:         Expense[];
  payments?:         Payment[];
  templates?:        DocumentTemplate[];
  recurringInvoices?:RecurringInvoiceTemplate[];
  recurringQuotes?:  RecurringQuoteTemplate[];
  counters?:         Counter[];
  inboxThreads?:     InboxThread[];
  inboxMessages?:    InboxMessage[];
  inboxTemplates?:   InboxTemplate[];
  emailTemplates?:   EmailTemplate[];
}

export interface ImportPreview {
  valid:      boolean;
  version?:   number;
  timestamp?: number;
  summary?:   Record<string, number>;
  error?:     string;
  data?:      BackupData;
}

// All tables — used for full export and restore
const ALL_TABLES: Array<{ table: TableName; key: keyof BackupData }> = [
  { table: 'settings',          key: 'settings'          },
  { table: 'contacts',          key: 'contacts'          },
  { table: 'items',             key: 'items'             },
  { table: 'invoices',          key: 'invoices'          },
  { table: 'quotes',            key: 'quotes'            },
  { table: 'expenses',          key: 'expenses'          },
  { table: 'payments',          key: 'payments'          },
  { table: 'templates',         key: 'templates'         },
  { table: 'recurring_invoices',key: 'recurringInvoices' },
  { table: 'recurring_quotes',  key: 'recurringQuotes'   },
  { table: 'counters',          key: 'counters'          },
  { table: 'inbox_threads',     key: 'inboxThreads'      },
  { table: 'inbox_messages',    key: 'inboxMessages'     },
  { table: 'inbox_templates',   key: 'inboxTemplates'    },
  { table: 'email_templates',   key: 'emailTemplates'    },
];

const ALL_TABLE_NAMES = ALL_TABLES.map(({ table }) => table);

// ─── Phase 3: Tauri-specific (Rust commands) ─────────────────────────────────
// These are the primary backup operations for desktop mode.
// All go through Rust — no JS data serialization needed.

async function tauriCreateBackup(): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await invoke<string>('create_backup');
  return path;
}

async function tauriListBackups(): Promise<string[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string[]>('list_backups');
}

async function tauriRestoreBackup(backupPath: string): Promise<boolean> {
  const { invoke } = await import('@tauri-apps/api/core');
  const ok = await invoke<boolean>('restore_backup', { backupPath });
  if (ok) {
    // Phase 3: Notify ALL tables so every active useQuery() re-fetches
    notifyTables(ALL_TABLE_NAMES);
  }
  return ok;
}

// ─── JSON backup (adapter-based, web mode) ────────────────────────────────────

/**
 * Create a full JSON snapshot of all tables via the adapter.
 * Used in web mode. In Tauri mode, prefer tauriCreateBackup().
 */
export const createBackup = async (): Promise<BackupData> => {
  const adapter = getAdapter();
  // Build result incrementally — typed as Partial<BackupData> during assembly
  const result: Partial<BackupData> = { version: CURRENT_BACKUP_VERSION, timestamp: Date.now() };
  await Promise.all(
    ALL_TABLES.map(async ({ table, key }) => {
      // adapter.query returns unknown[] — we cast to the BackupData field type.
      // The adapter is the single source of truth; type safety is enforced at the
      // Rust boundary (db_query returns correctly shaped JSON blobs).
      (result as Record<string, unknown>)[key] = await adapter.query(table);
    }),
  );
  return result as BackupData;
};

export const downloadBackup = (data: BackupData): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `contikpro_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportBackup = async (): Promise<void> => {
  downloadBackup(await createBackup());
};

/**
 * Restore from JSON data.
 * Optionally clears all existing records first.
 */
export const restoreBackup = async (
  data:          BackupData,
  clearExisting: boolean,
): Promise<{ created: Record<string, number>; updated: Record<string, number> }> => {
  const adapter = getAdapter();
  const created: Record<string, number> = {};
  const updated: Record<string, number> = {};

  if (clearExisting) {
    for (const { table } of ALL_TABLES) {
      const rows = await adapter.query<{ id?: string; key?: string }>(table);
      for (const row of rows) {
        const id = row.id ?? row.key;
        if (id) await adapter.delete(table, id);
      }
    }
  }

  // Settings always written as id='default'
  if (data.settings?.length) {
    const def = data.settings.find(s => s.id === 'default') ?? data.settings[0];
    if (def) {
      await adapter.put('settings', { ...def, id: 'default' });
      clearExisting ? (created.settings = 1) : (updated.settings = 1);
    }
  }

  // Generic upsert for all other tables — items must have an id field
  type RecordWithId = { id?: string; key?: string; [k: string]: unknown };

  const processTable = async (
    table:   TableName,
    items:   RecordWithId[],
    keyName: string,
  ): Promise<void> => {
    if (!items?.length) return;
    for (const item of items) {
      await adapter.put(table, { ...item, id: item.id ?? item.key ?? uuidv4() } as RecordWithId & { id: string });
    }
    clearExisting ? (created[keyName] = items.length) : (updated[keyName] = items.length);
  };

  const pairs: Array<[TableName, RecordWithId[] | undefined, string]> = [
    ['contacts',          data.contacts,          'contacts'         ],
    ['items',             data.items,             'items'            ],
    ['invoices',          data.invoices,          'invoices'         ],
    ['quotes',            data.quotes,            'quotes'           ],
    ['expenses',          data.expenses,          'expenses'         ],
    ['payments',          data.payments,          'payments'         ],
    ['templates',         data.templates,         'templates'        ],
    ['recurring_invoices',data.recurringInvoices, 'recurringInvoices'],
    ['recurring_quotes',  data.recurringQuotes,   'recurringQuotes'  ],
    ['counters',          data.counters,          'counters'         ],
    ['inbox_threads',     data.inboxThreads,      'inboxThreads'     ],
    ['inbox_messages',    data.inboxMessages,     'inboxMessages'    ],
    ['inbox_templates',   data.inboxTemplates,    'inboxTemplates'   ],
    ['email_templates',   data.emailTemplates,    'emailTemplates'   ],
  ];

  for (const [t, items, k] of pairs) {
    await processTable(t, items ?? [], k);
  }

  // Notify all tables so React components re-render
  notifyTables(ALL_TABLE_NAMES);

  return { created, updated };
};

// ─── Snapshot / undo ─────────────────────────────────────────────────────────
// Used by ImportWizard to allow a single-step undo after a bulk import.

let _snapshot: BackupData | null = null;

export const createSnapshot = async (): Promise<void> => {
  _snapshot = await createBackup();
};

export const restoreSnapshot = async (): Promise<{ success: boolean; message: string }> => {
  if (!_snapshot) return { success: false, message: 'No hay snapshot disponible.' };
  try {
    await restoreBackup(_snapshot, true);
    return { success: true, message: 'Estado restaurado.' };
  } catch (e) {
    return { success: false, message: 'Error: ' + (e as Error).message };
  }
};

export const discardSnapshot = (): void => { _snapshot = null; };

// ─── File analysis ────────────────────────────────────────────────────────────

export const analyzeBackupFile = async (file: File): Promise<ImportPreview> => {
  try {
    const data = JSON.parse(await file.text());
    if (!data.version || !data.timestamp) {
      return { valid: false, error: 'Formato no válido.' };
    }
    return {
      valid:     true,
      version:   data.version,
      timestamp: data.timestamp,
      summary: {
        contacts:       data.contacts?.length       ?? 0,
        invoices:       data.invoices?.length       ?? 0,
        quotes:         data.quotes?.length         ?? 0,
        expenses:       data.expenses?.length       ?? 0,
        items:          data.items?.length          ?? 0,
        templates:      data.templates?.length      ?? 0,
        recurring:      (data.recurringInvoices?.length ?? 0) + (data.recurringQuotes?.length ?? 0),
        payments:       data.payments?.length       ?? 0,
        inbox:          data.inboxThreads?.length   ?? 0,
        emailTemplates: data.emailTemplates?.length ?? 0,
      },
      data,
    };
  } catch {
    return { valid: false, error: 'Error al leer el archivo.' };
  }
};

// ─── Unified public API ───────────────────────────────────────────────────────
// Single surface for all UI components — environment-agnostic.

/**
 * Create a backup.
 * Desktop → SQLite file in ContikProData/backups/ (returns path).
 * Web     → JSON download (returns undefined).
 */
export async function backupNow(): Promise<string | undefined> {
  if (IS_TAURI) return tauriCreateBackup();
  await exportBackup();
  return undefined;
}

/**
 * List available backups (desktop only).
 * Returns empty array in web mode.
 */
export async function listDesktopBackups(): Promise<string[]> {
  if (!IS_TAURI) return [];
  return tauriListBackups();
}

/**
 * Restore from a specific backup file (desktop only).
 * Notifies all useQuery() subscribers after restore.
 */
export async function restoreDesktopBackup(backupPath: string): Promise<boolean> {
  if (!IS_TAURI) throw new Error('Desktop backup restore requires Tauri.');
  return tauriRestoreBackup(backupPath);
}
