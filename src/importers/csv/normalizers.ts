
/**
 * Utility to normalize currency/money values.
 * Handles "1.250,50", "1250,50", "1,250.50", etc.
 */
export const parseMoney = (val: string | number): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;

    let clean = val.toString().trim();

    // If it has both . and , (e.g. 1.250,50)
    if (clean.includes('.') && clean.includes(',')) {
        const lastDot = clean.lastIndexOf('.');
        const lastComma = clean.lastIndexOf(',');

        if (lastComma > lastDot) {
            // European: 1.250,50 -> remove dot, replace comma with dot
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            // American: 1,250.50 -> remove comma
            clean = clean.replace(/,/g, '');
        }
    } else if (clean.includes(',')) {
        // Only comma. Could be 1250,50 (decimal) or 1,250 (thousands)
        // Heuristic: if comma is 3 positions from the end, it's likely decimal
        const commaPos = clean.lastIndexOf(',');
        if (clean.length - commaPos <= 3) {
            clean = clean.replace(',', '.');
        } else {
            clean = clean.replace(/,/g, '');
        }
    } else {
        // Regular number or just dots as thousands
        // If there's a dot but it looks like a thousands separator (e.g. 1.250)
        const dotPos = clean.lastIndexOf('.');
        if (dotPos !== -1 && clean.length - dotPos > 3) {
            clean = clean.replace(/\./g, '');
        }
    }

    const parsed = parseFloat(clean.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
};

/**
 * Normalizes dates to ISO YYYY-MM-DD.
 * Supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD.
 */
export const parseDate = (val: string): string | null => {
    if (!val) return null;
    let clean = val.toString().trim();

    // Match DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
        const [, d, m, y] = dmyMatch;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Match YYYY-MM-DD
    const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
        const [, y, m, d] = ymdMatch;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Fallback to JS Date
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }

    return null;
};

/**
 * Normalizes phone numbers (removes spaces, parentheses, etc).
 */
export const normalizePhone = (val: string): string => {
    if (!val) return '';
    return val.toString().replace(/[^0-9+]/g, '').trim();
};

/**
 * Normalizes Tax IDs (Upper case, no spaces/dashes).
 */
export const normalizeTaxId = (val: string): string => {
    if (!val) return '';
    return val.toString().toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
};
