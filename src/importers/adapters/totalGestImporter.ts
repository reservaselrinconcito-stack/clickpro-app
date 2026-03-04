
import { Importer, ImportAnalysis, ImportResult, ImportOptions } from '../types';
import { analyzeBackupFile, restoreBackup } from '../../services/backupService';

export const totalGestImporter: Importer = {
    id: 'totalgest-native',
    label: 'Copia de Seguridad TotalGest',
    description: 'Restaura una copia de seguridad nativa (.json o .zip) creada por esta aplicación.',
    accepts: ['.json', '.zip'],

    async canHandle(file: File): Promise<boolean> {
        // Quick check: filename or lightweight content check check could act here
        // For now, if extension matches (Registry checks extension), we say yes.
        // Deep analysis happens in analyze().
        return true;
    },

    async analyze(file: File): Promise<ImportAnalysis> {
        const result = await analyzeBackupFile(file);

        // Map Application specific ImportPreview to Generic ImportAnalysis
        return {
            valid: result.valid,
            type: 'TotalGest Backup',
            summary: {
                contacts: result.summary.contacts,
                invoices: result.summary.invoices,
                quotes: result.summary.quotes,
                expenses: result.summary.expenses,
                items: result.summary.items,
                templates: result.summary.templates,
                recurring: result.summary.recurring,
                payments: result.summary.payments || 0,
                inbox: result.summary.inbox || 0,
                emailTemplates: result.summary.emailTemplates || 0
            },
            warnings: result.warnings,
            data: result.data
        };
    },

    async import(file: File, data: any, options?: ImportOptions): Promise<ImportResult> {
        try {
            const clearExisting = options?.clearExisting ?? false;
            const stats = await restoreBackup(data, clearExisting);

            return {
                success: true,
                message: 'Restauración completada correctamente.',
                created: stats.created,
                updated: stats.updated,
                skipped: {},
                errors: [],
                warnings: []
            };
        } catch (e) {
            return { success: false, message: (e as Error).message, errors: [(e as Error).message] };
        }
    }
};
