
import { v4 as uuidv4 } from 'uuid';
import { BackupData } from '../../../services/backupService';
import { GrandTotalParseResult } from '../parsers/grandTotalParser';
import { Contact, Invoice, Quote, CatalogItem, LineItem } from '../../../types';

export const mapGrandTotalData = (parsed: GrandTotalParseResult): BackupData => {
    const backup: BackupData = {
        version: 2,
        timestamp: Date.now(),
        settings: [],
        contacts: [],
        items: [],
        invoices: [],
        quotes: [],
        expenses: [],
        payments: [],
        templates: [],
        inboxThreads: [],
        inboxMessages: [],
        inboxTemplates: [],
        emailTemplates: []
    };

    if (parsed.format !== 'json' || !parsed.jsonData) {
        return backup;
    }

    const data = parsed.jsonData;

    // --- MAP CONTACTS ---
    const rawContacts = data.clients || data.customers || data.contacts || [];
    if (Array.isArray(rawContacts)) {
        backup.contacts = rawContacts.map((c: any) => ({
            id: c.id || uuidv4(),
            name: c.name || c.company || 'Sin Nombre',
            email: c.email || '',
            phone: c.phone || '',
            address: c.address || '',
            city: c.city || '',
            zip: c.zip || '',
            country: c.country || '',
            taxId: c.taxId || c.vat || '',
            notes: c.notes || ''
        }));
    }

    // --- MAP ITEMS ---
    const rawItems = data.items || data.products || data.services || [];
    if (Array.isArray(rawItems)) {
        backup.items = rawItems.map((i: any) => ({
            id: i.id || uuidv4(),
            name: i.name || i.title || 'Sin Título',
            description: i.description || '',
            price: parseFloat(i.price || i.rate || i.unitPrice || '0'),
            taxRate: parseFloat(i.tax || i.taxRate || '0'),
            sku: i.sku || ''
        }));
    }

    // --- MAP INVOICES ---
    const rawInvoices = data.invoices || data.bills || [];
    if (Array.isArray(rawInvoices)) {
        backup.invoices = rawInvoices.map((inv: any) => ({
            id: inv.id || uuidv4(),
            number: inv.number || inv.ref || 'Unknown',
            date: inv.date || new Date().toISOString().split('T')[0],
            dueDate: inv.dueDate || inv.due || '',
            status: mapStatus(inv.status, 'invoice'),
            clientId: inv.clientId || findClientIdByName(backup.contacts, inv.clientName) || '',
            clientName: inv.clientName || '', // We keep it even if we have ID, as backup redundancy
            items: mapLineItems(inv.items || inv.lines),
            subtotal: parseFloat(inv.subtotal || '0'),
            taxTotal: parseFloat(inv.taxTotal || '0'),
            total: parseFloat(inv.total || '0'),
            notes: inv.notes || '',
            templateId: 'default'
        }));
    }

    // --- MAP QUOTES ---
    const rawQuotes = data.quotes || data.estimates || [];
    if (Array.isArray(rawQuotes)) {
        backup.quotes = rawQuotes.map((q: any) => ({
            id: q.id || uuidv4(),
            number: q.number || q.ref || 'Unknown',
            date: q.date || new Date().toISOString().split('T')[0],
            expiryDate: q.expiryDate || q.validUntil || '',
            status: mapStatus(q.status, 'quote'),
            clientId: q.clientId || findClientIdByName(backup.contacts, q.clientName) || '',
            clientName: q.clientName || '',
            items: mapLineItems(q.items || q.lines),
            subtotal: parseFloat(q.subtotal || '0'),
            taxTotal: parseFloat(q.taxTotal || '0'),
            total: parseFloat(q.total || '0'),
            notes: q.notes || '',
            templateId: 'default'
        }));
    }

    return backup;
};

// --- HELPER FUNCTIONS ---

const mapStatus = (status: string, type: 'invoice' | 'quote'): any => {
    const s = (status || '').toLowerCase();
    if (type === 'invoice') {
        if (s.includes('paid') || s.includes('pagad')) return 'paid';
        if (s.includes('draft') || s.includes('borr')) return 'draft';
        if (s.includes('cancel')) return 'cancelled';
        return 'sent'; // default
    } else {
        if (s.includes('accept')) return 'accepted';
        if (s.includes('reject') || s.includes('rechaz')) return 'rejected';
        if (s.includes('draft') || s.includes('borr')) return 'draft';
        return 'sent';
    }
};

const mapLineItems = (items: any[]): LineItem[] => {
    if (!Array.isArray(items)) return [];
    return items.map((item: any) => ({
        id: item.id || uuidv4(),
        description: item.description || item.name || 'Item',
        quantity: parseFloat(item.quantity || item.qty || '1'),
        unitPrice: parseFloat(item.unitPrice || item.rate || item.price || '0'),
        taxRate: parseFloat(item.taxRate || item.tax || '0'),
        amount: parseFloat(item.amount || item.total || '0')
    }));
};

const findClientIdByName = (contacts: Contact[] | undefined, name: string): string => {
    if (!contacts || !name) return '';
    const contact = contacts.find(c => c.name.toLowerCase() === name.toLowerCase());
    return contact ? contact.id : '';
};
