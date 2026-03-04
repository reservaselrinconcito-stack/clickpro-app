/**
 * adapter-api.ts
 * 
 * Thin wrapper around IDbAdapter that mirrors the old Dexie-based helper API.
 * All pages and services should import from here instead of from '../../db'.
 *
 * In Tauri → uses SQLiteAdapter (Rust/SQLite)
 * In browser → uses DexieBridgeAdapter (IndexedDB fallback)
 *
 * NEVER import 'dexie' or '../db' from pages/services — import this instead.
 */

import { getAdapter, notifyTable, type TableName } from '@/core/db-adapter';
import { v4 as uuidv4 } from 'uuid';
import type {
  Contact, CatalogItem, Invoice, Quote, Expense, Payment,
  DocumentTemplate, RecurringInvoiceTemplate, RecurringQuoteTemplate,
  CompanySettings, Communication, InboxThread, InboxMessage,
  InboxTemplate, EmailTemplate, Counter
} from '../../types';

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settingsApi = {
  get: (): Promise<CompanySettings | null> =>
    getAdapter().get<CompanySettings>('settings', 'default'),

  save: async (updates: Partial<CompanySettings>): Promise<void> => {
    const existing = await settingsApi.get();
    const merged: CompanySettings = {
      id: 'default',
      ...(existing || {}),
      ...updates,
      updatedAt: Date.now(),
    } as CompanySettings;
    await getAdapter().put('settings', merged);
  },

  all: (): Promise<CompanySettings[]> =>
    getAdapter().query<CompanySettings>('settings'),
};

// ─── Contacts ─────────────────────────────────────────────────────────────────

export const contactsApi = {
  all: (): Promise<Contact[]> =>
    getAdapter().query<Contact>('contacts'),

  byType: (type: 'client' | 'supplier'): Promise<Contact[]> =>
    getAdapter().query<Contact>('contacts', { filter: { type } }),

  get: (id: string): Promise<Contact | null> =>
    getAdapter().get<Contact>('contacts', id),

  add: async (data: Omit<Contact, 'id'> & { id?: string }): Promise<string> => {
    const id = data.id || uuidv4();
    await getAdapter().put('contacts', { ...data, id, createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  },

  update: (id: string, data: Partial<Contact>): Promise<void> =>
    getAdapter().update('contacts', id, { ...data, updatedAt: Date.now() }),

  delete: (id: string): Promise<void> =>
    getAdapter().delete('contacts', id),

  /** Find first contact matching nif (case-insensitive simulation via JS filter) */
  findByNif: async (nif: string): Promise<Contact | undefined> => {
    const all = await getAdapter().query<Contact>('contacts');
    return all.find(c => c.nif?.toLowerCase() === nif.toLowerCase());
  },

  findByEmail: async (email: string): Promise<Contact | undefined> => {
    const all = await getAdapter().query<Contact>('contacts');
    return all.find(c => c.email?.toLowerCase() === email.toLowerCase());
  },

  count: (): Promise<number> => getAdapter().count('contacts'),
};

// ─── Items (Catalog) ──────────────────────────────────────────────────────────

export const itemsApi = {
  all: (): Promise<CatalogItem[]> =>
    getAdapter().query<CatalogItem>('items'),

  get: (id: string): Promise<CatalogItem | null> =>
    getAdapter().get<CatalogItem>('items', id),

  add: async (data: Omit<CatalogItem, 'id'> & { id?: string }): Promise<string> => {
    const id = data.id || uuidv4();
    await getAdapter().put('items', { ...data, id, createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  },

  update: (id: string, data: Partial<CatalogItem>): Promise<void> =>
    getAdapter().update('items', id, { ...data, updatedAt: Date.now() }),

  delete: (id: string): Promise<void> =>
    getAdapter().delete('items', id),

  count: (): Promise<number> => getAdapter().count('items'),
};

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const invoicesApi = {
  all: (): Promise<Invoice[]> =>
    getAdapter().query<Invoice>('invoices', { orderBy: 'date DESC' }),

  get: (id: string): Promise<Invoice | null> =>
    getAdapter().get<Invoice>('invoices', id),

  findByNumber: async (number: string): Promise<Invoice | undefined> => {
    const all = await getAdapter().query<Invoice>('invoices');
    return all.find(i => i.number === number);
  },

  add: async (data: Omit<Invoice, 'id'> & { id?: string }): Promise<string> => {
    const id = data.id || uuidv4();
    await getAdapter().put('invoices', { ...data, id, createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  },

  put: async (data: Invoice): Promise<string> => {
    await getAdapter().put('invoices', { ...data, updatedAt: Date.now() });
    return data.id;
  },

  update: (id: string, data: Partial<Invoice>): Promise<void> =>
    getAdapter().update('invoices', id, { ...data, updatedAt: Date.now() }),

  delete: (id: string): Promise<void> =>
    getAdapter().delete('invoices', id),

  count: (): Promise<number> => getAdapter().count('invoices'),
};

// ─── Quotes ───────────────────────────────────────────────────────────────────

export const quotesApi = {
  all: (): Promise<Quote[]> =>
    getAdapter().query<Quote>('quotes', { orderBy: 'date DESC' }),

  get: (id: string): Promise<Quote | null> =>
    getAdapter().get<Quote>('quotes', id),

  findByNumber: async (number: string): Promise<Quote | undefined> => {
    const all = await getAdapter().query<Quote>('quotes');
    return all.find(q => q.number === number);
  },

  add: async (data: Omit<Quote, 'id'> & { id?: string }): Promise<string> => {
    const id = data.id || uuidv4();
    await getAdapter().put('quotes', { ...data, id, createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  },

  put: async (data: Quote): Promise<string> => {
    await getAdapter().put('quotes', { ...data, updatedAt: Date.now() });
    return data.id;
  },

  update: (id: string, data: Partial<Quote>): Promise<void> =>
    getAdapter().update('quotes', id, { ...data, updatedAt: Date.now() }),

  delete: (id: string): Promise<void> =>
    getAdapter().delete('quotes', id),

  count: (): Promise<number> => getAdapter().count('quotes'),
};

// ─── Recurring templates ──────────────────────────────────────────────────────

export const recurringInvoicesApi = {
  all: (): Promise<RecurringInvoiceTemplate[]> =>
    getAdapter().query<RecurringInvoiceTemplate>('recurring_invoices'),

  get: (id: string): Promise<RecurringInvoiceTemplate | null> =>
    getAdapter().get<RecurringInvoiceTemplate>('recurring_invoices', id),

  /** Returns overdue active templates (nextRun <= now) */
  dueNow: async (): Promise<RecurringInvoiceTemplate[]> => {
    const now = Date.now();
    const all = await getAdapter().query<RecurringInvoiceTemplate>('recurring_invoices');
    return all.filter(r => r.active && (r.nextRun ?? 0) <= now);
  },

  put: (data: RecurringInvoiceTemplate) =>
    getAdapter().put('recurring_invoices', { ...data, updatedAt: Date.now() }),

  update: (id: string, data: Partial<RecurringInvoiceTemplate>) =>
    getAdapter().update('recurring_invoices', id, { ...data, updatedAt: Date.now() }),

  delete: (id: string) => getAdapter().delete('recurring_invoices', id),
};

export const recurringQuotesApi = {
  all: (): Promise<RecurringQuoteTemplate[]> =>
    getAdapter().query<RecurringQuoteTemplate>('recurring_quotes'),

  get: (id: string): Promise<RecurringQuoteTemplate | null> =>
    getAdapter().get<RecurringQuoteTemplate>('recurring_quotes', id),

  dueNow: async (): Promise<RecurringQuoteTemplate[]> => {
    const now = Date.now();
    const all = await getAdapter().query<RecurringQuoteTemplate>('recurring_quotes');
    return all.filter(r => r.active && (r.nextRun ?? 0) <= now);
  },

  put: (data: RecurringQuoteTemplate) =>
    getAdapter().put('recurring_quotes', { ...data, updatedAt: Date.now() }),

  update: (id: string, data: Partial<RecurringQuoteTemplate>) =>
    getAdapter().update('recurring_quotes', id, { ...data, updatedAt: Date.now() }),

  delete: (id: string) => getAdapter().delete('recurring_quotes', id),
};

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expensesApi = {
  all: (): Promise<Expense[]> =>
    getAdapter().query<Expense>('expenses', { orderBy: 'date DESC' }),

  get: (id: string): Promise<Expense | null> =>
    getAdapter().get<Expense>('expenses', id),

  add: async (data: Omit<Expense, 'id'> & { id?: string }): Promise<string> => {
    const id = data.id || uuidv4();
    await getAdapter().put('expenses', { ...data, id, createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  },

  update: (id: string, data: Partial<Expense>): Promise<void> =>
    getAdapter().update('expenses', id, { ...data, updatedAt: Date.now() }),

  delete: (id: string): Promise<void> =>
    getAdapter().delete('expenses', id),
};

// ─── Payments ─────────────────────────────────────────────────────────────────

export const paymentsApi = {
  all: (): Promise<Payment[]> =>
    getAdapter().query<Payment>('payments'),

  add: async (data: Omit<Payment, 'id'> & { id?: string }): Promise<string> => {
    const id = data.id || uuidv4();
    await getAdapter().put('payments', { ...data, id, createdAt: Date.now() });
    return id;
  },

  delete: (id: string): Promise<void> =>
    getAdapter().delete('payments', id),
};

// ─── Document Templates ───────────────────────────────────────────────────────

export const templatesApi = {
  all: (): Promise<DocumentTemplate[]> =>
    getAdapter().query<DocumentTemplate>('templates'),

  byType: (type: 'invoice' | 'quote'): Promise<DocumentTemplate[]> =>
    getAdapter().query<DocumentTemplate>('templates', { filter: { type } }),

  get: (id: string): Promise<DocumentTemplate | null> =>
    getAdapter().get<DocumentTemplate>('templates', id),

  add: async (data: Omit<DocumentTemplate, 'id'> & { id?: string }): Promise<string> => {
    const id = data.id || uuidv4();
    await getAdapter().put('templates', { ...data, id, createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  },

  update: (id: string, data: Partial<DocumentTemplate>): Promise<void> =>
    getAdapter().update('templates', id, { ...data, updatedAt: Date.now() }),

  delete: (id: string): Promise<void> =>
    getAdapter().delete('templates', id),

  setDefault: async (type: 'invoice' | 'quote', id: string): Promise<void> => {
    const all = await templatesApi.byType(type);
    for (const t of all) {
      await getAdapter().update('templates', t.id, { isDefault: t.id === id, updatedAt: Date.now() });
    }
  },
};

// ─── Communications ───────────────────────────────────────────────────────────

export const communicationsApi = {
  all: (): Promise<Communication[]> =>
    getAdapter().query<Communication>('communications', { orderBy: 'date DESC' }),

  get: (id: string): Promise<Communication | null> =>
    getAdapter().get<Communication>('communications', id),

  add: async (data: Partial<Communication>): Promise<string> => {
    const id = data.id || uuidv4();
    await getAdapter().put('communications', { ...data, id, date: Date.now() } as Communication);
    return id;
  },

  update: (id: string, data: Partial<Communication>): Promise<void> =>
    getAdapter().update('communications', id, data),

  delete: (id: string): Promise<void> =>
    getAdapter().delete('communications', id),
};

// ─── Inbox ────────────────────────────────────────────────────────────────────

export const inboxApi = {
  threads: {
    all: (): Promise<InboxThread[]> =>
      getAdapter().query<InboxThread>('inbox_threads', { orderBy: 'last_message_at DESC' }),

    get: (id: string): Promise<InboxThread | null> =>
      getAdapter().get<InboxThread>('inbox_threads', id),

    getByParty: async (partyId: string): Promise<InboxThread | undefined> => {
      const all = await getAdapter().query<InboxThread>('inbox_threads');
      return all.find(t => t.partyId === partyId);
    },

    upsert: (data: InboxThread): Promise<string> =>
      getAdapter().put('inbox_threads', { ...data, updatedAt: Date.now() }),

    delete: (id: string): Promise<void> =>
      getAdapter().delete('inbox_threads', id),
  },

  messages: {
    byThread: async (threadId: string): Promise<InboxMessage[]> => {
      const all = await getAdapter().query<InboxMessage>('inbox_messages');
      return all
        .filter(m => m.threadId === threadId)
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    },

    add: async (data: Partial<InboxMessage>): Promise<string> => {
      const id = data.id || uuidv4();
      await getAdapter().put('inbox_messages', {
        ...data,
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: data.status || 'draft',
      } as InboxMessage);
      return id;
    },

    update: (id: string, data: Partial<InboxMessage>): Promise<void> =>
      getAdapter().update('inbox_messages', id, { ...data, updatedAt: Date.now() }),

    delete: (id: string): Promise<void> =>
      getAdapter().delete('inbox_messages', id),
  },

  templates: {
    all: (): Promise<InboxTemplate[]> =>
      getAdapter().query<InboxTemplate>('inbox_templates'),

    add: async (data: Partial<InboxTemplate>): Promise<string> => {
      const id = data.id || uuidv4();
      await getAdapter().put('inbox_templates', {
        ...data,
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as InboxTemplate);
      return id;
    },

    delete: (id: string): Promise<void> =>
      getAdapter().delete('inbox_templates', id),
  },

  emailTemplates: {
    all: async (): Promise<EmailTemplate[]> => {
      const list = await getAdapter().query<EmailTemplate>('email_templates');
      return list.map(t => ({ ...t, blocks: t.blocks || [] }));
    },

    get: async (id: string): Promise<EmailTemplate | undefined> => {
      const t = await getAdapter().get<EmailTemplate>('email_templates', id);
      return t ? { ...t, blocks: t.blocks || [] } : undefined;
    },

    add: async (data: Partial<EmailTemplate>): Promise<string> => {
      const id = data.id || uuidv4();
      await getAdapter().put('email_templates', {
        ...data,
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as EmailTemplate);
      return id;
    },

    update: (id: string, data: Partial<EmailTemplate>): Promise<void> =>
      getAdapter().update('email_templates', id, { ...data, updatedAt: Date.now() }),

    delete: (id: string): Promise<void> =>
      getAdapter().delete('email_templates', id),
  },
};

// ─── Counters ─────────────────────────────────────────────────────────────────

/**
 * Internal row shape stored in the 'counters' table.
 * Counter.key maps to 'id' (the adapter's universal primary key).
 * Both 'id' and 'key' are persisted so both SQLite and Dexie bridges work.
 */
interface CounterRow {
  id: string;
  key: string;
  value: number;
}

export const countersApi = {
  get: async (key: string): Promise<Counter | null> => {
    const raw = await getAdapter().get<CounterRow>('counters', key);
    if (!raw) return null;
    return { key: raw.id ?? raw.key, value: raw.value };
  },

  put: (data: Counter): Promise<string> => {
    const row: CounterRow = { id: data.key, key: data.key, value: data.value };
    return getAdapter().put<CounterRow>('counters', row);
  },

  all: async (): Promise<Counter[]> => {
    const rows = await getAdapter().query<CounterRow>('counters');
    return rows.map(r => ({ key: r.id ?? r.key, value: r.value }));
  },
};

// ─── Notify helpers (for manual cache invalidation) ──────────────────────────

export const notify = {
  table: (t: TableName) => notifyTable(t),
  contacts: () => notifyTable('contacts'),
  invoices: () => notifyTable('invoices'),
  quotes: () => notifyTable('quotes'),
  expenses: () => notifyTable('expenses'),
  items: () => notifyTable('items'),
  settings: () => notifyTable('settings'),
  templates: () => notifyTable('templates'),
  communications: () => notifyTable('communications'),
  inboxThreads: () => notifyTable('inbox_threads'),
  inboxMessages: () => notifyTable('inbox_messages'),
  emailTemplates: () => notifyTable('email_templates'),
};
