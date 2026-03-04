
import Papa from 'papaparse';

export interface CsvParseResult {
    headers: string[];
    rows: any[];
    delimiter: string;
    meta: any;
}

/**
 * Detects the delimiter of a CSV file by reading the beginning of it.
 * PapaParse has built-in detection, but we can also do a manual peek if needed.
 */
export const detectDelimiter = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const result = Papa.parse(text, { preview: 5 }); // Peek first 5 lines to detect
            resolve(result.meta.delimiter || ',');
        };
        // Read first 10KB to detect delimiter
        reader.readAsText(file.slice(0, 1024 * 10));
    });
};

/**
 * Parses a CSV file with robust detection and row limits for preview.
 */
export const parseCsv = async (file: File, limit: number = 200): Promise<CsvParseResult> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: 'greedy',
            preview: limit,
            encoding: 'UTF-8', // Defaulting to UTF-8
            complete: (results) => {
                const headers = results.meta.fields || (results.data.length > 0 ? Object.keys(results.data[0] as any) : []);
                resolve({
                    headers,
                    rows: results.data,
                    delimiter: results.meta.delimiter,
                    meta: results.meta
                });
            },
            error: (error) => {
                reject(new Error(`Error al procesar CSV: ${error.message}`));
            }
        });
    });
};
