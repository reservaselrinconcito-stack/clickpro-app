
import Dexie, { Table } from 'dexie';
import { Communication, CompanySettings, Contact, CatalogItem, DocumentTemplate, Quote, Invoice, Expense, Payment, LineItem, InboxThread, InboxMessage, InboxTemplate, EmailTemplate, RecurringQuoteTemplate, RecurringInvoiceTemplate, TemplateBlockType, Counter } from './types';
import { v4 as uuidv4 } from 'uuid';
import { IS_DEMO } from '@/core/environment';

export class TotalGestProDB extends Dexie {
  settings!: Table<CompanySettings>;
  contacts!: Table<Contact>;
  items!: Table<CatalogItem>;
  templates!: Table<DocumentTemplate>;
  quotes!: Table<Quote>;
  recurringQuotes!: Table<RecurringQuoteTemplate>;
  invoices!: Table<Invoice>;
  recurringInvoices!: Table<RecurringInvoiceTemplate>;
  expenses!: Table<Expense>;
  payments!: Table<Payment>;
  inboxThreads!: Table<InboxThread>;
  inboxMessages!: Table<InboxMessage>;
  inboxTemplates!: Table<InboxTemplate>;
  emailTemplates!: Table<EmailTemplate>;
  communications!: Table<Communication>;
  counters!: Table<Counter, string>;

  constructor() {
    super(IS_DEMO ? 'ContikPro_DemoDB' : 'TotalGestProDB');
    (this as any).version(10).stores({
      settings: 'id',
      contacts: 'id, type, name, nif',
      items: 'id, name, sku, category, active',
      templates: 'id, type, isDefault, *tags',
      quotes: 'id, contactId, status, date',
      recurringQuotes: 'id, name, active, nextRun',
      invoices: 'id, contactId, status, date, quoteId',
      recurringInvoices: 'id, name, active, nextRun',
      expenses: 'id, date, supplierId, category',
      payments: 'id, invoiceId, date',
      communications: 'id, contactId, type, status, date'
    });

    (this as any).version(11).stores({
      counters: 'key'
    });

    (this as any).version(12).stores({
      inboxThreads: 'id, partyId, partyType, lastMessageAt',
      inboxMessages: 'id, threadId, channel, status, createdAt'
    });

    (this as any).version(13).stores({
      inboxThreads: 'id, partyType, partyId, updatedAt, lastMessageAt',
      inboxMessages: 'id, threadId, channel, status, createdAt, updatedAt, sentAt'
    });

    (this as any).version(14).stores({
      inboxTemplates: 'id, name, channel'
    });

    (this as any).version(15).stores({
      emailTemplates: 'id, name, updatedAt'
    });
  }
}

export const db = new TotalGestProDB();

// --- API LAYER ---

export const inbox = {
  threads: {
    list: () => db.inboxThreads.orderBy('lastMessageAt').reverse().toArray(),
    get: (id: string) => db.inboxThreads.get(id),
    getByParty: (partyId: string) => db.inboxThreads.where('partyId').equals(partyId).first(),
    upsert: (data: InboxThread) => db.inboxThreads.put(data),
    remove: (id: string) => db.inboxThreads.delete(id),
  },
  messages: {
    list: (threadId: string) => db.inboxMessages.where('threadId').equals(threadId).sortBy('createdAt'),
    add: (data: Partial<InboxMessage>) => db.inboxMessages.add({
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'draft',
      ...data
    } as InboxMessage),
    update: (id: string, data: Partial<InboxMessage>) => db.inboxMessages.update(id, { ...data, updatedAt: Date.now() }),
    remove: (id: string) => db.inboxMessages.delete(id),
  },
  templates: {
    list: () => db.inboxTemplates.toArray(),
    add: (data: Partial<InboxTemplate>) => db.inboxTemplates.add({
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...data
    } as InboxTemplate),
    remove: (id: string) => db.inboxTemplates.delete(id)
  },
  emailTemplates: {
    list: async () => {
      const list = await db.emailTemplates.toArray();
      return list.map(t => ({ ...t, blocks: t.blocks || [] }));
    },
    get: async (id: string) => {
      const t = await db.emailTemplates.get(id);
      if (t) return { ...t, blocks: t.blocks || [] };
      return undefined;
    },
    add: (data: Partial<EmailTemplate>) => db.emailTemplates.add({
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...data
    } as EmailTemplate),
    update: (id: string, data: Partial<EmailTemplate>) => db.emailTemplates.update(id, { ...data, updatedAt: Date.now() }),
    remove: (id: string) => db.emailTemplates.delete(id)
  }
};

export const clients = {
  list: () => db.contacts.where('type').equals('client').toArray(),
  get: (id: string) => db.contacts.get(id),
  add: (data: Partial<Contact>) => db.contacts.add({ ...data, type: 'client', createdAt: Date.now(), updatedAt: Date.now() } as Contact),
  update: (id: string, data: Partial<Contact>) => db.contacts.update(id, { ...data, updatedAt: Date.now() }),
  remove: (id: string) => db.contacts.delete(id)
};

export const suppliers = {
  list: () => db.contacts.where('type').equals('supplier').toArray(),
  get: (id: string) => db.contacts.get(id),
  add: (data: Partial<Contact>) => db.contacts.add({ ...data, type: 'supplier', createdAt: Date.now(), updatedAt: Date.now() } as Contact),
  update: (id: string, data: Partial<Contact>) => db.contacts.update(id, { ...data, updatedAt: Date.now() }),
  remove: (id: string) => db.contacts.delete(id)
};

export const catalog = {
  list: () => db.items.toArray(),
  get: (id: string) => db.items.get(id),
  add: (data: Partial<CatalogItem>) => db.items.add({ ...data, active: true, createdAt: Date.now(), updatedAt: Date.now() } as CatalogItem),
  update: (id: string, data: Partial<CatalogItem>) => db.items.update(id, { ...data, updatedAt: Date.now() }),
  remove: (id: string) => db.items.delete(id)
};

export const communications = {
  list: () => db.communications.orderBy('date').reverse().toArray(),
  get: (id: string) => db.communications.get(id),
  add: (data: Partial<Communication>) => db.communications.add({ ...data, id: (data as any).id || uuidv4(), date: Date.now() } as Communication),
  update: (id: string, data: Partial<Communication>) => db.communications.update(id, { ...data, updatedAt: Date.now() }),
  remove: (id: string) => db.communications.delete(id)
};


export const templates = {
  list: (type: 'invoice' | 'quote') => db.templates.where('type').equals(type).toArray(),
  get: (id: string) => db.templates.get(id),
  add: (data: Partial<DocumentTemplate>) => db.templates.add({ ...data, createdAt: Date.now(), updatedAt: Date.now() } as DocumentTemplate),
  update: (id: string, data: Partial<DocumentTemplate>) => db.templates.update(id, { ...data, updatedAt: Date.now() }),
  remove: (id: string) => db.templates.delete(id),
  setDefault: (type: 'invoice' | 'quote', id: string) => {
    return (db as any).transaction('rw', db.templates, async () => {
      await db.templates.where('type').equals(type).filter(t => t.isDefault).modify({ isDefault: false, updatedAt: Date.now() });
      await db.templates.update(id, { isDefault: true, updatedAt: Date.now() });
    });
  }
};

export const quotes = {
  list: () => db.quotes.orderBy('date').reverse().toArray(),
  get: (id: string) => db.quotes.get(id),
  add: (data: Partial<Quote>) => db.quotes.add({ ...data, createdAt: Date.now(), updatedAt: Date.now() } as Quote),
  update: (id: string, data: Partial<Quote>) => db.quotes.update(id, { ...data, updatedAt: Date.now() }),
  remove: (id: string) => db.quotes.delete(id)
};

export const recurringQuotes = {
  list: () => db.recurringQuotes.toArray(),
  get: (id: string) => db.recurringQuotes.get(id),
  add: (data: Partial<RecurringQuoteTemplate>) => db.recurringQuotes.add({ ...data, createdAt: Date.now(), updatedAt: Date.now() } as RecurringQuoteTemplate),
  update: (id: string, data: Partial<RecurringQuoteTemplate>) => db.recurringQuotes.update(id, { ...data, updatedAt: Date.now() }),
  remove: (id: string) => db.recurringQuotes.delete(id)
};

export const invoices = {
  list: () => db.invoices.orderBy('date').reverse().toArray(),
  get: (id: string) => db.invoices.get(id),
  add: (data: Partial<Invoice>) => db.invoices.add({ ...data, createdAt: Date.now(), updatedAt: Date.now() } as Invoice),
  update: (id: string, data: Partial<Invoice>) => db.invoices.update(id, { ...data, updatedAt: Date.now() }),
  remove: (id: string) => db.invoices.delete(id)
};

export const recurringInvoices = {
  list: () => db.recurringInvoices.toArray(),
  get: (id: string) => db.recurringInvoices.get(id),
  add: (data: Partial<RecurringInvoiceTemplate>) => db.recurringInvoices.add({ ...data, createdAt: Date.now(), updatedAt: Date.now() } as RecurringInvoiceTemplate),
  update: (id: string, data: Partial<RecurringInvoiceTemplate>) => db.recurringInvoices.update(id, { ...data, updatedAt: Date.now() }),
  remove: (id: string) => db.recurringInvoices.delete(id)
};

// --- DEFAULT SETTINGS HELPER ---

export const getDefaultSettings = (): CompanySettings => ({
  id: 'default',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  companyName: 'Mi Empresa Creativa',
  address: 'Calle Mayor 1',
  addressLine1: 'Calle Mayor 1',
  zip: '28001',
  postalCode: '28001',
  city: 'Madrid',
  province: 'Madrid',
  country: 'España',
  email: 'info@miempresa.com',
  phone: '+34 600 000 000',
  website: 'www.miempresa.com',
  iban: 'ES00 0000 0000 0000 0000 0000',
  swift: '',
  bankName: 'Banco Ejemplo',
  legalTerms: 'Inscrita en el Registro Mercantil de Madrid. Tomo 1234, Folio 12, Sección 8, Hoja M-12345.',
  fiscalName: 'Mi Empresa S.L.',
  legalName: 'Mi Empresa S.L.',
  nif: 'B12345678',
  taxId: 'B12345678',
  currency: 'EUR',
  invoicePrefix: 'F2025-',
  invoiceCounter: 10,
  quotePrefix: 'P2025-',
  quoteCounter: 5,
  numerationType: 'annual',
  primaryColor: '#2563eb',
  defaultVat: 21,
  enabledVatRates: [0, 4, 10, 21],
  defaultRetention: 15,
  applyRetentionByDefault: false,
  social: {
    instagram: '@miempresa',
    linkedin: 'company/miempresa',
    facebook: 'miempresa'
  },
  presence: {
    website: 'www.miempresa.com',
    instagram: '@miempresa',
    facebook: 'miempresa',
    linkedin: 'company/miempresa',
    whatsappDefaultCountry: '+34'
  }
});

export const resetSettings = async () => {
  await db.settings.put(getDefaultSettings());
};

// --- SEED & RESET ---

export const seedData = async () => {
  const count = await db.settings.count();
  if (count > 0) return;

  const now = Date.now();
  const dateStr = new Date().toISOString().split('T')[0];

  await (db as any).transaction('rw', db.settings, db.contacts, db.items, db.templates, db.quotes, db.recurringQuotes, db.invoices, db.recurringInvoices, db.expenses, db.inboxTemplates, db.emailTemplates, async () => {

    // 1. Settings
    await db.settings.add(getDefaultSettings());

    // 2. Contacts
    const clientId1 = 'c1';
    await db.contacts.add({
      id: clientId1,
      type: 'client',
      name: 'Cliente Ejemplo 1',
      nif: 'B10000001',
      email: 'cliente1@test.com',
      phone: '911223344',
      address: 'Avda. Principal 10',
      city: 'Barcelona',
      zip: '08001',
      province: 'Barcelona',
      country: 'España',
      notes: 'Cliente VIP',
      createdAt: now,
      updatedAt: now
    });

    const clientId2 = 'c2';
    await db.contacts.add({
      id: clientId2,
      type: 'client',
      name: 'Cliente Ejemplo 2',
      nif: 'B10000002',
      email: 'cliente2@test.com',
      phone: '600111222',
      address: 'Calle Secundaria 5',
      city: 'Madrid',
      zip: '28002',
      province: 'Madrid',
      country: 'España',
      notes: '',
      createdAt: now,
      updatedAt: now
    });

    const supplierId1 = 's1';
    await db.contacts.add({
      id: supplierId1,
      type: 'supplier',
      name: 'Proveedor Software SL',
      nif: 'B99999999',
      email: 'soporte@proveedor.com',
      phone: '',
      address: '',
      city: '',
      zip: '',
      province: '',
      country: '',
      notes: '',
      createdAt: now,
      updatedAt: now
    });

    // 3. Items (Catalog)
    const itemId1 = 'i1';
    await db.items.add({
      id: itemId1,
      sku: 'WEB-001',
      name: 'Diseño Web Básico',
      description: 'Landing page simple',
      category: 'Desarrollo',
      unit: 'proyecto',
      price: 500,
      vatPct: 21,
      active: true,
      type: 'service',
      createdAt: now,
      updatedAt: now
    });

    const itemId2 = 'i2';
    await db.items.add({
      id: itemId2,
      sku: 'CON-001',
      name: 'Consultoría Hora',
      description: 'Consultoría técnica',
      category: 'Servicios',
      unit: 'hora',
      price: 80,
      vatPct: 21,
      active: true,
      type: 'service',
      createdAt: now,
      updatedAt: now
    });

    // 4. Templates (4 SEEDS EDITABLES)
    const baseConfig = {
      layout: ['header', 'client', 'lines', 'totals', 'footer'] as TemplateBlockType[],
      design: { primaryColor: '#2563eb', secondaryColor: '#1e40af', font: 'helvetica', headerStyle: 'classic' as any, headerAlignment: 'left', logoSize: 'M' as any, fontSizeBase: 10, textColor: '#1f2937' },
      header: { showLogo: true, showCompanyDetails: true, slogan: '' },
      client: { label: 'Facturar a:', showVat: true, showAddress: true, showEmail: false },
      columns: { quantity: true, unit: false, price: true, vat: false, discount: true, total: true },
      totals: { showSubtotal: true, showVatBreakdown: true, showTotal: true, labels: { subtotal: 'Base Imponible', vat: 'IVA', total: 'TOTAL' } },
      footer: { showBankDetails: true, thanksMessage: 'Gracias por su confianza.', showSignature: false }
    };

    // Factura 21% (default)
    await db.templates.add({
      id: 't_inv_21', type: 'invoice', name: 'Factura Estándar (21%)',
      defaultVat: 21, defaultNotes: 'Forma de pago: Transferencia a 30 días.', isDefault: true, tags: ['Estándar', 'IVA 21'],
      config: { ...baseConfig, design: { ...baseConfig.design, headerStyle: 'classic', headerAlignment: 'left', logoSize: 'M' } },
      createdAt: now, updatedAt: now
    });

    // Factura 10%
    await db.templates.add({
      id: 't_inv_10', type: 'invoice', name: 'Factura Reducida (10%)',
      defaultVat: 10, defaultNotes: 'Aplicado tipo reducido.', isDefault: false, tags: ['Reducido'],
      config: { ...baseConfig, design: { ...baseConfig.design, headerStyle: 'modern', primaryColor: '#059669', headerAlignment: 'left', logoSize: 'M' } },
      createdAt: now, updatedAt: now
    });

    // Presupuesto Obra Larga (default)
    await db.templates.add({
      id: 't_quo_long', type: 'quote', name: 'Presupuesto Obra Larga',
      defaultVat: 21, defaultNotes: 'Validez: 30 días. 50% por adelantado.', isDefault: true, tags: ['Obra'],
      config: { ...baseConfig, client: { ...baseConfig.client, label: 'Presupuesto para:' }, design: { ...baseConfig.design, headerStyle: 'bold', primaryColor: '#7c3aed', headerAlignment: 'left', logoSize: 'M' } },
      createdAt: now, updatedAt: now
    });

    // Presupuesto Obra Corta
    await db.templates.add({
      id: 't_quo_short', type: 'quote', name: 'Presupuesto Rápido',
      defaultVat: 21, defaultNotes: 'Validez: 15 días. Pago al contado.', isDefault: false, tags: ['Rápido'],
      config: { ...baseConfig, client: { ...baseConfig.client, label: 'Para:' }, design: { ...baseConfig.design, headerStyle: 'minimal', primaryColor: '#475569', headerAlignment: 'left', logoSize: 'M' } },
      createdAt: now, updatedAt: now
    });

    // 5. Invoices
    await db.invoices.add({
      id: 'inv1',
      number: 'F2025-011',
      contactId: clientId1,
      templateId: 't_inv_21',
      date: dateStr,
      dueDate: dateStr,
      status: 'paid',
      notes: '',
      baseTotal: 1000,
      vatTotal: 210,
      retentionTotal: 150,
      grandTotal: 1060,
      paidAmount: 1060,
      createdAt: now,
      updatedAt: now,
      lines: [
        {
          id: 'l1',
          description: 'Diseño Web',
          quantity: 2,
          unit: 'proyecto',
          price: 500,
          vatPct: 21,
          discountPct: 0,
          retentionPct: 15
        }
      ]
    });

    // 5b. Recurring Invoices (Seed)
    await db.recurringInvoices.add({
      id: 'ri_1',
      name: 'Iguala Mensual Web',
      defaultTemplateId: 't_inv_21',
      notes: 'Pago mensual por servicios web.',
      createdAt: now,
      updatedAt: now,
      frequency: 'monthly',
      active: true,
      nextRun: new Date().setMonth(new Date().getMonth() + 1),
      lines: [
        {
          id: 'ril1',
          title: 'Iguala Mensual',
          description: 'Mantenimiento y soporte técnico',
          quantity: 1,
          unit: 'mes',
          price: 150,
          vatPct: 21,
          discountPct: 0,
          retentionPct: 15
        }
      ]
    });

    // 6. Quotes
    const quoteId = 'q1';
    await db.quotes.add({
      id: quoteId,
      number: 'P2025-006',
      contactId: clientId2,
      date: dateStr,
      dueDate: dateStr,
      status: 'sent',
      notes: '',
      baseTotal: 80,
      vatTotal: 16.8,
      retentionTotal: 0,
      grandTotal: 96.8,
      createdAt: now,
      updatedAt: now,
      lines: [
        {
          id: 'l2',
          description: 'Consultoría',
          quantity: 1,
          unit: 'hora',
          price: 80,
          vatPct: 21,
          discountPct: 0,
          retentionPct: 0
        }
      ]
    });

    // 6b. Recurring Quotes (Seed)
    await db.recurringQuotes.add({
      id: 'rec_1',
      name: 'Mantenimiento Web Mensual',
      defaultTemplateId: 't_quo_short',
      notes: 'Pago por adelantado día 1 de cada mes.',
      createdAt: now,
      updatedAt: now,
      frequency: 'monthly',
      active: true,
      nextRun: new Date().setMonth(new Date().getMonth() + 1),
      lines: [
        {
          id: 'rl1',
          title: 'Mantenimiento Servidor',
          description: 'Actualizaciones seguridad y backups',
          quantity: 1,
          unit: 'mes',
          price: 50,
          vatPct: 21,
          discountPct: 0,
          retentionPct: 15
        }
      ]
    });

    // 7. Expenses
    await db.expenses.add({
      id: 'exp1',
      date: dateStr,
      supplierId: supplierId1,
      category: 'Software',
      concept: 'Suscripción SaaS',
      amount: 100,
      vatPct: 21,
      vatAmount: 21,
      total: 121,
      paymentMethod: 'card',
      paid: true,
      deductible: true,
      createdAt: now,
      updatedAt: now
    });

    // 8. Inbox Templates
    await db.inboxTemplates.add({
      id: 'tmpl_payment_reminder',
      name: 'Recordatorio Pago',
      subject: 'Recordatorio de pago pendiente: {{doc_numero}}',
      body: 'Hola {{cliente_nombre}},\n\nLe recordamos que tiene pendiente de pago la factura {{doc_numero}} por importe de {{doc_total}}. Rogamos proceda al pago a la mayor brevedad.\n\nSaludos.',
      channel: 'both',
      createdAt: now,
      updatedAt: now
    });

    await db.inboxTemplates.add({
      id: 'tmpl_quote_delivery',
      name: 'Envío Presupuesto',
      subject: 'Presupuesto {{doc_numero}} de {{company_name}}',
      body: 'Hola {{cliente_nombre}},\n\nAdjunto le enviamos el presupuesto {{doc_numero}} por importe de {{doc_total}}. Quedamos a la espera de sus noticias.\n\nSaludos.',
      channel: 'both',
      createdAt: now,
      updatedAt: now
    });

    await db.inboxTemplates.add({
      id: 'tmpl_followup',
      name: 'Seguimiento',
      subject: 'Seguimiento de contacto',
      body: 'Hola {{cliente_nombre}},\n\nLe contacto para hacer seguimiento de nuestra conversación sobre {{doc_numero}}. ¿Ha tenido oportunidad de revisarlo?\n\nSaludos.',
      channel: 'both',
      createdAt: now,
      updatedAt: now
    });

    // 9. Email Templates (Rich)
    const emailTmplId = 'email-tmpl-invoice';
    await db.emailTemplates.add({
      id: emailTmplId,
      name: 'Factura estándar',
      subject: 'Factura {{doc_numero}} de {{company_name}}',
      bodyHtml: '', // To be generated or left empty as it uses blocks
      bodyText: `Hola {{cliente_nombre}},\n\nAdjunto le enviamos la factura {{doc_numero}} por un total de {{doc_total}}.\n\nPuede ver los detalles en el enlace adjunto.\n\nSaludos,\n{{company_name}}`,
      blocks: [
        {
          id: uuidv4(),
          type: 'heading',
          content: 'Factura Electrónica',
          styles: { align: 'center', fontSize: 28, paddingY: 20 }
        },
        {
          id: uuidv4(),
          type: 'text',
          content: 'Estimado/a {{cliente_nombre}},',
          styles: { align: 'left', fontSize: 16, paddingY: 10 }
        },
        {
          id: uuidv4(),
          type: 'divider',
          styles: { paddingY: 10 }
        },
        {
          id: uuidv4(),
          type: 'text',
          content: 'Adjunto a este correo encontrará la factura **{{doc_numero}}** con fecha **{{doc_fecha}}** por un importe total de **{{doc_total}}**.',
          styles: { align: 'left', fontSize: 16, paddingY: 10 }
        },
        {
          id: uuidv4(),
          type: 'button',
          content: 'https://totalgestpro.app/view/{{doc_id}}',
          styles: { align: 'center', paddingY: 20 }
        },
        {
          id: uuidv4(),
          type: 'spacer',
          styles: { paddingY: 20 }
        },
        {
          id: uuidv4(),
          type: 'text',
          content: 'Si tiene alguna duda, no dude en contactar con nosotros.\n\nAtentamente,\nEl equipo de **{{company_name}}**',
          styles: { align: 'left', fontSize: 14, paddingY: 10, color: '#64748b' }
        }
      ],
      createdAt: now,
      updatedAt: now
    });

    // 9b. Factura Pro Template
    await db.emailTemplates.add({
      id: uuidv4(),
      name: 'Factura Pro',
      subject: 'Su factura {{doc_numero}} está lista',
      theme: 'corporate',
      bodyHtml: '',
      bodyText: `Hola {{cliente_nombre}},\n\nAdjunto le enviamos la factura {{doc_numero}} por un total de {{doc_total}}.\n\nPuede ver los detalles en el enlace adjunto.\n\nSaludos,\n{{company_name}}`,
      blocks: [
        {
          id: uuidv4(),
          type: 'image',
          href: '{{logo_url}}',
          styles: { align: 'center', paddingY: 20 }
        },
        {
          id: uuidv4(),
          type: 'heading',
          content: 'Factura {{doc_numero}}',
          styles: { align: 'center', fontSize: 24, paddingY: 10 }
        },
        {
          id: uuidv4(),
          type: 'text',
          content: 'Hola {{cliente_nombre}},\n\nLe informamos que ya está disponible su factura. A continuación encontrará un resumen con los detalles más importantes del documento:',
          styles: { align: 'left', fontSize: 15, paddingY: 15, paddingX: 10 }
        },
        {
          id: uuidv4(),
          type: 'divider',
          styles: { paddingY: 5 }
        },
        {
          id: uuidv4(),
          type: 'text',
          content: '**Nº de Documento:** {{doc_numero}}\n**Fecha de Emisión:** {{doc_fecha}}\n**Importe Total:** {{doc_total}}',
          styles: { align: 'left', fontSize: 16, paddingY: 20, paddingX: 20, color: '#1e293b' }
        },
        {
          id: uuidv4(),
          type: 'button',
          content: 'Ver Factura Completa',
          href: '{{doc_link}}',
          styles: { align: 'center', paddingY: 25, background: '#2563eb', color: '#ffffff' }
        },
        {
          id: uuidv4(),
          type: 'spacer',
          styles: { paddingY: 30 }
        },
        {
          id: uuidv4(),
          type: 'text',
          content: 'Gracias por su confianza. Este es un envío automático, por favor no responda a este correo.',
          styles: { align: 'center', fontSize: 12, paddingY: 10, color: '#94a3b8' }
        }
      ],
      createdAt: now,
      updatedAt: now
    });

    // 9c. Recordatorio Pago WhatsApp
    await db.emailTemplates.add({
      id: uuidv4(),
      name: 'Recordatorio pago WhatsApp',
      subject: 'Recordatorio de pago',
      bodyHtml: '',
      bodyText: '',
      whatsappText: 'Hola {{cliente_nombre}},\n\nTe recordamos que la factura {{doc_numero}} por importe de {{doc_total}} se encuentra pendiente.\n\nPuedes consultarla aquí:\n{{doc_link}}\n\nGracias.',
      blocks: [],
      createdAt: now,
      updatedAt: now
    });
  });
};

// Auto-seed if empty
db.on('ready', async () => {
  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await seedData();
  } else {
    // If settings exist but emailTemplates are empty (new version), seed just them
    const emailTemplates = await db.emailTemplates.toArray();
    const hasFacturaPro = emailTemplates.some(t => t.name === 'Factura Pro');

    if (!hasFacturaPro) {
      const now = Date.now();
      await db.emailTemplates.add({
        id: uuidv4(),
        name: 'Factura Pro',
        subject: 'Su factura {{doc_numero}} está lista',
        theme: 'corporate',
        bodyHtml: '',
        bodyText: `Hola {{cliente_nombre}},\n\nAdjunto le enviamos la factura {{doc_numero}} por un total de {{doc_total}}.\n\nPuede ver los detalles en el enlace adjunto.\n\nSaludos,\n{{company_name}}`,
        blocks: [
          {
            id: uuidv4(),
            type: 'image',
            href: '{{logo_url}}',
            styles: { align: 'center', paddingY: 20 }
          },
          {
            id: uuidv4(),
            type: 'heading',
            content: 'Factura {{doc_numero}}',
            styles: { align: 'center', fontSize: 24, paddingY: 10 }
          },
          {
            id: uuidv4(),
            type: 'text',
            content: 'Hola {{cliente_nombre}},\n\nLe informamos que ya está disponible su factura. A continuación encontrará un resumen con los detalles más importantes del documento:',
            styles: { align: 'left', fontSize: 15, paddingY: 15, paddingX: 10 }
          },
          {
            id: uuidv4(),
            type: 'divider',
            styles: { paddingY: 5 }
          },
          {
            id: uuidv4(),
            type: 'text',
            content: '**Nº de Documento:** {{doc_numero}}\n**Fecha de Emisión:** {{doc_fecha}}\n**Importe Total:** {{doc_total}}',
            styles: { align: 'left', fontSize: 16, paddingY: 20, paddingX: 20, color: '#1e293b' }
          },
          {
            id: uuidv4(),
            type: 'button',
            content: 'Ver Factura Completa',
            href: '{{doc_link}}',
            styles: { align: 'center', paddingY: 25, background: '#2563eb', color: '#ffffff' }
          },
          {
            id: uuidv4(),
            type: 'spacer',
            styles: { paddingY: 30 }
          },
          {
            id: uuidv4(),
            type: 'text',
            content: 'Gracias por su confianza. Este es un envío automático, por favor no responda a este correo.',
            styles: { align: 'center', fontSize: 12, paddingY: 10, color: '#94a3b8' }
          }
        ],
        createdAt: now,
        updatedAt: now
      });
    }

    const hasReminder = await db.emailTemplates.where('name').equals('Recordatorio pago WhatsApp').count();
    if (hasReminder === 0) {
      const now = Date.now();
      await db.emailTemplates.add({
        id: uuidv4(),
        name: 'Recordatorio pago WhatsApp',
        subject: 'Recordatorio de pago',
        bodyHtml: '',
        bodyText: '',
        whatsappText: 'Hola {{cliente_nombre}},\n\nTe recordamos que la factura {{doc_numero}} por importe de {{doc_total}} se encuentra pendiente.\n\nPuedes consultarla aquí:\n{{doc_link}}\n\nGracias.',
        blocks: [],
        createdAt: now,
        updatedAt: now
      });
    }

    // Only add basic template if virtually no templates exist
    if (emailTemplates.length === 0) {
      const now = Date.now();
      await db.emailTemplates.add({
        id: 'email-tmpl-invoice',
        name: 'Factura estándar',
        subject: 'Factura {{doc_numero}} de {{company_name}}',
        bodyHtml: '',
        bodyText: `Hola {{cliente_nombre}},\n\nAdjunto le enviamos la factura {{doc_numero}} por un total de {{doc_total}}.\n\nSaludos,\n{{company_name}}`,
        blocks: [
          {
            id: uuidv4(),
            type: 'heading',
            content: 'Factura Electrónica',
            styles: { align: 'center', fontSize: 28, paddingY: 20 }
          },
          {
            id: uuidv4(),
            type: 'text',
            content: 'Estimado/a {{cliente_nombre}},',
            styles: { align: 'left', fontSize: 16, paddingY: 10 }
          },
          {
            id: uuidv4(),
            type: 'divider',
            styles: { paddingY: 10 }
          },
          {
            id: uuidv4(),
            type: 'text',
            content: 'Adjunto le enviamos la factura **{{doc_numero}}** por importe de **{{doc_total}}**.',
            styles: { align: 'left', fontSize: 16, paddingY: 10 }
          },
          {
            id: uuidv4(),
            type: 'button',
            content: '#',
            styles: { align: 'center', paddingY: 20 }
          },
          {
            id: uuidv4(),
            type: 'spacer',
            styles: { paddingY: 20 }
          },
          {
            id: uuidv4(),
            type: 'text',
            content: 'Gracias por su confianza.\n{{company_name}}',
            styles: { align: 'left', fontSize: 14, paddingY: 10 }
          }
        ],
        createdAt: now,
        updatedAt: now
      });
    }
  }
});

export const resetDatabase = async () => {
  await (db as any).delete();
  window.location.reload();
};
