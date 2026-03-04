
export interface Entity {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface PresenceSettings {
  website?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  whatsappDefaultCountry: string; // Default "+34"
}

export interface CompanySettings extends Entity {
  // Identity
  companyName: string; // Empresa (Nombre Comercial)
  logo?: string; // Base64 Image
  primaryColor?: string; // New: Brand color

  // Contact
  email: string;
  phone: string;
  website: string;
  social?: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    twitter?: string;
  };
  presence?: PresenceSettings;

  // Address
  address: string; // Legacy
  addressLine1: string; // New
  addressLine2?: string; // New
  zip: string; // Legacy
  postalCode: string; // New
  city: string;
  province: string;
  country: string;

  // Fiscal
  fiscalName: string; // Legacy (Razón social legal)
  legalName: string; // New
  nif: string; // Legacy
  taxId: string; // New

  // Banking & Legal
  iban: string;
  swift: string;
  bankName: string;
  legalTerms: string; // Footer legal text (RGPD, Registro Mercantil, etc.)

  // Config
  currency: string;
  invoicePrefix: string;
  invoiceCounter: number;
  quotePrefix: string;
  quoteCounter: number;
  numerationType: 'annual' | 'continuous'; // New: Numeration strategy
  defaultVat: number;
  enabledVatRates?: number[]; // [0, 4, 10, 21]
  defaultRetention: number;
  applyRetentionByDefault?: boolean; // Auto-apply retention to new lines
}

export interface Contact extends Entity {
  type: 'client' | 'supplier';
  name: string;
  nif: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zip: string;
  province: string;
  country: string;
  notes: string;
}

export interface Communication extends Entity {
  contactId: string;
  type: 'email' | 'whatsapp';
  subject?: string;
  content: string;
  status: 'draft' | 'pending' | 'sent' | 'failed';
  date: number;
}


export interface CatalogItem extends Entity {
  sku?: string; // Stock Keeping Unit
  name: string;
  description: string;
  category?: string; // New field
  price: number;
  vatPct: number; // percentage (mapped to vatRate in UI)
  unit: string;
  type: 'service' | 'product';
  active: boolean;
}

export interface LineItem {
  id: string;
  title?: string; // New field for short concept
  description: string;
  quantity: number;
  unit?: string; // New field
  price: number;
  vatPct: number;
  discountPct: number;
  retentionPct: number;
}

// --- TEMPLATES ---
export type TemplateBlockType = 'header' | 'client' | 'lines' | 'totals' | 'footer' | 'text' | 'separator' | 'pagebreak';

export interface TemplateBlock {
  id: string;
  type: TemplateBlockType;
  // For 'text'
  content?: string;
  // Positioning & Behavior
  positioning?: 'relative' | 'absolute'; // Default relative (flow)
  coords?: { x: number; y: number; w?: number }; // In mm. Only used if absolute
  repeat?: boolean; // Repeat on every page (Header/Footer behavior)
  // Styles
  styles?: {
    fontSize?: 'sm' | 'md' | 'lg' | 'xl';
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    color?: 'primary' | 'black' | 'secondary';
    // For 'separator'
    height?: 'sm' | 'md' | 'lg';
    line?: boolean;
  };
}

export interface DocumentTemplate extends Entity {
  name: string;
  type: 'invoice' | 'quote';
  isDefault: boolean;
  tags?: string[]; // New: Tags for organization
  defaultVat: number; // New: Default VAT for lines
  defaultNotes: string; // New: Default terms/notes
  config: {
    layout: (string | TemplateBlock)[]; // Changed from string[] to object array
    design: {
      primaryColor: string;
      secondaryColor: string;
      font: string; // 'helvetica', 'times', 'courier'
      headerStyle: 'classic' | 'modern' | 'minimal' | 'bold'; // Keep for legacy, but alignment overrides in new editor
      headerAlignment: 'left' | 'center' | 'right'; // New
      logoSize: 'S' | 'M' | 'L'; // New
      fontSizeBase: number;
      textColor: string;
      // New Background Config
      background?: {
        image?: string; // Base64
        mode: 'cover' | 'contain' | 'stretch' | 'custom';
        opacity: number; // 0.0 to 1.0
        scale?: number; // New: Background scale in %
      };
    };
    header: {
      showLogo: boolean;
      logoUrl?: string;
      showCompanyDetails: boolean;
      customTitle?: string; // e.g. "FACTURA PROFORMA"
      slogan?: string;
    };
    client: {
      label: string; // e.g. "Facturar a:"
      showVat: boolean;
      showAddress: boolean;
      showEmail: boolean;
    };
    columns: {
      quantity: boolean;
      unit: boolean;
      price: boolean; // Rate
      vat: boolean;
      discount: boolean;
      total: boolean; // Cost
    };
    totals: {
      showSubtotal: boolean;
      showVatBreakdown: boolean;
      showTotal: boolean;
      labels: {
        subtotal: string;
        vat: string;
        total: string;
      };
    };
    footer: {
      showBankDetails: boolean;
      thanksMessage: string;
      terms?: string; // Specific footer terms
      showSignature: boolean;
      showLegalTerms?: boolean; // New: Toggle legal footer
    };
  };
}

export interface RecurringQuoteTemplate extends Entity {
  name: string; // Name of the model (e.g. "Monthly Maintenance")
  defaultTemplateId?: string; // Visual layout template
  contactId?: string; // Optional default client
  lines: LineItem[];
  notes: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  nextRun: number; // Timestamp for next generation
  lastRun?: number;
  active: boolean;
}

export interface RecurringInvoiceTemplate extends Entity {
  name: string;
  defaultTemplateId?: string;
  contactId?: string; // Optional default client
  lines: LineItem[];
  notes: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  nextRun: number; // Timestamp for next generation
  lastRun?: number;
  active: boolean;
}

export type DocumentStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted' | 'paid' | 'overdue' | 'void' | 'refunded';

export interface Document extends Entity {
  number: string;
  date: string; // ISO Date string
  dueDate: string;
  contactId: string; // Client ID
  templateId?: string; // Link to specific template
  status: DocumentStatus;
  lines: LineItem[];
  notes: string; // Public notes
  internalNotes?: string; // Private notes (editable even if void)
  // Denormalized totals for fast queries
  baseTotal: number;
  vatTotal: number;
  retentionTotal: number;
  grandTotal: number;
  paidAmount?: number; // Only for invoices
}

export interface Invoice extends Document {
  quoteId?: string; // Linked quote
  paidDate?: string; // Date when full payment was received
}

export interface Quote extends Document { }

export interface Expense extends Entity {
  date: string;
  supplierId?: string; // Now encouraged
  category: string;
  concept: string;
  amount: number; // Base
  vatPct: number;
  vatAmount: number;
  total: number;
  paymentMethod?: string; // New: 'transfer', 'card', 'cash', 'domiciliation'
  attachment?: string; // New: Base64 string of receipt
  paid: boolean;
  deductible: boolean;
}

export interface Payment extends Entity {
  invoiceId: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
}

export type InboxChannel = "email" | "whatsapp";

export type InboxMessageStatus = "draft" | "queued" | "opened" | "sent" | "failed";

export interface InboxThread {
  id: string;
  partyType: "client" | "supplier";
  partyId: string;          // id del cliente/proveedor
  title: string;            // ej: "Cliente X"
  createdAt: number;
  updatedAt: number;
  lastMessageAt?: number;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  channel: InboxChannel;
  status: InboxMessageStatus;

  toEmail?: string;
  toPhone?: string;

  subject?: string;
  body: string;
  bodyHtml?: string; // Nuevo: Para mensajes construidos con el editor visual

  relatedType?: "invoice" | "quote" | "expense" | "other";
  relatedId?: string;

  createdAt: number;
  updatedAt: number;

  openedAt?: number;  // cuando abrimos mailto/wa
  sentAt?: number;    // manual “Marcar como enviado”
  finalRenderedBody?: string; // Nuevo: El texto exacto que se envió (con variables reemplazadas)
  error?: string;
}

export interface InboxTemplate extends Entity {
  name: string;
  subject?: string;
  body: string;
  channel: InboxChannel | "both";
}

export type EmailBlockType =
  | "heading"
  | "text"
  | "button"
  | "divider"
  | "spacer"
  | "image";

export interface EmailTemplateBlock {
  id: string;
  type: EmailBlockType;
  content?: string;     // texto, html simple o label del botón
  href?: string;        // solo para button / image
  styles?: {
    align?: "left" | "center" | "right";
    color?: string;
    background?: string;
    fontSize?: number;  // px
    paddingY?: number;  // px
    paddingX?: number;  // px
    bold?: boolean;
  };
}

export interface EmailTemplate extends Entity {
  name: string;
  subject: string;
  bodyHtml: string;   // HTML renderizable
  bodyText: string;   // fallback plano
  blocks?: EmailTemplateBlock[]; // New: Block-based structure
  theme?: 'corporate' | 'minimal' | 'dark-light'; // New: Template theme
  whatsappText?: string; // New: WhatsApp specific text
}

export interface JournalEntry {
  id: string;
  date: string;
  concept: string;
  account: string; // e.g., "700", "430"
  debit: number;
  credit: number;
  referenceId: string; // Invoice ID, Expense ID
}

export interface Counter {
  key: string;   // ej: "invoice-2026" o "quote-2026"
  value: number; // último número emitido
}
