
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Upload,
    Search,
    CheckCircle2,
    AlertTriangle,
    ArrowLeft,
    Database,
    FileCode,
    HelpCircle,
    Loader2,
    XCircle,
    FileText,
    History,
    ChevronRight,
    Download
} from 'lucide-react';
import { notify } from '../../components/UI';
import { Button } from '../../components/UI';
import { registry } from '../importers/registry';
import { createSnapshot, restoreSnapshot, discardSnapshot } from '../services/backupService';
import { parseCsv } from '../importers/csv/csvParser';
import { matchHeuristic } from '../importers/csv/presets/utils';
import { findMatchWithPreset, Presets, CsvPreset } from '../importers/csv/presets/grandTotalPreset';
import { importContactsFromCsv } from '../importers/csv/contactsImporter';
import { importItemsFromCsv } from '../importers/csv/itemsImporter';
import { importDocumentsFromCsv } from '../importers/csv/documentsImporter';
import { ImportValidationResult } from '../importers/csv/importTypes';

// Field Definitions for Mapping
const ENTITY_FIELDS: Record<string, { key: string; label: string; required?: boolean }[]> = {
    contacts: [
        { key: 'name', label: 'Nombre / Razón Social', required: true },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'taxId', label: 'NIF / CIF / Tax ID' },
        { key: 'address', label: 'Dirección' },
        { key: 'city', label: 'Ciudad' },
        { key: 'zip', label: 'Código Postal' },
        { key: 'country', label: 'País' },
        { key: 'notes', label: 'Notas' },
    ],
    invoices: [
        { key: 'number', label: 'Número Factura', required: true },
        { key: 'date', label: 'Fecha', required: true },
        { key: 'clientName', label: 'Nombre Cliente', required: true },
        { key: 'total', label: 'Importe Total', required: true },
        { key: 'description', label: 'Descripción / Concepto' },
        { key: 'notes', label: 'Notas' },
    ],
    quotes: [
        { key: 'number', label: 'Número Presupuesto', required: true },
        { key: 'date', label: 'Fecha', required: true },
        { key: 'clientName', label: 'Nombre Cliente', required: true },
        { key: 'total', label: 'Importe Total', required: true },
        { key: 'description', label: 'Descripción / Concepto' },
        { key: 'notes', label: 'Notas' },
    ],
    items: [
        { key: 'name', label: 'Nombre Artículo', required: true },
        { key: 'price', label: 'Precio', required: true },
        { key: 'taxRate', label: 'IVA %', required: true },
        { key: 'sku', label: 'Referencia / SKU' },
        { key: 'description', label: 'Descripción' },
    ],
    expenses: [
        { key: 'concept', label: 'Concepto / Descripción', required: true },
        { key: 'amount', label: 'Base Imponible', required: true },
        { key: 'date', label: 'Fecha', required: true },
        { key: 'category', label: 'Categoría' },
        { key: 'provider', label: 'Nombre Proveedor' },
    ]
};

const ImportWizard = () => {
    const navigate = useNavigate();

    // State
    const [step, setStep] = useState<number>(1);
    const [file, setFile] = useState<File | null>(null);
    const [detectedImporter, setDetectedImporter] = useState<any>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
    const [importResult, setImportResult] = useState<any>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // CSV Mode State
    const [activeTab, setActiveTab] = useState<'backup' | 'csv'>('backup');
    const [csvEntity, setCsvEntity] = useState<'contacts' | 'invoices' | 'quotes' | 'items' | 'expenses'>('contacts');
    const [csvData, setCsvData] = useState<any[]>([]);
    const [csvPreview, setCsvPreview] = useState<any[]>([]);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [activePreset, setActivePreset] = useState<CsvPreset | null>(null);
    const [csvMergeOptions, setCsvMergeOptions] = useState({ byTaxId: true, byEmail: false, bySku: true });

    // Block 8: Multi-file / Dual mode
    const [csvImportMode, setCsvImportMode] = useState<'single' | 'dual'>('single');
    const [secondaryFile, setSecondaryFile] = useState<File | null>(null);
    const [secondaryPreview, setSecondaryPreview] = useState<any[]>([]);
    const [secondaryHeaders, setSecondaryHeaders] = useState<string[]>([]);
    const [secondaryMapping, setSecondaryMapping] = useState<Record<string, string>>({});
    const [activeMappingTab, setActiveMappingTab] = useState<'primary' | 'secondary'>('primary');

    // Block 9: Validation
    const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const secondaryFileInputRef = useRef<HTMLInputElement>(null);

    // Logic
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, isSecondary: boolean = false) => {
        if (e.target.files && e.target.files.length > 0) {
            if (isSecondary) {
                setSecondaryFile(e.target.files[0]);
            } else {
                setFile(e.target.files[0]);
            }
        }
    };

    const applyMappingHeuristics = (headers: string[], entity: string, preset: CsvPreset | null, isSecondary: boolean = false) => {
        const initialMapping: Record<string, string> = {};
        const fields = ENTITY_FIELDS[entity] || [];
        fields.forEach(f => {
            let match = findMatchWithPreset(headers, f.key, preset);
            if (!match) {
                match = headers.find(h => matchHeuristic(h, f.key, f.label));
            }
            if (match) initialMapping[f.key] = match;
        });
        if (isSecondary) {
            setSecondaryMapping(initialMapping);
        } else {
            setColumnMapping(initialMapping);
        }
    };

    const handleAnalyze = async () => {
        if (!file) return;
        if (activeTab === 'csv' && csvImportMode === 'dual' && !secondaryFile) {
            notify('Por favor, selecciona también el archivo secundario.', 'info');
            return;
        }

        setIsAnalyzing(true);
        try {
            if (activeTab === 'backup') {
                const result = await registry.analyze(file);
                if (result) {
                    setAnalysis(result);
                    setDetectedImporter(registry.getImporter(result.type));
                    setStep(3);
                }
            } else { // CSV Mode
                const result1 = await parseCsv(file);
                setCsvData(result1.rows);
                setCsvPreview(result1.rows.slice(0, 10));
                setCsvHeaders(result1.headers);
                applyMappingHeuristics(result1.headers, csvEntity, activePreset, false);

                if (csvImportMode === 'dual' && secondaryFile) {
                    const result2 = await parseCsv(secondaryFile);
                    setSecondaryPreview(result2.rows.slice(0, 10));
                    setSecondaryHeaders(result2.headers);
                    applyMappingHeuristics(result2.headers, 'items', activePreset, true);
                }

                setStep(4);
            }
        } catch (e) {
            notify('Error al analizar: ' + (e as Error).message, 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCsvImport = async (skipValidation: boolean = false) => {
        if (!file || !csvEntity) return;
        setIsImporting(true);

        try {
            const runModeDry = !skipValidation;
            if (!runModeDry) await createSnapshot();

            let finalResult: ImportValidationResult;

            if (csvEntity === 'contacts') {
                finalResult = await importContactsFromCsv(csvData, columnMapping, {
                    mergeByTaxId: csvMergeOptions.byTaxId,
                    mergeByEmail: csvMergeOptions.byEmail,
                    dryRun: runModeDry
                });
            } else if (csvEntity === 'items') {
                finalResult = await importItemsFromCsv(csvData, columnMapping, {
                    mergeBySku: csvMergeOptions.bySku,
                    dryRun: runModeDry
                });
            } else if (csvEntity === 'invoices' || csvEntity === 'quotes') {
                let rows2: any[] = [];
                if (csvImportMode === 'dual' && secondaryFile) {
                    const r2 = await parseCsv(secondaryFile);
                    rows2 = r2.rows;
                }
                finalResult = await importDocumentsFromCsv(
                    csvEntity === 'invoices' ? 'invoice' : 'quote',
                    csvData,
                    columnMapping,
                    rows2,
                    secondaryMapping,
                    { dryRun: runModeDry }
                );
            } else {
                notify(`Importación para ${csvEntity} no implementada aún.`, 'info');
                setIsImporting(false);
                return;
            }

            if (runModeDry) {
                setValidationResult(finalResult);
                setStep(4.5);
            } else {
                setImportResult(finalResult);
                setStep(5);
            }
        } catch (err) {
            notify('Error: ' + (err as Error).message, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const handleImportBackup = async () => {
        if (!file || !detectedImporter || !analysis) return;
        setIsImporting(true);
        try {
            await createSnapshot();
            const result = await detectedImporter.import(file, analysis.data, { clearExisting: importMode === 'replace' });
            if (result.success) {
                setImportResult(result);
                setStep(5);
                notify('Importación completada.', 'success');
            } else {
                notify('Error: ' + result.message, 'error');
            }
        } catch (e) {
            notify('Error: ' + (e as Error).message, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    // Render Steps
    return (
        <div className="min-h-screen bg-gray-50 p-6 md:p-12">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8 flex items-center">
                    <Button variant="ghost" className="mr-4" onClick={() => navigate('/settings')}>
                        <ArrowLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black text-gray-800">Asistente de Importación</h1>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-xl p-8 min-h-[400px]">
                    {step === 1 && (
                        <div className="flex flex-col items-center py-12">
                            <div className="flex bg-gray-100 p-1 rounded-xl mb-8">
                                <button
                                    onClick={() => setActiveTab('backup')}
                                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'backup' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Backup / Copia
                                </button>
                                <button
                                    onClick={() => setActiveTab('csv')}
                                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'csv' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Archivo CSV
                                </button>
                            </div>

                            {activeTab === 'csv' && (
                                <div className="mb-6 w-full max-w-md">
                                    <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Entidad</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {['contacts', 'invoices', 'quotes', 'items', 'expenses'].map(id => (
                                            <button
                                                key={id}
                                                onClick={() => {
                                                    setCsvEntity(id as any);
                                                    if (id !== 'invoices' && id !== 'quotes') setCsvImportMode('single');
                                                }}
                                                className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${csvEntity === id ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-200'}`}
                                            >
                                                {id.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>

                                    {(csvEntity === 'invoices' || csvEntity === 'quotes') && (
                                        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                            <label className="text-xs font-black text-blue-700 uppercase mb-2 block tracking-widest">Modo de Archivo</label>
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => setCsvImportMode('single')}
                                                    className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${csvImportMode === 'single' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-blue-600 border border-blue-200'}`}
                                                >
                                                    Archivo Único (Repetido)
                                                </button>
                                                <button
                                                    onClick={() => setCsvImportMode('dual')}
                                                    className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${csvImportMode === 'dual' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-blue-600 border border-blue-200'}`}
                                                >
                                                    Cabecera + Líneas
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full max-w-md aspect-video bg-blue-50 border-2 border-dashed border-blue-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-blue-100 hover:border-blue-300 transition-all group"
                            >
                                <Upload size={48} className="text-blue-400 group-hover:text-blue-600 group-hover:scale-110 transition-all mb-4" />
                                <span className="text-sm font-bold text-blue-600">{file ? file.name : 'Selecciona o arrastra el archivo'}</span>
                                <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelect(e, false)} className="hidden" accept=".csv,.json" />
                            </div>

                            {csvImportMode === 'dual' && (
                                <div
                                    onClick={() => secondaryFileInputRef.current?.click()}
                                    className="w-full max-w-md mt-4 aspect-[4/1] bg-purple-50 border-2 border-dashed border-purple-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-purple-100 transition-all"
                                >
                                    <span className="text-xs font-bold text-purple-600 uppercase tracking-widest">{secondaryFile ? secondaryFile.name : 'Subir archivo de LÍNEAS'}</span>
                                    <input type="file" ref={secondaryFileInputRef} onChange={(e) => handleFileSelect(e, true)} className="hidden" accept=".csv" />
                                </div>
                            )}

                            <Button
                                onClick={handleAnalyze}
                                disabled={!file || isAnalyzing}
                                className="mt-8 px-12 h-14 bg-blue-600 hover:bg-blue-700 text-lg font-black shadow-xl disabled:bg-gray-200"
                            >
                                {isAnalyzing ? <Loader2 className="animate-spin mr-2" /> : <Search size={20} className="mr-2" />}
                                {isAnalyzing ? 'Analizando...' : 'Analizar Archivo'}
                            </Button>
                        </div>
                    )}

                    {step === 3 && activeTab === 'backup' && analysis && (
                        <div className="space-y-8">
                            <h2 className="text-2xl font-bold">Resumen de Backup</h2>
                            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className={`p-4 border-2 rounded-xl cursor-pointer ${importMode === 'replace' ? 'border-red-500' : 'border-gray-200'}`}>
                                        <input type="radio" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} className="mr-2" />
                                        Reemplazar todo
                                    </label>
                                    <label className={`p-4 border-2 rounded-xl cursor-pointer ${importMode === 'merge' ? 'border-blue-500' : 'border-gray-200'}`}>
                                        <input type="radio" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} className="mr-2" />
                                        Fusionar datos
                                    </label>
                                </div>
                            </div>
                            <Button onClick={handleImportBackup} disabled={isImporting} className="w-full h-14 bg-green-600 font-bold">
                                {isImporting ? <Loader2 className="animate-spin mr-2" /> : <Database className="mr-2" />}
                                Iniciar Restauración
                            </Button>
                        </div>
                    )}

                    {step === 4 && activeTab === 'csv' && (
                        <div className="space-y-8">
                            <h2 className="text-2xl font-bold">Mapeo de Columnas</h2>
                            <div className="bg-white border rounded-xl">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500">Campo</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500">Columna CSV</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {(ENTITY_FIELDS[csvEntity] || []).map(f => (
                                            <tr key={f.key}>
                                                <td className="px-6 py-4 text-sm font-medium">{f.label}</td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        value={columnMapping[f.key] || ''}
                                                        onChange={(e) => setColumnMapping({ ...columnMapping, [f.key]: e.target.value })}
                                                        className="w-full p-2 border rounded-lg text-sm"
                                                    >
                                                        <option value="">-- Ignorar --</option>
                                                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <Button onClick={() => handleCsvImport(false)} disabled={isImporting} className="w-full h-14 bg-blue-600 font-bold">
                                Validar y Continuar
                            </Button>
                        </div>
                    )}

                    {step === 4.5 && validationResult && (
                        <div className="space-y-8 text-center py-8">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-6 bg-green-50 rounded-2xl"><span className="block text-2xl font-bold">{validationResult.validCount}</span>Válidas</div>
                                <div className="p-6 bg-orange-50 rounded-2xl"><span className="block text-2xl font-bold">{validationResult.warningCount}</span>Avisos</div>
                                <div className="p-6 bg-red-50 rounded-2xl"><span className="block text-2xl font-bold">{validationResult.errorCount}</span>Errores</div>
                            </div>
                            <div className="flex justify-center space-x-4">
                                <Button variant="ghost" onClick={() => setStep(4)}>Atrás</Button>
                                <Button onClick={() => handleCsvImport(true)} className="bg-green-600 px-12 h-14 font-black">Importar {validationResult.validCount} Filas</Button>
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="text-center py-12">
                            <CheckCircle2 size={64} className="text-green-500 mx-auto mb-6" />
                            <h2 className="text-3xl font-bold mb-8">Importación Completada</h2>
                            <div className="flex flex-col items-center space-y-4">
                                <Button onClick={() => { discardSnapshot(); window.location.reload(); }} className="w-64 h-12 bg-green-600 font-bold">Finalizar</Button>
                                <Button variant="ghost" onClick={async () => { await restoreSnapshot(); discardSnapshot(); setStep(1); notify('Cambios revertidos.'); }} className="text-gray-400 hover:text-red-500 flex items-center">
                                    <History size={16} className="mr-2" />
                                    Deshacer
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ label, count, color }: any) => (
    <div className={`p-4 rounded-xl border flex flex-col items-center justify-center bg-${color}-50 text-${color}-700 border-${color}-100`}>
        <span className="text-2xl font-black">{count || 0}</span>
        <span className="text-xs uppercase opacity-80">{label}</span>
    </div>
);

export default ImportWizard;
