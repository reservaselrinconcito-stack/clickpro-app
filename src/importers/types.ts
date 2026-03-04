
export interface ImportSummary {
    contacts: number;
    invoices: number;
    quotes: number;
    expenses: number;
    items: number;
    templates: number;
    recurring: number;
    payments: number;
    inbox?: number;
    emailTemplates?: number;
}

export interface ImportAnalysis {
    valid: boolean;
    type: string;
    summary: ImportSummary;
    warnings: string[];
    data: any; // Raw or normalized data ready for import
}

export interface ImportResult {
    success: boolean;
    message: string;
    created?: Record<string, number>;
    updated?: Record<string, number>;
    skipped?: Record<string, number>;
    errors?: string[];
    warnings?: string[];
}

export interface ImportOptions {
    clearExisting: boolean;
}

export interface Importer {
    id: string;
    label: string;
    description: string;
    accepts: string[]; // ['.json', '.zip', '.csv']

    // Returns true if this importer can handle the given file
    canHandle(file: File): Promise<boolean>;

    // Analyzes the file and returns a preview/summary
    analyze(file: File): Promise<ImportAnalysis>;

    // Executes the import
    import(file: File, data: any, options?: ImportOptions): Promise<ImportResult>;
}
