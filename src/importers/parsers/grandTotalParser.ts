
import JSZip from 'jszip';

export interface GrandTotalParseResult {
    format: 'sqlite' | 'json' | 'unknown';
    sqliteData?: Uint8Array;
    jsonData?: any;
    metadata: {
        fileSize: number;
        innerFiles: string[];
        recordCounts?: Record<string, number>;
    };
}

export const parseGrandTotalZip = async (file: File): Promise<GrandTotalParseResult> => {
    const result: GrandTotalParseResult = {
        format: 'unknown',
        metadata: {
            fileSize: file.size,
            innerFiles: []
        }
    };

    try {
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);
        result.metadata.innerFiles = Object.keys(contents.files);

        // 1. Look for SQLite
        const sqliteFile = Object.values(contents.files).find(f =>
            f.name.endsWith('.sqlite') && !f.name.startsWith('__MACOSX') && !f.dir
        );

        if (sqliteFile) {
            result.format = 'sqlite';
            // Extract bytes
            result.sqliteData = await sqliteFile.async('uint8array');
            return result;
        }

        // 2. Look for JSON Export
        // GrandTotal exports might be a single JSON or multiple.
        // We look for a main data file or structure.
        const jsonFile = Object.values(contents.files).find(f =>
            f.name.endsWith('.json') && !f.name.startsWith('__MACOSX') && !f.dir
        );

        if (jsonFile) {
            result.format = 'json';
            const text = await jsonFile.async('string');
            try {
                const data = JSON.parse(text);
                result.jsonData = data;

                // Try to count records for summary
                const counts: Record<string, number> = {};
                if (typeof data === 'object' && data !== null) {
                    for (const key of Object.keys(data)) {
                        if (Array.isArray(data[key])) {
                            counts[key] = data[key].length;
                        }
                    }
                }
                result.metadata.recordCounts = counts;
            } catch (e) {
                console.warn('Failed to parse GrandTotal JSON:', e);
                // Still mark as JSON format but maybe invalid data
            }
            return result;
        }

    } catch (e) {
        console.error('Error parsing GrandTotal ZIP:', e);
    }

    return result;
};
