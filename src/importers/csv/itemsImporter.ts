
import { itemsApi } from '@/core/adapter-api';
import { CatalogItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { parseMoney } from './normalizers';
import { ImportValidationResult, CSVImportOptions } from './importTypes';

/**
 * Normalizes tax rate input.
 */
const parseTaxRate = (val: string): number => {
    if (!val) return 21; // Default
    let clean = val.toString().replace('%', '').trim();
    let num = parseMoney(clean);

    if (num < 1 && num > 0) {
        return num * 100;
    }
    return num;
};

/**
 * Imports items from a list of objects.
 */
export const importItemsFromCsv = async (
    data: any[],
    mapping: Record<string, string>,
    options: CSVImportOptions
): Promise<ImportValidationResult> => {
    const result: ImportValidationResult = {
        validCount: 0,
        warningCount: 0,
        errorCount: 0,
        details: [],
        created: 0,
        updated: 0
    };

    // VALIDATION PHASE
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const messages: string[] = [];
        let status: 'valid' | 'warning' | 'error' = 'valid';

        const name = row[mapping['name']]?.toString().trim();
        const priceRaw = row[mapping['price']];

        if (!name) {
            status = 'error';
            messages.push('Falta el nombre (requerido).');
        }
        if (!priceRaw) {
            status = 'error';
            messages.push('Falta el precio (requerido).');
        } else {
            const p = parseMoney(priceRaw);
            if (p < 0) {
                status = 'warning';
                messages.push('El precio es negativo.');
            }
        }

        if (status === 'error') result.errorCount++;
        else if (status === 'warning') result.warningCount++;
        else result.validCount++;

        result.details.push({
            row: i + 1,
            status,
            messages,
            data: row
        });
    }

    if (options.dryRun) return result;

    // IMPORT PHASE
    const validRows = result.details.filter(d => d.status !== 'error').map(d => d.data);

    for (const row of validRows) {
        try {
            const name = row[mapping['name']]?.toString().trim();
            const priceRaw = row[mapping['price']];
            const sku = row[mapping['sku']]?.toString().trim() || '';
            const price = parseMoney(priceRaw);
            const description = row[mapping['description']]?.toString().trim() || '';
            const taxRate = parseTaxRate(row[mapping['taxRate']]);

            let existingItem: CatalogItem | undefined;
            if (options.mergeBySku && sku) {
                const all = await itemsApi.all();
                existingItem = all.find(i => i.sku === sku);
            }

            if (existingItem) {
                await itemsApi.update(existingItem.id, {
                    name: name || existingItem.name,
                    price: price || existingItem.price,
                    description: description || existingItem.description,
                    vatPct: taxRate,
                });
                if (result.updated !== undefined) result.updated++;
            } else {
                await itemsApi.add({
                    id: uuidv4(), sku, name: name!, description, price,
                    vatPct: taxRate, unit: 'unidad', active: true, type: 'product',
                    category: row[mapping['category']]?.toString().trim() || 'General',
                } as CatalogItem);
                if (result.created !== undefined) result.created++;
            }
        } catch { }
    }

    return result;
};
