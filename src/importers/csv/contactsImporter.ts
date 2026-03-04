import { getAdapter } from '@/core/db-adapter';
import { contactsApi } from '@/core/adapter-api';
import { Contact } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { normalizeTaxId, normalizePhone } from './normalizers';
import { ImportValidationResult, CSVImportOptions } from './importTypes';

export const importContactsFromCsv = async (
    data: any[],
    mapping: Record<string, string>,
    options: CSVImportOptions
): Promise<ImportValidationResult> => {
    const result: ImportValidationResult = {
        validCount: 0, warningCount: 0, errorCount: 0, details: [], created: 0, updated: 0
    };

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const messages: string[] = [];
        let status: 'valid' | 'warning' | 'error' = 'valid';
        const name = row[mapping['name']]?.toString().trim();
        if (!name) { status = 'error'; messages.push('Falta el nombre (campo obligatorio).'); }
        if (status === 'error') result.errorCount++;
        else if (status === 'warning') result.warningCount++;
        else result.validCount++;
        result.details.push({ row: i + 1, status, messages, data: row });
    }

    if (options.dryRun) return result;

    const validRows = result.details.filter(d => d.status !== 'error').map(d => d.data);

    for (const row of validRows) {
        try {
            const name = row[mapping['name']]?.toString().trim();
            const taxId = normalizeTaxId(row[mapping['taxId']] || '');
            const email = row[mapping['email']]?.toString().trim().toLowerCase() || '';
            const phone = normalizePhone(row[mapping['phone']] || '');

            let existingContact: Contact | undefined;
            if (options.mergeByTaxId && taxId) existingContact = await contactsApi.findByNif(taxId);
            if (!existingContact && options.mergeByEmail && email) existingContact = await contactsApi.findByEmail(email);

            if (existingContact) {
                await contactsApi.update(existingContact.id, {
                    name: name || existingContact.name,
                    nif: taxId || existingContact.nif,
                    email: email || existingContact.email,
                    phone: phone || existingContact.phone,
                    address: (row[mapping['address']] || existingContact.address)?.toString().trim(),
                    city: (row[mapping['city']] || existingContact.city)?.toString().trim(),
                    zip: (row[mapping['zip']] || existingContact.zip)?.toString().trim(),
                    country: (row[mapping['country']] || existingContact.country)?.toString().trim(),
                    notes: (row[mapping['notes']] || existingContact.notes)?.toString().trim(),
                });
                if (result.updated !== undefined) result.updated++;
            } else {
                await contactsApi.add({
                    id: uuidv4(), type: 'client', name: name!,
                    nif: taxId, email, phone,
                    address: (row[mapping['address']] || '')?.toString().trim(),
                    city: (row[mapping['city']] || '')?.toString().trim(),
                    zip: (row[mapping['zip']] || '')?.toString().trim(),
                    province: '',
                    country: (row[mapping['country']] || '')?.toString().trim(),
                    notes: (row[mapping['notes']] || '')?.toString().trim(),
                });
                if (result.created !== undefined) result.created++;
            }
        } catch { }
    }

    return result;
};
