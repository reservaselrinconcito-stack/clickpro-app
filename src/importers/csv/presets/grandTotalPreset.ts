
import { normalizeHeader } from './utils';

export interface CsvPreset {
    id: string;
    label: string;
    heuristics: Record<string, string[]>;
}

export const GrandTotalPreset: CsvPreset = {
    id: 'grandtotal',
    label: 'GrandTotal CSV',
    heuristics: {
        name: ['client', 'name', 'company', 'last name', 'first name'],
        taxId: ['vat', 'nif', 'tax', 'uic'],
        email: ['email', 'mail'],
        phone: ['phone', 'tel', 'mobile'],
        address: ['address', 'street'],
        city: ['city', 'location'],
        zip: ['zip', 'postal code', 'zipcode'],
        country: ['country'],
        // Items
        price: ['price', 'rate', 'unit price'],
        taxRate: ['tax rate', 'vat rate', 'tax%'],
        sku: ['sku', 'ref', 'code'],
    }
};

export const Presets: CsvPreset[] = [
    GrandTotalPreset
];

/**
 * Finds a matching header using preset heuristics.
 */
export const findMatchWithPreset = (headers: string[], fieldKey: string, preset: CsvPreset | null): string | undefined => {
    if (!preset) return undefined;

    const rules = preset.heuristics[fieldKey] || [];
    const normalizedRules = rules.map(r => normalizeHeader(r));

    return headers.find(h => {
        const normH = normalizeHeader(h);
        return normalizedRules.some(r => normH.includes(r));
    });
};
