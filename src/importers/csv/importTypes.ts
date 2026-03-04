
export interface ImportRowDetail {
    row: number;
    status: 'valid' | 'warning' | 'error';
    messages: string[];
    data: any; // The original row data
}

export interface ImportValidationResult {
    validCount: number;
    warningCount: number;
    errorCount: number;
    details: ImportRowDetail[];
    // To support the existing 'result' structure during actual import
    created?: number;
    updated?: number;
}

export interface CSVImportOptions {
    dryRun?: boolean; // If true, return detailed validation only
    // Common merge options
    mergeByTaxId?: boolean;
    mergeByEmail?: boolean;
    mergeBySku?: boolean;
    mode?: 'single' | 'dual';
}
