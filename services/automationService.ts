import { invoicesApi, quotesApi, recurringInvoicesApi, recurringQuotesApi, settingsApi } from '@/core/adapter-api';
import { v4 as uuidv4 } from 'uuid';
import { RecurringInvoiceTemplate, RecurringQuoteTemplate, Invoice, Quote } from '../types';

export interface AutomationResult {
    invoicesGenerated: number;
    quotesGenerated: number;
}

const getNextDate = (current: number, frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual'): number => {
    const d = new Date(current);
    if (frequency === 'weekly') d.setDate(d.getDate() + 7);
    else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
    else if (frequency === 'annual') d.setFullYear(d.getFullYear() + 1);
    return d.getTime();
};

const createDocumentFromTemplate = async (
    type: 'invoice' | 'quote',
    template: RecurringInvoiceTemplate | RecurringQuoteTemplate,
) => {
    const number = '(Borrador)';

    let baseTotal = 0;
    let retentionTotal = 0;
    const byRate: Record<number, number> = {};

    template.lines.forEach(l => {
        const lineBase = l.quantity * l.price * (1 - (l.discountPct || 0) / 100);
        baseTotal += lineBase;
        retentionTotal += lineBase * ((l.retentionPct || 0) / 100);
        const rate = l.vatPct || 0;
        byRate[rate] = (byRate[rate] || 0) + lineBase;
    });

    let vatTotal = 0;
    Object.entries(byRate).forEach(([rate, amount]) => {
        vatTotal += amount * (parseFloat(rate) / 100);
    });

    const grandTotal = baseTotal + vatTotal - retentionTotal;

    const doc: any = {
        id: uuidv4(),
        number,
        date: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'draft',
        contactId: template.contactId || '',
        templateId: (template as any).defaultTemplateId,
        lines: template.lines.map(l => ({ ...l, id: uuidv4() })),
        notes: template.notes,
        baseTotal,
        vatTotal,
        retentionTotal,
        grandTotal,
        paidAmount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    if (type === 'invoice') {
        await invoicesApi.add(doc as Invoice);
    } else {
        await quotesApi.add(doc as Quote);
    }
};

export const runRecurringAutomation = async (): Promise<AutomationResult> => {
    const result = { invoicesGenerated: 0, quotesGenerated: 0 };
    const settings = await settingsApi.get();
    if (!settings) return result;

    // Process due invoices
    const dueInvoices = await recurringInvoicesApi.dueNow();
    for (const tpl of dueInvoices) {
        await createDocumentFromTemplate('invoice', tpl);
        const next = getNextDate(tpl.nextRun, tpl.frequency);
        await recurringInvoicesApi.update(tpl.id, { lastRun: Date.now(), nextRun: next });
        result.invoicesGenerated++;
    }

    // Process due quotes
    const dueQuotes = await recurringQuotesApi.dueNow();
    for (const tpl of dueQuotes) {
        await createDocumentFromTemplate('quote', tpl);
        const next = getNextDate(tpl.nextRun, tpl.frequency);
        await recurringQuotesApi.update(tpl.id, { lastRun: Date.now(), nextRun: next });
        result.quotesGenerated++;
    }

    return result;
};

export const manualRunRecurring = async (type: 'invoice' | 'quote', id: string): Promise<boolean> => {
    const settings = await settingsApi.get();
    if (!settings) return false;

    const tpl = type === 'invoice'
        ? await recurringInvoicesApi.get(id)
        : await recurringQuotesApi.get(id);

    if (!tpl) return false;

    await createDocumentFromTemplate(type, tpl);

    if (type === 'invoice') await recurringInvoicesApi.update(id, { lastRun: Date.now() });
    else await recurringQuotesApi.update(id, { lastRun: Date.now() });

    return true;
};
