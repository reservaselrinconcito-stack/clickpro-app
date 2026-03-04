
import JSZip from 'jszip';
import { Importer, ImportAnalysis, ImportResult, ImportOptions } from '../types';
import { parseGrandTotalZip, GrandTotalParseResult } from '../parsers/grandTotalParser';
import { mapGrandTotalData } from '../mappers/grandTotalMapper';
import { restoreBackup } from '../../services/backupService';

export const grandTotalImporter: Importer = {
    id: 'grandtotal-backup',
    label: 'GrandTotal (Backup/Export)',
    description: 'Importa copias de seguridad de GrandTotal (.zip con .sqlite o .json).',
    accepts: ['.zip'],

    async canHandle(file: File): Promise<boolean> {
        if (!file.name.toLowerCase().endsWith('.zip')) return false;

        try {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);
            const fileNames = Object.keys(contents.files);

            // Check for typical GrandTotal files
            const hasSqlite = fileNames.some(n => n.endsWith('.sqlite') || n.includes('GrandTotal'));
            const hasJson = fileNames.some(n => n.endsWith('.json') && (n.includes('data') || n.includes('export')));
            // GrandTotal often has a specific structure or file naming. 
            // We'll accept if we see .sqlite or specific hints, user can confirm later.
            return hasSqlite || hasJson;
        } catch (e) {
            console.warn('GrandTotal detection failed:', e);
            return false;
        }
    },

    async analyze(file: File): Promise<ImportAnalysis> {
        const preview: ImportAnalysis = {
            valid: false,
            type: 'Unknown',
            summary: { contacts: 0, invoices: 0, quotes: 0, expenses: 0, items: 0, templates: 0, recurring: 0, payments: 0, inbox: 0, emailTemplates: 0 },
            warnings: [],
            data: {}
        };

        try {
            const result = await parseGrandTotalZip(file);
            preview.data = result; // Store parsed result for import step

            if (result.metadata.innerFiles.length === 0) {
                preview.warnings.push("El archivo ZIP parece estar vacío o corrupto.");
                return preview;
            }

            if (result.format === 'sqlite') {
                preview.type = 'GrandTotal Backup (SQLite)';
                preview.valid = true;
                const size = result.sqliteData ? (result.sqliteData.length / 1024 / 1024).toFixed(2) : '0';
                preview.warnings.push(`Base de datos SQLite detectada (${size} MB). Preparada para extracción (WIP).`);

                // Future: We could use sql.js to count records from sqliteData here
            }
            else if (result.format === 'json') {
                preview.type = 'GrandTotal Export (JSON)';
                preview.valid = true;

                // Map counters if available
                if (result.metadata.recordCounts) {
                    const c = result.metadata.recordCounts;
                    // Try to map common keys loosely
                    preview.summary.contacts = c.clients || c.customers || c.contacts || 0;
                    preview.summary.invoices = c.invoices || c.bills || 0;
                    preview.summary.quotes = c.quotes || c.estimates || 0;
                    preview.summary.items = c.items || c.products || c.services || 0;
                }
                preview.warnings.push("Archivo JSON analizado correctamente.");
            }
            else {
                preview.warnings.push("No se encontró estructura reconocible de GrandTotal (SQLite o JSON).");
            }

        } catch (e) {
            preview.warnings.push("Error en el análisis del archivo: " + (e as Error).message);
        }

        return preview;
    },

    async import(file: File, data: any, options?: ImportOptions): Promise<ImportResult> {
        try {
            // 'data' comes from analyze() step, which contains { format, metadata, sqliteData?, jsonData? }
            // but effectively it's the GrandTotalParseResult we stored in analyze().
            const parseResult = data as GrandTotalParseResult;

            if (!parseResult) {
                return { success: false, message: 'No hay datos analizados para importar.', errors: ['Missing analysis data'] };
            }

            if (parseResult.format === 'sqlite') {
                return {
                    success: false,
                    message: 'La importación desde SQLite nativo de GrandTotal aún no está soportada. Por favor, utiliza la exportación JSON.',
                    errors: ['SQLite not yet supported']
                };
            }

            // 1. Map to our internal BackupData format
            const backupData = mapGrandTotalData(parseResult);

            // 2. Execute Import Transaction using our standard service
            const clearExisting = options?.clearExisting ?? false;
            const stats = await restoreBackup(backupData, clearExisting);

            return {
                success: true,
                message: 'Importación de GrandTotal completada.',
                created: stats.created,
                updated: stats.updated,
                skipped: {},
                errors: [],
                warnings: []
            };

        } catch (e) {
            return {
                success: false,
                message: 'Error durante la importación: ' + (e as Error).message,
                errors: [(e as Error).message]
            };
        }
    }
};
