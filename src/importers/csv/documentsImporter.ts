import { contactsApi, invoicesApi, quotesApi } from '@/core/adapter-api';
import { Invoice, Quote, LineItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { parseMoney, parseDate, normalizeTaxId } from './normalizers';
import { ImportValidationResult, CSVImportOptions } from './importTypes';

// Find or create a contact without using Dexie transactions
const findOrCreateClient = async (
    row: any,
    mapping: Record<string, string>
): Promise<string> => {
    const nif = normalizeTaxId(row[mapping['clientNif']] || '');
    const email = row[mapping['clientEmail']]?.toString().trim().toLowerCase() || '';
    const name = row[mapping['clientName']]?.toString().trim() || '';

    if (nif) { const e = await contactsApi.findByNif(nif); if (e) return e.id; }
    if (email) { const e = await contactsApi.findByEmail(email); if (e) return e.id; }
    if (name) {
        const all = await contactsApi.byType('client');
        const e = all.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (e) return e.id;
    }

    const id = uuidv4();
    await contactsApi.add({
        id, type: 'client',
        name: name || `Cliente Importado (${new Date().toLocaleDateString()})`,
        nif: nif || '', email: email || '', phone: '',
        address: '', city: '', zip: '', country: '',
        notes: 'Generado automáticamente durante importación.',
        createdAt: Date.now(), updatedAt: Date.now()
    });
    return id;
};

const parseLineItem = (row: any, mapping: Record<string, string>): LineItem => ({
    id: uuidv4(),
    description: row[mapping['lineDescription']]?.toString() || 'Ítem sin descripción',
    quantity: parseMoney(row[mapping['lineQuantity']] || '1'),
    unit: 'ud',
    price: parseMoney(row[mapping['linePrice']]),
    vatPct: parseMoney(row[mapping['lineTax']] || '21'),
    discountPct: parseMoney(row[mapping['lineDiscount']] || '0'),
    retentionPct: 0
});

export const importDocumentsFromCsv = async (
    type: 'invoice' | 'quote',
    primaryData: any[],
    primaryMapping: Record<string, string>,
    secondaryData: any[],
    secondaryMapping: Record<string, string>,
    options: CSVImportOptions
): Promise<ImportValidationResult> => {
    const result: ImportValidationResult = {
        validCount: 0, warningCount: 0, errorCount: 0, details: [], created: 0, updated: 0
    };

    // Build documents to import
    let documentsToImport: { headerRow: any; lineRows: any[]; rowIndex: number }[] = [];

    if (options.mode === 'single') {
        const idField = primaryMapping['id'] || primaryMapping['number'];
        if (!idField) { result.errorCount = primaryData.length; return result; }
        const grouped: Record<string, { rows: any[]; firstIndex: number }> = {};
        for (let i = 0; i < primaryData.length; i++) {
            const id = primaryData[i][idField]?.toString();
            if (!id) continue;
            if (!grouped[id]) grouped[id] = { rows: [], firstIndex: i };
            grouped[id].rows.push(primaryData[i]);
        }
        documentsToImport = Object.keys(grouped).map(key => ({
            headerRow: grouped[key].rows[0],
            lineRows: grouped[key].rows,
            rowIndex: grouped[key].firstIndex + 1
        }));
    } else {
        const linkField = secondaryMapping['linkId'];
        if (!linkField) { result.errorCount = primaryData.length; return result; }
        const linesByDocId: Record<string, any[]> = {};
        for (const row of secondaryData) {
            const lid = row[linkField]?.toString();
            if (!lid) continue;
            if (!linesByDocId[lid]) linesByDocId[lid] = [];
            linesByDocId[lid].push(row);
        }
        const headerField = primaryMapping['id'] || primaryMapping['number'];
        if (!headerField) { result.errorCount = primaryData.length; return result; }
        for (let i = 0; i < primaryData.length; i++) {
            const id = primaryData[i][headerField]?.toString();
            if (!id) continue;
            documentsToImport.push({ headerRow: primaryData[i], lineRows: linesByDocId[id] || [], rowIndex: i + 1 });
        }
    }

    // Validate
    for (const doc of documentsToImport) {
        const msgs: string[] = [];
        let status: 'valid' | 'warning' | 'error' = 'valid';
        if (!doc.headerRow[primaryMapping['number']]) { status = 'error'; msgs.push('Falta número de documento.'); }
        if (status === 'error') result.errorCount++;
        else if (status === 'warning') result.warningCount++;
        else result.validCount++;
        result.details.push({ row: doc.rowIndex, status, messages: msgs, data: doc });
    }

    if (options.dryRun) return result;

    // Import (no Dexie transaction needed — single-user desktop)
    const validDocs = result.details.filter(d => d.status !== 'error').map(d => d.data);
    for (const doc of validDocs) {
        try {
            const hMap = primaryMapping;
            const lMap = options.mode === 'single' ? primaryMapping : secondaryMapping;
            const contactId = await findOrCreateClient(doc.headerRow, hMap);
            const lines = doc.lineRows.map((r: any) => parseLineItem(r, lMap));

            let baseTotal = 0, vatTotal = 0;
            lines.forEach((l: LineItem) => {
                const lt = l.price * l.quantity * (1 - (l.discountPct || 0) / 100);
                baseTotal += lt; vatTotal += lt * (l.vatPct / 100);
            });

            const now = Date.now();
            const common = {
                id: uuidv4(), contactId,
                date: parseDate(doc.headerRow[hMap['date']]) || new Date().toISOString().split('T')[0],
                dueDate: parseDate(doc.headerRow[hMap['date']]) || new Date().toISOString().split('T')[0],
                number: doc.headerRow[hMap['number']]?.toString() || `IMP-${now}`,
                status: 'sent' as any,
                notes: doc.headerRow[hMap['notes']] || '',
                baseTotal: Math.round(baseTotal * 100) / 100,
                vatTotal: Math.round(vatTotal * 100) / 100,
                retentionTotal: 0,
                grandTotal: Math.round((baseTotal + vatTotal) * 100) / 100,
                lines, createdAt: now, updatedAt: now
            };

            if (type === 'invoice') {
                await invoicesApi.add({ ...common, paidAmount: 0 } as any);
            } else {
                await quotesApi.add(common as any);
            }
            if (result.created !== undefined) result.created++;
        } catch (err) {
            const det = result.details.find(d => d.data === doc);
            if (det) { det.status = 'error'; det.messages.push(`Error: ${(err as Error).message}`); result.errorCount++; result.validCount--; }
        }
    }

    return result;
};
