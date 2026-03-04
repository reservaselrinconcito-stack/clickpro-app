

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@/core/db-adapter/useQuery';
import {
  contactsApi, templatesApi, itemsApi, settingsApi,
  invoicesApi, quotesApi, expensesApi, paymentsApi,
  recurringInvoicesApi, recurringQuotesApi, inboxApi
} from '@/core/adapter-api';
import { Invoice, Quote, LineItem, Contact, DocumentTemplate, RecurringInvoiceTemplate, RecurringQuoteTemplate, CatalogItem, CompanySettings, TemplateBlock, InboxThread } from '../types';
import { generateDocumentNumber } from '@/utils/numbering';
import { Button, Input, Modal, Card, Badge, Select, notify } from '../components/UI';
import { Search, Plus, Trash2, Edit3, FileText, Download, Printer, ChevronLeft, Calendar, User, ShoppingCart, Percent, Save, Copy, Repeat, ArrowRight, Bookmark, Lock, Unlock, Layout, Tag, Check, Filter, Play, Clock, CalendarDays, FileOutput, Link as LinkIcon, Package, X, ShieldCheck, Info, PauseCircle, Power, AlertTriangle, EyeOff, AlertCircle, Ban, Send, ThumbsUp, ThumbsDown, DollarSign, Eye, Grid, ZoomIn, ZoomOut, Mail, MessageSquare } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { generateDocumentPDF } from '../services/pdfGenerator';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { manualRunRecurring } from '../services/automationService';
import { DocumentHTMLPreview } from '../components/DocumentHTMLPreview';

// --- PAYMENT MODAL ---
const PaymentModal = ({ isOpen, onClose, doc, onSave }: { isOpen: boolean, onClose: () => void, doc: Invoice, onSave: (amount: number, date: string, method: string) => void }) => {
    const [amount, setAmount] = useState(doc.grandTotal - (doc.paidAmount || 0));
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [method, setMethod] = useState('transfer');

    useEffect(() => {
        if (isOpen) {
            setAmount(parseFloat((doc.grandTotal - (doc.paidAmount || 0)).toFixed(2)));
            setDate(new Date().toISOString().split('T')[0]);
        }
    }, [isOpen, doc]);

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Registrar Cobro">
            <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-sm text-green-800">
                    <div className="flex justify-between mb-1">
                        <span>Total Factura:</span>
                        <span className="font-bold">{doc.grandTotal.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Pendiente:</span>
                        <span className="font-bold">{(doc.grandTotal - (doc.paidAmount || 0)).toFixed(2)} €</span>
                    </div>
                </div>

                <Input label="Importe a Cobrar" type="number" step="0.01" value={amount} onChange={(e: any) => setAmount(parseFloat(e.target.value))} />
                <Input label="Fecha de Cobro" type="date" value={date} onChange={(e: any) => setDate(e.target.value)} />
                <Select label="Método de Pago" value={method} onChange={(e: any) => setMethod(e.target.value)}>
                    <option value="transfer">Transferencia</option>
                    <option value="card">Tarjeta</option>
                    <option value="cash">Efectivo</option>
                    <option value="direct_debit">Domiciliación</option>
                </Select>

                <div className="pt-4 flex justify-end space-x-2">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button variant="success" onClick={() => onSave(amount, date, method)}>Registrar Cobro</Button>
                </div>
            </div>
        </Modal>
    );
};

// --- PREVIEW MODAL ---
const DocumentPreviewModal = ({ isOpen, onClose, doc, client, settings, template }: { isOpen: boolean, onClose: () => void, doc: any, client: any, settings: any, template: any }) => {
    const [scale, setScale] = useState(0.8);

    if (!isOpen) return null;

    const handleAction = (action: 'print' | 'download') => {
        const previewClient = client || { name: 'Cliente', nif: '', address: '', city: '', zip: '', id: 'temp', type: 'client', createdAt: 0, updatedAt: 0 };
        generateDocumentPDF(doc, previewClient, settings, template, { action });
    };

    const zoomIn = () => setScale(prev => Math.min(prev + 0.1, 1.5));
    const zoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.4));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Vista Previa del Documento" maxWidth="max-w-[90vw]">
            <div className="flex flex-col h-[85vh]">
                <div className="flex justify-between items-center mb-4 px-2">
                    <div className="flex items-center space-x-2 bg-gray-100 p-1 rounded-lg">
                        <button onClick={zoomOut} className="p-1 hover:bg-white rounded shadow-sm transition-colors"><ZoomOut size={18} /></button>
                        <span className="text-xs font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
                        <button onClick={zoomIn} className="p-1 hover:bg-white rounded shadow-sm transition-colors"><ZoomIn size={18} /></button>
                    </div>
                    <div className="flex space-x-2">
                        <Button variant="secondary" onClick={() => handleAction('print')}><Printer size={18} className="mr-2" /> Imprimir</Button>
                        <Button variant="primary" onClick={() => handleAction('download')}><Download size={18} className="mr-2" /> Descargar PDF</Button>
                    </div>
                </div>

                {/* Scrollable Container */}
                <div className="flex-1 bg-gray-200/80 rounded-xl overflow-auto border border-gray-300 relative flex justify-center p-8">
                    <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center', transition: 'transform 0.2s ease-out' }}>
                        {doc && settings && template ? (
                            <DocumentHTMLPreview
                                doc={doc}
                                client={client || { name: 'Cliente (No seleccionado)', address: 'Dirección...', nif: '00000000X' }}
                                settings={settings}
                                template={template}
                            />
                        ) : (
                            <div className="flex items-center justify-center w-[210mm] h-[297mm] bg-white">
                                <span className="text-gray-400">Cargando vista previa...</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

// --- TEMPLATE PICKER MODAL ---
const TemplatePickerModal = ({ isOpen, onClose, templates, currentId, onSelect }: any) => {
    const [selectedTag, setSelectedTag] = useState<string>('ALL');

    // Extract unique tags and sort
    const tags = useMemo(() => {
        const t = new Set<string>();
        templates.forEach((tpl: DocumentTemplate) => {
            if (tpl.tags) tpl.tags.forEach(tag => t.add(tag));
        });
        return Array.from(t).sort();
    }, [templates]);

    // Filter templates
    const filtered = selectedTag === 'ALL'
        ? templates
        : templates.filter((t: DocumentTemplate) => t.tags?.includes(selectedTag));

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Seleccionar Plantilla Visual" maxWidth="max-w-4xl">
            <div className="space-y-4">
                <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                    <Filter size={16} />
                    <span>Filtrar por etiquetas:</span>
                </div>

                {/* Tags Filter */}
                <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-100">
                    <button
                        onClick={() => setSelectedTag('ALL')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${selectedTag === 'ALL' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        Todos
                    </button>
                    {tags.map(tag => (
                        <button
                            key={tag}
                            onClick={() => setSelectedTag(tag)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center border ${selectedTag === tag ? 'bg-[var(--accent-blue)] text-white border-[var(--accent-blue)]' : 'bg-white text-[var(--accent-blue)] border-[var(--accent-blue-soft)] hover:bg-[var(--accent-blue-soft)]'}`}
                        >
                            <Tag size={12} className="mr-1.5" /> {tag}
                        </button>
                    ))}
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-1">
                    {filtered.map((t: DocumentTemplate) => (
                        <div
                            key={t.id}
                            onClick={() => { onSelect(t.id); onClose(); }}
                            className={`cursor-pointer border-2 rounded-xl p-4 transition-all hover:shadow-lg relative group ${currentId === t.id ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-soft)]/50 ring-1 ring-[var(--accent-blue)]' : 'border-gray-100 bg-white hover:border-opacity-30'}`}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className={`p-2 rounded-lg ${t.type === 'invoice' ? 'bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]' : 'bg-orange-100 text-orange-600'}`}>
                                    <Layout size={20} />
                                </div>
                                {t.isDefault && <Badge color="green">Predeterminada</Badge>}
                            </div>

                            <h4 className="font-bold text-gray-800 mb-1">{t.name}</h4>

                            <div className="text-xs text-gray-400 mb-3 line-clamp-2">
                                {t.defaultNotes || 'Sin notas por defecto'}
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                {(t.tags || []).slice(0, 4).map((tag: string) => (
                                    <span key={tag} className="text-[10px] bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-gray-600 font-medium">{tag}</span>
                                ))}
                                {(t.tags?.length || 0) > 4 && <span className="text-[10px] text-gray-400 self-center">+{t.tags!.length - 4}</span>}
                            </div>

                            {currentId === t.id && (
                                <div className="absolute top-[-10px] right-[-10px] text-white bg-[var(--accent-blue)] rounded-full p-1 shadow-md animate-in zoom-in duration-200">
                                    <Check size={16} />
                                </div>
                            )}
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div className="col-span-full py-10 text-center text-gray-400">
                            No se encontraron plantillas con la etiqueta "{selectedTag}".
                        </div>
                    )}
                </div>
            </div>
            <div className="pt-4 border-t border-gray-100 flex justify-end">
                <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            </div>
        </Modal>
    );
};

// --- CATALOG PICKER MODAL ---
const CatalogPickerModal = ({ isOpen, onClose, items, onSelect }: { isOpen: boolean, onClose: () => void, items: CatalogItem[], onSelect: (item: CatalogItem) => void }) => {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('ALL');

    const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean)));
    const filtered = items.filter(i => {
        const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase());
        const matchesCat = category === 'ALL' || i.category === category;
        return matchesSearch && matchesCat;
    });

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Añadir del Catálogo" maxWidth="max-w-3xl">
            <div className="space-y-4">
                <div className="flex space-x-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-[var(--accent-blue-soft)]"
                            placeholder="Buscar producto o servicio..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <select
                        className="border rounded-md px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[var(--accent-blue-soft)]"
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                    >
                        <option value="ALL">Todas las Categorías</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0">
                            <tr>
                                <th className="px-4 py-2">Nombre / Descripción</th>
                                <th className="px-4 py-2 w-24 text-right">Precio</th>
                                <th className="px-4 py-2 w-20">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.map(item => (
                                <tr key={item.id} className="hover:bg-[var(--accent-blue-soft)] group cursor-pointer" onClick={() => onSelect(item)}>
                                    <td className="px-4 py-2">
                                        <div className="font-bold text-gray-900">{item.name}</div>
                                        <div className="text-xs text-gray-500 truncate">{item.description}</div>
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono">
                                        {item.price.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <Button size="sm" variant="ghost" className="text-[var(--accent-blue)] hover:bg-[var(--accent-blue-soft)]"><Plus size={14} /></Button>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="p-8 text-center text-gray-400">No se encontraron resultados.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
};

// --- DOCUMENT EDITOR COMPONENT ---
interface DocumentEditorProps {
    type: 'invoice' | 'quote';
    initialId?: string;
    initialData?: any;
    onClose: () => void;
    isRecurringMode?: boolean; // New prop to force recurring mode
}

const DocumentEditor = ({ type, initialId, initialData, onClose, isRecurringMode = false }: DocumentEditorProps) => {
    const navigate = useNavigate();
    const contacts = useQuery(() => contactsApi.byType('client'), [], ['contacts']) || [];
    const templates = useQuery(() => templatesApi.byType(type), [type], ['templates']) || [];
    const invoiceTemplates = useQuery(() => templatesApi.byType('invoice'), [], ['templates']) || [];
    const items = useQuery(() => itemsApi.all(), [], ['items']) || [];
    const settingsArr = useQuery(() => settingsApi.all(), [], ['settings']);
    const settings = settingsArr; // alias kept for downstream code that uses settings?.[0]

    const [isRecurring, setIsRecurring] = useState(isRecurringMode);
    const [isLoading, setIsLoading] = useState(!!initialId);

    // Dual State: Doc (Standard) & Recurring (Template)
    const [doc, setDoc] = useState<Partial<Invoice | Quote>>({
        number: '(Borrador)',
        date: new Date().toISOString().split('T')[0],
        status: 'draft',
        lines: [],
        baseTotal: 0, vatTotal: 0, grandTotal: 0,
        internalNotes: ''
    });

    const [rec, setRec] = useState<Partial<RecurringInvoiceTemplate | RecurringQuoteTemplate>>({
        name: '',
        frequency: 'monthly',
        nextRun: Date.now(),
        active: true
    });

    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
    const [isCatalogPickerOpen, setIsCatalogPickerOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

    // Linked Quote Logic (For Invoices)
    const [linkedQuoteNumber, setLinkedQuoteNumber] = useState<string | null>(null);

    // Convert Modal State
    const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
    const [selectedConvertTemplateId, setSelectedConvertTemplateId] = useState<string>('');

    // Load initial data
    useEffect(() => {
        const load = async () => {
            if (initialId) {
                // Determine if we are loading a standard doc or a recurring template
                if (isRecurringMode) {
                    const existing = type === 'invoice' ? await recurringInvoicesApi.get(initialId) : await recurringQuotesApi.get(initialId);
                    if (existing) {
                        setRec(existing);
                        // Populate doc state for line/total calculation compatibility
                        setDoc({
                            contactId: existing.contactId,
                            templateId: existing.defaultTemplateId,
                            notes: existing.notes,
                            lines: existing.lines,
                            status: 'draft' // dummy
                        });
                        setIsRecurring(true);
                    }
                } else {
                    const existing = type === 'invoice' ? await invoicesApi.get(initialId) : await quotesApi.get(initialId);
                    if (existing) {
                        setDoc(existing);
                        setIsRecurring(false);

                        // If it's an invoice with a quoteId, fetch the quote number
                        if (type === 'invoice' && (existing as Invoice).quoteId) {
                            const q = await quotesApi.get((existing as Invoice).quoteId!);
                            if (q) setLinkedQuoteNumber(q.number);
                        }
                    }
                }
            } else if (initialData) {
                // Instantiating from Catalog or elsewhere
                const defaultTemplate = templates.find(t => t.isDefault);

                setDoc({
                    id: uuidv4(),
                    number: '(Borrador)',
                    date: new Date().toISOString().split('T')[0],
                    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    status: 'draft',
                    contactId: initialData.contactId,
                    lines: initialData.lines ? initialData.lines.map((l: any) => ({ ...l, id: uuidv4() })) : [],
                    templateId: initialData.defaultTemplateId || defaultTemplate?.id,
                    notes: initialData.notes || defaultTemplate?.defaultNotes || '',
                    baseTotal: 0, vatTotal: 0, retentionTotal: 0, grandTotal: 0,
                    internalNotes: ''
                });

                // Init recurring defaults just in case user toggles it
                setRec({
                    name: 'Nueva Plantilla Recurrente',
                    frequency: 'monthly',
                    nextRun: Date.now(),
                    active: true
                });

            } else {
                // New Blank Doc
                const defaultTemplate = templates.find(t => t.isDefault);

                setDoc({
                    id: uuidv4(),
                    number: '(Borrador)',
                    date: new Date().toISOString().split('T')[0],
                    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // +30 days
                    status: 'draft',
                    lines: [],
                    templateId: defaultTemplate?.id,
                    notes: defaultTemplate?.defaultNotes || '',
                    baseTotal: 0, vatTotal: 0, retentionTotal: 0, grandTotal: 0,
                    internalNotes: ''
                });

                setRec({
                    name: 'Nueva Plantilla Recurrente',
                    frequency: 'monthly',
                    nextRun: Date.now(),
                    active: true
                });
            }
        };
        if (settings && (initialId ? true : (templates.length > 0))) {
            setIsLoading(true);
            load().finally(() => setIsLoading(false));
        }
    }, [initialId, type, settings, templates, initialData, isRecurringMode]);

    // Robust Calculations with Rounding and Breakdown (Same for both modes)
    useEffect(() => {
        const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

        const byRate: Record<number, number> = {};
        let baseTotal = 0;
        let retentionTotal = 0;

        doc.lines?.forEach(l => {
            const lineBase = l.quantity * l.price * (1 - (l.discountPct || 0) / 100);
            baseTotal += lineBase;
            retentionTotal += lineBase * ((l.retentionPct || 0) / 100);

            const rate = l.vatPct || 0;
            byRate[rate] = (byRate[rate] || 0) + lineBase;
        });

        let vatTotal = 0;
        Object.entries(byRate).forEach(([rate, amount]) => {
            vatTotal += amount * (parseFloat(rate) / 100);
        });

        setDoc(prev => ({
            ...prev,
            baseTotal: round(baseTotal),
            vatTotal: round(vatTotal),
            retentionTotal: round(retentionTotal),
            grandTotal: round(baseTotal + vatTotal - retentionTotal)
        }));
    }, [doc.lines]);

    const taxBreakdown = useMemo(() => {
        const rates: Record<number, number> = {};
        doc.lines?.forEach(l => {
            const base = l.quantity * l.price * (1 - (l.discountPct || 0) / 100);
            const rate = l.vatPct || 0;
            rates[rate] = (rates[rate] || 0) + base;
        });
        return Object.entries(rates)
            .map(([rate, base]) => ({
                rate: parseFloat(rate),
                base,
                vat: base * (parseFloat(rate) / 100)
            }))
            .sort((a, b) => b.rate - a.rate);
    }, [doc.lines]);

    // Helper for schedule description
    const getScheduleDescription = () => {
        if (!rec.nextRun) return '';
        const d = new Date(rec.nextRun);
        const day = d.getDate();

        switch (rec.frequency) {
            case 'monthly': return `Generación mensual, el día ${day} de cada mes.`;
            case 'weekly': return `Generación semanal, cada ${d.toLocaleDateString('es-ES', { weekday: 'long' })}.`;
            case 'quarterly': return `Generación trimestral (día ${day}).`;
            case 'annual': return `Generación anual (el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}).`;
            default: return '';
        }
    };

    const addLine = () => {
        const templateDefault = templates.find(t => t.id === doc.templateId)?.defaultVat;
        const settingsDefault = settings?.[0]?.defaultVat;
        const defaultVat = templateDefault ?? settingsDefault ?? 21;
        const defaultRetention = settings?.[0]?.applyRetentionByDefault ? (settings?.[0]?.defaultRetention || 0) : 0;

        setDoc(prev => ({
            ...prev,
            lines: [...(prev.lines || []), {
                id: uuidv4(),
                description: '',
                quantity: 1,
                price: 0,
                vatPct: defaultVat,
                discountPct: 0,
                retentionPct: defaultRetention
            }]
        }));
    };

    const addFromCatalog = (item: CatalogItem) => {
        const templateDefault = templates.find(t => t.id === doc.templateId)?.defaultVat;
        const defaultRetention = settings?.[0]?.applyRetentionByDefault ? (settings?.[0]?.defaultRetention || 0) : 0;

        setDoc(prev => ({
            ...prev,
            lines: [...(prev.lines || []), {
                id: uuidv4(),
                description: item.name,
                quantity: 1,
                price: item.price,
                vatPct: item.vatPct || templateDefault || 21,
                discountPct: 0,
                retentionPct: defaultRetention,
                unit: item.unit
            }]
        }));
        setIsCatalogPickerOpen(false);
    };

    const updateLine = (index: number, field: keyof LineItem, value: any) => {
        const newLines = [...(doc.lines || [])];
        newLines[index] = { ...newLines[index], [field]: value };

        // Smart Autocomplete: If description matches a catalog item, auto-fill details
        if (field === 'description') {
            const match = items.find(i => i.name.toLowerCase() === (value as string).toLowerCase());
            if (match) {
                newLines[index].price = match.price;
                newLines[index].vatPct = match.vatPct;
                newLines[index].unit = match.unit;
            }
        }

        setDoc(prev => ({ ...prev, lines: newLines }));
    };

    const removeLine = (index: number) => {
        setDoc(prev => ({ ...prev, lines: prev.lines?.filter((_, i) => i !== index) }));
    };

    const handleIssue = async () => {
        if (!doc.contactId) return notify('Selecciona un cliente obligatoriamente', 'error');
        if (!settings?.[0]) return notify('Error de configuración', 'error');
        if (type === 'invoice' && !doc.dueDate) return notify('Fecha de vencimiento es obligatoria para facturas', 'error');

        if (!confirm('¿Emitir documento definitivamente? Esto asignará un número oficial y bloqueará la edición.')) return;

        try {
            // Use Smart Numbering system
            let officialNumber = doc.number;
            if (!officialNumber || officialNumber === '(Borrador)') {
                officialNumber = await generateDocumentNumber(type);
            }

            // Update Doc
            const updatedDoc = {
                ...doc,
                number: officialNumber,
                status: 'sent' as const, // Official issued status
                updatedAt: Date.now()
            };

            if (type === 'invoice') await invoicesApi.put(updatedDoc as Invoice);
            else await quotesApi.put(updatedDoc as Quote);

            // Update local state to reflect changes immediately
            setDoc(updatedDoc);
            notify(`Documento emitido: ${officialNumber}`, 'success');
            // Do not close immediately to let user see change
        } catch (e) {
            console.error(e);
            notify('Error al emitir documento', 'error');
        }
    };

    const handleQuickAction = async (action: 'accept' | 'reject' | 'void') => {
        if (!doc.id) return;

        let newStatus = '';
        let confirmMsg = '';

        if (action === 'accept') { newStatus = 'accepted'; confirmMsg = '¿Marcar presupuesto como ACEPTADO?'; }
        if (action === 'reject') { newStatus = 'rejected'; confirmMsg = '¿Marcar presupuesto como RECHAZADO?'; }
        if (action === 'void') { newStatus = 'void'; confirmMsg = '¿ANULAR este documento? Esta acción bloqueará la edición.'; }

        if (!confirm(confirmMsg)) return;

        const updates: any = { status: newStatus, updatedAt: Date.now() };
        setDoc({ ...doc, ...updates });

        if (type === 'invoice') await invoicesApi.update(doc.id, updates);
        else await quotesApi.update(doc.id, updates);

        notify(`Estado actualizado a: ${newStatus.toUpperCase()}`, 'success');
    };

    const handleRegisterPayment = async (amount: number, date: string, method: string) => {
        if (!doc.id || type !== 'invoice') return;

        const newPaidAmount = (doc.paidAmount || 0) + amount;
        const isPaid = newPaidAmount >= (doc.grandTotal || 0) - 0.01; // Tolerance

        const updates: any = {
            paidAmount: newPaidAmount,
            paidDate: isPaid ? date : undefined,
            status: isPaid ? 'paid' : 'sent',
            updatedAt: Date.now()
        };

        // Add payment record
        await paymentsApi.add({
            id: uuidv4(),
            invoiceId: doc.id,
            date,
            amount,
            method,
            reference: doc.number || '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        await invoicesApi.update(doc.id, updates);
        setDoc({ ...doc, ...updates });
        setIsPaymentModalOpen(false);
        notify(isPaid ? 'Factura marcada como PAGADA' : 'Cobro parcial registrado', 'success');
    };

    const handleDuplicateAsDraft = async () => {
        if (!confirm('¿Crear un nuevo borrador basado en este documento?')) return;

        const newDoc = {
            ...doc,
            id: uuidv4(),
            number: '(Borrador)',
            status: 'draft',
            date: new Date().toISOString().split('T')[0],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        // Remove linked fields if duplicatng invoice
        if (type === 'invoice') {
            delete (newDoc as any).quoteId;
            delete (newDoc as any).paidAmount;
            delete (newDoc as any).paidDate;
        }

        try {
            if (type === 'invoice') await invoicesApi.add(newDoc as Invoice);
            else await quotesApi.add(newDoc as Quote);

            notify('Borrador duplicado creado', 'success');
            onClose();
            // Optional: navigate to new doc or let user find it in list
        } catch (e) {
            notify('Error al duplicar', 'error');
        }
    };

    const save = async () => {
        if (!doc.contactId) return notify('Selecciona un cliente obligatoriamente', 'error');

        if (isRecurring) {
            // SAVE RECURRING TEMPLATE
            if (!rec.name) return notify('El nombre del modelo recurrente es obligatorio', 'error');

            const payload: RecurringInvoiceTemplate | RecurringQuoteTemplate = {
                id: initialId && isRecurringMode ? initialId : uuidv4(),
                name: rec.name,
                frequency: rec.frequency as any,
                nextRun: typeof rec.nextRun === 'string' ? new Date(rec.nextRun).getTime() : rec.nextRun || Date.now(),
                active: rec.active ?? true,
                contactId: doc.contactId,
                defaultTemplateId: doc.templateId,
                notes: doc.notes || '',
                lines: doc.lines || [],
                createdAt: (rec as any).createdAt || Date.now(),
                updatedAt: Date.now(),
                lastRun: (rec as any).lastRun
            };

            try {
                if (type === 'invoice') await recurringInvoicesApi.put(payload as RecurringInvoiceTemplate);
                else await recurringQuotesApi.put(payload as RecurringQuoteTemplate);
                notify('Plantilla recurrente guardada', 'success');
                onClose();
            } catch (e) {
                notify('Error al guardar recurrente', 'error');
            }

        } else {
            // SAVE STANDARD DOCUMENT (DRAFT)
            // Logic: Just save. Do NOT touch counters here.

            // Check for duplicate number manually only if it's NOT a draft placeholder
            if (doc.number !== '(Borrador)') {
                const existing = type === 'invoice'
                    ? await invoicesApi.findByNumber(doc.number!)
                    : await quotesApi.findByNumber(doc.number!);

                if (existing && existing.id !== doc.id) {
                    return notify(`El número ${doc.number} ya existe.`, 'error');
                }
            }

            const payload = { ...doc, updatedAt: Date.now() };

            try {
                if (type === 'invoice') await invoicesApi.put(payload as Invoice);
                else await quotesApi.put(payload as Quote);

                // REMOVED COUNTER INCREMENT LOGIC FROM HERE. MOVED TO handleIssue.

                notify('Borrador guardado', 'success');
                onClose();
            } catch (e) {
                notify('Error al guardar', 'error');
            }
        }
    };

    const openConversionModal = () => {
        if (!doc.contactId) return notify('Guarda el presupuesto primero o selecciona cliente', 'error');
        if (!doc.id) return notify('Guarda el presupuesto antes de convertir', 'error');

        // Find default invoice template
        const def = invoiceTemplates.find(t => t.isDefault) || invoiceTemplates[0];
        setSelectedConvertTemplateId(def?.id || '');
        setIsConvertModalOpen(true);
    };

    const processConversion = async () => {
        if (!settings?.[0]) return notify('Error de configuración', 'error');
        if (!selectedConvertTemplateId) return notify('Selecciona una plantilla', 'error');

        try {
            const invNumber = '(Borrador)';

            const invoice: Invoice = {
                ...doc as any,
                id: uuidv4(),
                number: invNumber,
                templateId: selectedConvertTemplateId, // Use selected invoice template
                date: new Date().toISOString().split('T')[0],
                status: 'draft',
                quoteId: doc.id,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            await invoicesApi.add(invoice);
            // Counter NOT incremented here.

            if (doc.id) {
                await quotesApi.update(doc.id, { status: 'converted' });
            }

            notify(`Presupuesto convertido a Factura Borrador`, 'success');
            setIsConvertModalOpen(false);
            onClose();
            // Navigate to invoices and open the new invoice
            navigate('/invoices', { state: { openId: invoice.id } });
        } catch (e) {
            notify('Error al convertir', 'error');
        }
    };

    const handlePrint = async (action: 'download' | 'print') => {
        if (!doc.contactId) return notify('Guarda primero o selecciona cliente', 'error');
        const client = contacts.find(c => c.id === doc.contactId);
        let template = templates.find(t => t.id === doc.templateId);
        if (!template) template = templates.find(t => t.isDefault) || templates[0];

        if (client && settings?.[0] && template) {
            generateDocumentPDF(doc as Invoice, client, settings[0], template, { action });
        } else {
            notify('Faltan datos para generar el PDF', 'error');
        }
    };

    const handleNavigateToSource = () => {
        if ((doc as Invoice).quoteId) {
            navigate('/quotes', { state: { openId: (doc as Invoice).quoteId } });
        }
    };

    const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = e.target.value;
        const updates: any = { status: newStatus };

        // Auto-assign number if moving to sent/issued and doesn't have one
        if (newStatus === 'sent' && (!doc.number || doc.number === '(Borrador)')) {
            updates.number = await generateDocumentNumber(type);
        }

        // Auto-set paid date if marking as paid
        if (type === 'invoice' && newStatus === 'paid' && !(doc as Invoice).paidDate) {
            updates.paidDate = new Date().toISOString().split('T')[0];
            // Optional: Auto-fill paidAmount if using simple mode
            if (!(doc as Invoice).paidAmount) {
                updates.paidAmount = doc.grandTotal;
            }
        }

        setDoc({ ...doc, ...updates });
    };

    const handleSendDocument = async (channel: 'email' | 'whatsapp') => {
        if (!doc.contactId) return notify('Selecciona un cliente primero', 'error');
        if (doc.status === 'draft') {
            return notify(`La ${type === 'invoice' ? 'factura' : 'presupuesto'} debe estar emitida para enviarla`, 'info');
        }

        try {
            const client = contacts.find(c => c.id === doc.contactId);
            if (!client) return;

            // 1. Check/Create Inbox Thread
            let thread = await inboxApi.threads.getByParty(client.id);
            if (!thread) {
                const newThread: InboxThread = {
                    id: uuidv4(),
                    partyId: client.id,
                    partyType: client.type,
                    title: client.name,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                await inboxApi.threads.upsert(newThread);
                thread = newThread;
            }

            // 2. Prepare Variables
            const settingsData = await settingsApi.get();
            const currency = settingsData?.currency || '€';
            const variables = {
                cliente_nombre: client.name,
                doc_numero: doc.number || '',
                doc_total: `${doc.grandTotal.toFixed(2)} ${currency}`,
                doc_fecha: doc.date ? new Date(doc.date).toLocaleDateString('es-ES') : '',
                doc_link: `https://totalgestpro.app/view/${doc.id}`,
                company_name: settingsData?.companyName || 'Nuestra Empresa',
                logo_url: settingsData?.logo || ''
            };

            if (channel === 'whatsapp') {
                // BLOCK 21/26: WhatsApp Template-based logic
                const emailTemplates = await inboxApi.emailTemplates.all();
                const template = emailTemplates.find(t => t.name === 'Factura Pro') || emailTemplates[0];

                let body = '';
                if (template) {
                    if (template.whatsappText) {
                        body = template.whatsappText;
                        // Manual replacement for whatsappText
                        Object.entries(variables).forEach(([key, value]) => {
                            const regex = new RegExp(`{{${key}}}`, 'g');
                            body = body.replace(regex, value);
                        });
                    } else {
                        const { generateWhatsAppText } = await import('@/services/whatsappRenderer');
                        body = generateWhatsAppText(template, variables);
                    }
                } else {
                    body = `Hola ${client.name},\n\nTe enviamos la ${type === 'invoice' ? 'factura' : 'presupuesto'} ${doc.number} por importe de ${doc.grandTotal.toFixed(2)} ${currency}.\n\nGracias.`;
                }

                // Create Inbox Message (Opened)
                const finalRenderedBody = body;
                await inboxApi.messages.add({
                    threadId: thread.id,
                    channel: 'whatsapp',
                    status: 'opened',
                    subject: `Envío WhatsApp: ${doc.number}`,
                    body,
                    finalRenderedBody, // Histórico exacto
                    relatedType: type === 'invoice' ? 'invoice' : 'quote',
                    relatedId: doc.id,
                    openedAt: Date.now()
                });

                // Open WhatsApp - Normalize phone (only digits and +)
                const cleanPhone = client.phone.replace(/[^\d+]/g, '');
                const encodedText = encodeURIComponent(body);
                window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank');

                notify('Abriendo WhatsApp...', 'success');
                onClose();
            } else {
                // Standard Email logic (Draft in Inbox)
                const subject = `${type === 'invoice' ? 'Factura' : 'Presupuesto'} ${doc.number}`;
                const body = `Hola ${client.name},\n\nTe enviamos la ${type === 'invoice' ? 'factura' : 'presupuesto'} ${doc.number} por importe de ${doc.grandTotal.toFixed(2)} ${currency}.\n\nGracias.`;

                const msgId = await inboxApi.messages.add({
                    threadId: thread.id,
                    channel: 'email',
                    status: 'draft',
                    subject,
                    body,
                    relatedType: type === 'invoice' ? 'invoice' : 'quote',
                    relatedId: doc.id
                });

                navigate(`/communications?threadId=${thread.id}&msgId=${msgId}`);
                onClose();
            }
        } catch (error) {
            notify('Error al preparar comunicación', 'error');
        }
    };

    const tableInputClass = "w-full px-2 py-1.5 border border-gray-300 hover:border-gray-400 bg-white text-gray-900 rounded text-sm focus:ring-2 focus:ring-[var(--accent-blue-soft)] focus:border-[var(--accent-blue)] outline-none transition-all placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500 disabled:border-transparent";
    const currentTemplate = templates.find(t => t.id === doc.templateId) || templates.find(t => t.isDefault) || templates[0];

    // Date formatting for recurring input
    const nextRunDateVal = typeof rec.nextRun === 'number'
        ? new Date(rec.nextRun).toISOString().split('T')[0]
        : rec.nextRun;

    const isDraft = doc.status === 'draft';
    const isVoid = doc.status === 'void';
    const isLocked = (!isDraft && !isRecurring) || isVoid; // Lock fields if not draft/rec OR if void

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-50 bg-gray-50/80 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center animate-in zoom-in-95">
                    <div className="w-12 h-12 border-4 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin mb-4 shadow-lg shadow-[var(--accent-blue-soft)]"></div>
                    <div className="text-gray-800 font-bold">Cargando documento...</div>
                    <div className="text-xs text-gray-400 mt-2 font-mono">{initialId}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col animate-in slide-in-from-bottom-4 duration-200">
            {/* Toolbar */}
            <div className={`border-b px-6 py-4 flex justify-between items-center shadow-sm ${isVoid ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                <div className="flex items-center space-x-4">
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 p-2 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} /></button>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                        {isRecurring
                            ? `Plantilla Recurrente: ${type === 'invoice' ? 'Factura' : 'Presupuesto'}`
                            : (initialId ? (isDraft ? 'Editar Borrador' : `Documento ${doc.number}`) : `Nuevo ${type === 'invoice' ? 'Factura' : 'Presupuesto'}`)}

                        {/* Status Badge */}
                        {!isRecurring && (
                            <span className={`ml-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${doc.status === 'draft' ? 'bg-gray-100 text-gray-600 border-gray-200' :
                                doc.status === 'sent' ? 'bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] border-opacity-20' :
                                    doc.status === 'paid' || doc.status === 'accepted' ? 'bg-green-100 text-green-700 border-green-200' :
                                        doc.status === 'converted' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                            doc.status === 'overdue' ? 'bg-red-100 text-red-700 border-red-200' :
                                                doc.status === 'refunded' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                                    'bg-red-100 text-red-700 border-red-200'
                                }`}>
                                {doc.status === 'draft' ? 'Borrador' :
                                    doc.status === 'sent' ? 'Pendiente' :
                                        doc.status === 'paid' ? 'Pagado' :
                                            doc.status === 'accepted' ? 'Aceptado' :
                                                doc.status === 'rejected' ? 'Rechazado' :
                                                    doc.status === 'converted' ? 'Convertido' :
                                                        doc.status === 'overdue' ? 'Vencido' :
                                                            doc.status === 'refunded' ? 'Abonado' :
                                                                'ANULADO'}
                            </span>
                        )}
                        {isRecurring && <span className={`ml-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${rec.active ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{rec.active ? 'Automatización Activa' : 'Pausada'}</span>}
                    </h2>

                    {/* MODE TOGGLE - Only if creating fresh and not locked */}
                    {!initialId && !isLocked && (
                        <div className="flex items-center bg-gray-100 p-1 rounded-lg ml-4">
                            <button
                                onClick={() => setIsRecurring(false)}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${!isRecurring ? 'bg-white shadow text-[var(--accent-blue)]' : 'text-gray-500'}`}
                            >
                                Documento
                            </button>
                            <button
                                onClick={() => setIsRecurring(true)}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${isRecurring ? 'bg-white shadow text-purple-600' : 'text-gray-500'}`}
                            >
                                Recurrente
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex space-x-2 items-center">
                    {/* Source Quote Link (For Invoices) */}
                    {!isRecurring && type === 'invoice' && linkedQuoteNumber && (
                        <button
                            onClick={handleNavigateToSource}
                            className="mr-3 flex items-center bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg text-sm font-medium border border-orange-200 hover:bg-orange-100 transition-colors"
                        >
                            <LinkIcon size={14} className="mr-1.5" /> Origen: {linkedQuoteNumber}
                        </button>
                    )}

                    {/* ACTIONS TOOLBAR */}
                    {!isRecurring && (
                        <>
                            {/* DRAFT ACTIONS */}
                            {isDraft && (
                                <Button variant="success" onClick={handleIssue} className="animate-pulse shadow-green-100 shadow-md">
                                    <Send size={18} className="mr-2" /> {type === 'invoice' ? 'Emitir Factura' : 'Enviar Presupuesto'}
                                </Button>
                            )}

                            {/* QUOTE: SENT ACTIONS */}
                            {type === 'quote' && doc.status === 'sent' && (
                                <>
                                    <Button variant="success" onClick={() => handleQuickAction('accept')} className="bg-green-600 text-white hover:bg-green-700">
                                        <ThumbsUp size={18} className="mr-2" /> Aceptar
                                    </Button>
                                    <Button variant="danger" onClick={() => handleQuickAction('reject')} className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200">
                                        <ThumbsDown size={18} className="mr-2" /> Rechazar
                                    </Button>
                                </>
                            )}

                            {/* QUOTE: ACCEPTED ACTIONS */}
                            {type === 'quote' && doc.status === 'accepted' && (
                                <Button variant="primary" onClick={openConversionModal} className="bg-purple-600 text-white hover:bg-purple-700 border-purple-600">
                                    <FileOutput size={18} className="mr-2" /> Convertir a Factura
                                </Button>
                            )}

                            {/* INVOICE: SENT/OVERDUE ACTIONS */}
                            {type === 'invoice' && (doc.status === 'sent' || doc.status === 'overdue') && (
                                <>
                                    <Button variant="success" onClick={() => setIsPaymentModalOpen(true)} className="shadow-md">
                                        <DollarSign size={18} className="mr-2" /> Registrar Cobro
                                    </Button>
                                    <Button variant="danger" onClick={() => handleQuickAction('void')} className="bg-red-50 text-red-600 hover:bg-red-100 border-red-200">
                                        <Ban size={18} className="mr-2" /> Anular
                                    </Button>
                                </>
                            )}

                            {/* COMMON UTILS */}
                            <div className="h-8 w-px bg-gray-200 mx-2"></div>

                            {/* SEND ACTIONS */}
                            <div className="flex gap-2 mr-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => handleSendDocument('email')}
                                    className="bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100"
                                    title="Enviar por Email"
                                >
                                    <Mail size={18} />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => handleSendDocument('whatsapp')}
                                    className="bg-green-50 text-green-600 border-green-100 hover:bg-green-100"
                                    title="Enviar por WhatsApp"
                                >
                                    <MessageSquare size={18} />
                                </Button>
                            </div>

                            {/* PREVIEW BUTTON */}
                            <Button variant="secondary" onClick={() => setIsPreviewModalOpen(true)} title="Previsualizar">
                                <Eye size={18} className="mr-2" /> Previsualizar
                            </Button>
                        </>
                    )}

                    {/* EDIT - For Locked Docs */}
                    {isLocked && !isVoid && !isRecurring && (
                        <Button
                            variant="secondary"
                            onClick={() => {
                                if (confirm('¿Deseas volver este documento a modo borrador para editarlo? Perderá su estado actual pero mantendrá los datos.')) {
                                    setDoc({ ...doc, status: 'draft' });
                                }
                            }}
                            className="bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] border-opacity-20"
                        >
                            <Edit3 size={18} className="mr-2" /> Habilitar Edición
                        </Button>
                    )}

                    {/* DUPLICATE - For Locked/Issued Docs */}
                    {(isLocked || isVoid) && !isRecurring && (
                        <Button variant="secondary" onClick={handleDuplicateAsDraft}>
                            <Copy size={18} className="mr-2" /> Duplicar
                        </Button>
                    )}

                    {/* SAVE BUTTON - Always visible but behavior changes */}
                    <Button onClick={save} variant={isRecurring ? "primary" : "primary"}>
                        <Save size={18} className="mr-2" />
                        {isRecurring ? 'Guardar Plantilla' : 'Guardar'}
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8 relative">
                {isVoid && (
                    <div className="absolute top-0 left-0 right-0 z-10 flex justify-center pointer-events-none mt-10">
                        <div className="bg-red-100 text-red-800 border-2 border-red-300 px-6 py-2 rounded-full font-bold text-lg shadow-xl uppercase opacity-90 transform rotate-12">
                            ANULADA / VOID
                        </div>
                    </div>
                )}

                <div className={`max-w-5xl mx-auto space-y-6 ${isVoid ? 'opacity-80' : ''}`}>
                    {/* Header Card */}
                    <Card className={`p-6 grid grid-cols-1 md:grid-cols-3 gap-6 ${isRecurring ? 'border-purple-200 ring-2 ring-purple-50' : ''}`}>

                        {/* LEFT COLUMN: IDENTIFIERS */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                                {isRecurring ? 'Configuración Recurrente' : 'Detalles'}
                            </h3>

                            {isRecurring ? (
                                <>
                                    <Input
                                        label="Nombre del Modelo"
                                        placeholder="Ej: Mantenimiento Mensual"
                                        value={rec.name}
                                        onChange={(e: any) => setRec({ ...rec, name: e.target.value })}
                                        required
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <Select label="Periodicidad" value={rec.frequency} onChange={(e: any) => setRec({ ...rec, frequency: e.target.value })}>
                                            <option value="weekly">Semanal</option>
                                            <option value="monthly">Mensual</option>
                                            <option value="quarterly">Trimestral</option>
                                            <option value="annual">Anual</option>
                                        </Select>
                                        <Input
                                            type="date"
                                            label="Próxima Ejecución (Día de generación)"
                                            value={nextRunDateVal}
                                            onChange={(e: any) => setRec({ ...rec, nextRun: e.target.value })}
                                        />
                                    </div>
                                    <div className="text-[10px] text-gray-500 italic">
                                        {getScheduleDescription()}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-end space-x-2">
                                        <div className="flex-1">
                                            <Input
                                                label="Número"
                                                value={doc.number}
                                                onChange={(e: any) => setDoc({ ...doc, number: e.target.value })}
                                                disabled={true} // Always locked, auto-assigned on issue or manual override via separate mechanism if needed
                                                className="bg-gray-100 text-gray-500 cursor-not-allowed font-mono"
                                            />
                                        </div>
                                        {/* Removed lock toggle for simplicity in strict mode. Number is assigned on issue. */}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input type="date" label="Fecha" value={doc.date} onChange={(e: any) => setDoc({ ...doc, date: e.target.value })} disabled={isLocked} />
                                        <Input
                                            type="date"
                                            label={type === 'invoice' ? 'Vencimiento *' : 'Validez (Opcional)'}
                                            value={doc.dueDate || ''}
                                            onChange={(e: any) => setDoc({ ...doc, dueDate: e.target.value })}
                                            disabled={isLocked}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* MIDDLE COLUMN: CLIENT */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                                {isRecurring ? 'Cliente (Opcional)' : 'Cliente'}
                            </h3>
                            <Select label="Seleccionar Cliente" value={doc.contactId || ''} onChange={(e: any) => setDoc({ ...doc, contactId: e.target.value })} disabled={isLocked}>
                                <option value="">{isRecurring ? '-- Ninguno (Sin asignar) --' : '-- Seleccionar --'}</option>
                                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                            {doc.contactId && (
                                <div className="text-sm text-gray-700 bg-[var(--accent-blue-soft)] border border-[var(--accent-blue-soft)] p-3 rounded-md">
                                    <div className="font-bold">{contacts.find(c => c.id === doc.contactId)?.name}</div>
                                    <div>{contacts.find(c => c.id === doc.contactId)?.nif}</div>
                                    <div className="text-xs text-gray-500 mt-1">{contacts.find(c => c.id === doc.contactId)?.email}</div>
                                </div>
                            )}
                            {!doc.contactId && isRecurring && (
                                <div className="text-xs text-gray-400 flex items-center bg-gray-50 p-2 rounded">
                                    <Info size={12} className="mr-1" /> Si no seleccionas cliente, se creará un borrador sin asignar.
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: CONFIG */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Configuración</h3>

                            <div>
                                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5 block">Plantilla Visual</label>
                                <div
                                    className={`flex items-center justify-between border rounded-lg p-2.5 bg-white transition-all group ${isLocked ? 'border-gray-200 opacity-75' : 'border-gray-300 cursor-pointer hover:border-opacity-40 hover:ring-2 hover:ring-[var(--accent-blue-soft)]'}`}
                                    onClick={() => !isLocked && setIsTemplatePickerOpen(true)}
                                >
                                    <div className="flex items-center overflow-hidden">
                                        <div className={`p-1.5 rounded mr-3 ${type === 'invoice' ? 'bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]' : 'bg-orange-100 text-orange-600'}`}>
                                            <Layout size={16} />
                                        </div>
                                        <div className="flex flex-col truncate">
                                            <span className="text-sm font-bold text-gray-800 truncate">{currentTemplate?.name || 'Seleccionar...'}</span>
                                        </div>
                                    </div>
                                    {!isLocked && <Button size="sm" variant="ghost" className="text-gray-400 group-hover:text-[var(--accent-blue)]">Cambiar</Button>}
                                </div>
                            </div>

                            {!isRecurring && (
                                <>
                                    <Select label="Estado (Manual)" value={doc.status} onChange={handleStatusChange} disabled={isDraft}>
                                        <option value="draft" disabled>Borrador (Emitir para cambiar)</option>
                                        <option value="sent">{type === 'invoice' ? 'Emitida' : 'Enviada'}</option>

                                        {type === 'invoice' && (
                                            <>
                                                <option value="paid">Pagada</option>
                                                <option value="overdue">Vencida</option>
                                                <option value="refunded">Abonada (Rectif.)</option>
                                            </>
                                        )}

                                        {type === 'quote' && (
                                            <>
                                                <option value="accepted">Aceptada</option>
                                                <option value="rejected">Rechazada</option>
                                                <option value="converted">Convertida</option>
                                                <option value="overdue">Vencido</option>
                                            </>
                                        )}

                                        <option value="void">Anulada</option>
                                    </Select>

                                    {type === 'invoice' && doc.status === 'paid' && !isVoid && (
                                        <Input
                                            type="date"
                                            label="Fecha de Pago"
                                            value={(doc as Invoice).paidDate || ''}
                                            onChange={(e: any) => setDoc({ ...doc, paidDate: e.target.value })}
                                            className="animate-in fade-in slide-in-from-top-2"
                                        />
                                    )}
                                </>
                            )}
                            {isRecurring && (
                                <div className={`p-3 rounded text-xs border ${rec.active ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-bold">Estado Automatización</span>
                                        <button
                                            onClick={() => setRec({ ...rec, active: !rec.active })}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border transition-colors ${rec.active ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-gray-300'}`}
                                        >
                                            {rec.active ? 'Activa' : 'Pausada'}
                                        </button>
                                    </div>
                                    <p>{rec.active ? `Este modelo generará ${type === 'invoice' ? 'facturas' : 'presupuestos'} en borrador automáticamente.` : 'La generación automática está detenida.'}</p>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Lines */}
                    <Card className="overflow-hidden border border-gray-200">
                        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex justify-between items-center">
                            <h3 className="font-bold text-gray-700">Conceptos</h3>
                            {!isLocked && (
                                <div className="flex space-x-2">
                                    <Button size="sm" variant="secondary" onClick={() => setIsCatalogPickerOpen(true)}><Package size={14} className="mr-2" /> Catálogo</Button>
                                    <Button size="sm" variant="primary" onClick={addLine}><Plus size={14} className="mr-1" /> Línea Vacía</Button>
                                </div>
                            )}
                        </div>
                        <div className="p-0">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-2 w-10 text-center">#</th>
                                        <th className="px-4 py-2">Descripción</th>
                                        <th className="px-4 py-2 w-20">Cant.</th>
                                        <th className="px-4 py-2 w-32">Precio</th>
                                        <th className="px-4 py-2 w-20">Desc%</th>
                                        <th className="px-4 py-2 w-24">IVA%</th>
                                        <th className="px-4 py-2 w-32 text-right">Total</th>
                                        <th className="px-4 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {doc.lines?.map((line, idx) => (
                                        <tr key={line.id} className="group hover:bg-gray-50">
                                            <td className="px-4 py-2 text-center text-gray-400 font-mono text-xs">{idx + 1}</td>
                                            <td className="px-4 py-2 relative">
                                                <input
                                                    className={tableInputClass}
                                                    placeholder="Descripción"
                                                    value={line.description}
                                                    onChange={e => updateLine(idx, 'description', e.target.value)}
                                                    list={`items-list-${idx}`}
                                                    disabled={isLocked}
                                                />
                                                <datalist id={`items-list-${idx}`}>
                                                    {items.map(i => <option key={i.id} value={i.name} />)}
                                                </datalist>
                                            </td>
                                            <td className="px-4 py-2">
                                                <input type="number" className={`${tableInputClass} text-right`} value={line.quantity} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value))} disabled={isLocked} />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input type="number" className={`${tableInputClass} text-right`} value={line.price} onChange={e => updateLine(idx, 'price', parseFloat(e.target.value))} disabled={isLocked} />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input type="number" className={`${tableInputClass} text-right text-gray-600`} value={line.discountPct} onChange={e => updateLine(idx, 'discountPct', parseFloat(e.target.value))} disabled={isLocked} />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input type="number" className={`${tableInputClass} text-right`} value={line.vatPct} onChange={e => updateLine(idx, 'vatPct', parseFloat(e.target.value))} disabled={isLocked} />
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono font-medium text-gray-800 pt-3">
                                                {(line.quantity * line.price * (1 - (line.discountPct || 0) / 100)).toFixed(2)}€
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                {!isLocked && <button onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"><Trash2 size={16} /></button>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {(!doc.lines || doc.lines.length === 0) && <div className="p-8 text-center text-gray-400 italic bg-gray-50/50">Añade conceptos a la factura para comenzar.</div>}
                        </div>
                    </Card>

                    {/* Totals & Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                                    {isRecurring ? 'Notas (Se copiarán al documento)' : 'Notas Públicas'}
                                </label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-lg p-3 text-sm h-32 bg-white text-gray-900 focus:ring-4 focus:ring-[var(--accent-blue-soft)] focus:border-[var(--accent-blue)] outline-none resize-none shadow-sm disabled:bg-gray-100"
                                    placeholder="Condiciones de pago, notas de agradecimiento..."
                                    value={doc.notes}
                                    onChange={e => setDoc({ ...doc, notes: e.target.value })}
                                    disabled={isLocked && !isVoid} // Allow editing in void state for context, otherwise locked
                                />
                            </div>

                            {!isRecurring && (
                                <div className="space-y-2 border-t pt-4">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center">
                                        <EyeOff size={12} className="mr-1" /> Notas Internas (No visibles para cliente)
                                    </label>
                                    <textarea
                                        className="w-full border border-gray-200 rounded-lg p-3 text-sm h-20 bg-yellow-50 text-gray-700 focus:ring-4 focus:ring-yellow-100 focus:border-yellow-400 outline-none resize-none shadow-inner"
                                        placeholder="Apuntes privados sobre este documento..."
                                        value={doc.internalNotes || ''}
                                        onChange={e => setDoc({ ...doc, internalNotes: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>

                        <Card className="p-6 bg-white border-gray-200">
                            <div className="space-y-3 text-sm">
                                {taxBreakdown.length > 0 && (
                                    <div className="mb-4 pb-4 border-b border-dashed border-gray-200">
                                        <div className="text-xs font-bold text-gray-400 uppercase mb-2">Desglose Impuestos</div>
                                        {taxBreakdown.map(t => (
                                            <div key={t.rate} className="flex justify-between text-xs text-gray-500 mb-1">
                                                <span>{t.rate}% IVA sobre {t.base.toFixed(2)}€</span>
                                                <span>{t.vat.toFixed(2)} €</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex justify-between items-center text-gray-600">
                                    <span>Base Imponible</span>
                                    <span className="font-mono text-gray-900">{doc.baseTotal?.toFixed(2)} €</span>
                                </div>
                                <div className="flex justify-between items-center text-gray-600">
                                    <span>IVA Total</span>
                                    <span className="font-mono text-gray-900">{doc.vatTotal?.toFixed(2)} €</span>
                                </div>
                                {doc.retentionTotal > 0 && (
                                    <div className="flex justify-between items-center text-red-600 bg-red-50 px-2 py-1 rounded">
                                        <span>Retención IRPF</span>
                                        <span className="font-mono">-{doc.retentionTotal?.toFixed(2)} €</span>
                                    </div>
                                )}
                                <div className="border-t border-gray-200 pt-4 mt-2 flex justify-between items-center">
                                    <span className="font-bold text-lg text-gray-800">TOTAL ESTIMADO</span>
                                    <span className="font-bold text-2xl text-[var(--accent-blue)]">{doc.grandTotal?.toFixed(2)} €</span>
                                </div>

                                {/* PAID AMOUNT IF PARTIAL */}
                                {type === 'invoice' && !isDraft && (doc.paidAmount || 0) > 0 && (
                                    <div className="mt-2 pt-2 border-t border-dashed border-gray-200">
                                        <div className="flex justify-between items-center text-green-700 font-medium">
                                            <span>Pagado</span>
                                            <span>{doc.paidAmount?.toFixed(2)} €</span>
                                        </div>
                                        <div className="flex justify-between items-center text-gray-500 text-xs mt-1">
                                            <span>Pendiente</span>
                                            <span>{(doc.grandTotal - (doc.paidAmount || 0)).toFixed(2)} €</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            <TemplatePickerModal
                isOpen={isTemplatePickerOpen}
                onClose={() => setIsTemplatePickerOpen(false)}
                templates={templates}
                currentId={doc.templateId}
                onSelect={(id: string) => setDoc({ ...doc, templateId: id })}
            />

            <CatalogPickerModal
                isOpen={isCatalogPickerOpen}
                onClose={() => setIsCatalogPickerOpen(false)}
                items={items}
                onSelect={addFromCatalog}
            />

            {/* CONVERSION MODAL */}
            <Modal isOpen={isConvertModalOpen} onClose={() => setIsConvertModalOpen(false)} title="Convertir a Factura">
                <div className="space-y-4">
                    <div className="bg-[var(--accent-blue-soft)] border border-opacity-20 text-[var(--accent-blue)] p-4 rounded-lg flex items-start space-x-3">
                        <FileText size={24} className="mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                            <p className="font-bold mb-1">Se generará una nueva factura en Borrador.</p>
                            <p>Los datos del cliente, líneas, precios e impuestos se copiarán. El presupuesto se marcará como "Convertido".</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">Selecciona la plantilla de diseño para la factura:</label>
                        <Select value={selectedConvertTemplateId} onChange={(e: any) => setSelectedConvertTemplateId(e.target.value)}>
                            {invoiceTemplates.map(t => (
                                <option key={t.id} value={t.id}>{t.name} {t.isDefault ? '(Por defecto)' : ''}</option>
                            ))}
                        </Select>
                    </div>

                    <div className="pt-4 flex justify-end space-x-2">
                        <Button variant="ghost" onClick={() => setIsConvertModalOpen(false)}>Cancelar</Button>
                        <Button variant="success" onClick={processConversion}>Confirmar y Crear Factura</Button>
                    </div>
                </div>
            </Modal>

            {/* PAYMENT MODAL */}
            {type === 'invoice' && (
                <PaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    doc={doc as Invoice}
                    onSave={handleRegisterPayment}
                />
            )}

            {/* PREVIEW MODAL */}
            <DocumentPreviewModal
                isOpen={isPreviewModalOpen}
                onClose={() => setIsPreviewModalOpen(false)}
                doc={doc}
                client={contacts.find(c => c.id === doc.contactId)}
                settings={settings?.[0]}
                template={currentTemplate}
            />
        </div>
    );
};

export const DocumentsPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const params = useParams();
    const type = location.pathname.includes('invoice') ? 'invoice' : 'quote';

    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<'list' | 'recurring'>('list');

    // Editor State
    const [editor, setEditor] = useState<{ open: boolean; id?: string; data?: any; recurring?: boolean }>({
        open: !!params.id,
        id: params.id
    });

    // Synchronize editor state with URL params
    useEffect(() => {
        if (params.id) {
            setEditor(prev => ({ ...prev, open: true, id: params.id }));
        } else if (!location.state?.createWithItems) {
            setEditor(prev => ({ ...prev, open: false, id: undefined }));
        }
    }, [params.id, location.state]);

    // Handle incoming navigation state (e.g. from Items page)
    useEffect(() => {
        if (location.state?.createWithItems) {
            setEditor({ open: true, data: { lines: location.state.createWithItems } });
            navigate(location.pathname, { replace: true });
        } else if (location.state?.openId) {
            setEditor({ open: true, id: location.state.openId });
            navigate(location.pathname, { replace: true });
        }
    }, [location.state, location.pathname, navigate]);

    // Data
    const docs = useQuery(async () => {
        return type === 'invoice' ? invoicesApi.all() : quotesApi.all();
    }, [type], ['invoices', 'quotes']) || [];

    const recurring = useQuery(async () => {
        return type === 'invoice' ? recurringInvoicesApi.all() : recurringQuotesApi.all();
    }, [type], ['recurring_invoices', 'recurring_quotes']) || [];

    const contacts = useQuery(() => contactsApi.all(), [], ['contacts']) || [];

    // Filter
    const filteredDocs = docs.filter(d => {
        const client = contacts.find(c => c.id === d.contactId);
        const term = search.toLowerCase();
        return d.number.toLowerCase().includes(term) ||
            client?.name.toLowerCase().includes(term) ||
            d.grandTotal.toString().includes(term);
    });

    const filteredRecurring = recurring.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

    const handleDelete = async (id: string, isRec: boolean) => {
        if (!confirm('¿Eliminar?')) return;
        if (isRec) {
            if (type === 'invoice') await recurringInvoicesApi.delete(id);
            else await recurringQuotesApi.delete(id);
        } else {
            if (type === 'invoice') await invoicesApi.delete(id);
            else await quotesApi.delete(id);
        }
        notify('Eliminado correctamente', 'success');
    };

    const handleRunRecurring = async (id: string) => {
        await manualRunRecurring(type, id);
        notify('Generado borrador desde plantilla', 'success');
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 capitalize">{type === 'invoice' ? 'Facturas' : 'Presupuestos'}</h1>
                    <p className="text-gray-500">Gestión de {type === 'invoice' ? 'facturación' : 'presupuestos'}</p>
                </div>
                <div className="flex space-x-2">
                    <div className="flex bg-gray-200 rounded-lg p-1">
                        <button onClick={() => setTab('list')} className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all ${tab === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Listado</button>
                        <button onClick={() => setTab('recurring')} className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all ${tab === 'recurring' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Recurrentes</button>
                    </div>
                    <Button onClick={() => setEditor({ open: true, recurring: tab === 'recurring' })}><Plus size={18} className="mr-2" /> Nuevo</Button>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-blue)] outline-none"
                    placeholder={tab === 'list' ? "Buscar por número, cliente o importe..." : "Buscar plantilla..."}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {tab === 'list' ? (
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b">
                            <tr>
                                <th className="px-6 py-3">Número</th>
                                <th className="px-6 py-3">Fecha</th>
                                <th className="px-6 py-3">Cliente</th>
                                <th className="px-6 py-3 text-center">Estado</th>
                                <th className="px-6 py-3 text-right">Total</th>
                                <th className="px-6 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {filteredDocs.map(d => {
                                const client = contacts.find(c => c.id === d.contactId);
                                return (
                                    <tr
                                        key={d.id}
                                        className="hover:bg-[var(--accent-blue-soft)]/50 group cursor-pointer transition-colors"
                                        onClick={() => navigate(`/${type}s/${d.id}`)}
                                    >
                                        <td className="px-6 py-3 font-mono text-[var(--accent-blue)] font-medium">{d.number}</td>
                                        <td className="px-6 py-3 text-gray-500">{new Date(d.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-3 font-medium">{client?.name || <span className="text-gray-300 italic">Sin asignar</span>}</td>
                                        <td className="px-6 py-3 text-center">
                                            <Badge color={
                                                d.status === 'draft' ? 'gray' :
                                                    d.status === 'paid' || d.status === 'accepted' ? 'green' :
                                                        d.status === 'sent' ? 'blue' :
                                                            'red'
                                            }>
                                                {d.status === 'draft' ? 'Borrador' :
                                                    d.status === 'sent' ? 'Pendiente' :
                                                        d.status === 'paid' ? 'Pagado' :
                                                            d.status === 'accepted' ? 'Aceptado' :
                                                                d.status === 'overdue' ? 'Vencido' :
                                                                    d.status === 'void' ? 'Anulado' :
                                                                        d.status}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-3 text-right font-bold">{d.grandTotal.toFixed(2)} €</td>
                                        <td className="px-6 py-3 text-right" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => navigate(`/${type}s/${d.id}`)} className="text-[var(--accent-blue)] hover:text-[var(--accent-blue)] mr-2"><Edit3 size={16} /></button>
                                            <button onClick={() => handleDelete(d.id, false)} className="text-gray-300 hover:text-red-600"><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredDocs.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">No hay documentos que mostrar.</td></tr>
                            )}
                        </tbody>
                    </table>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase border-b">
                            <tr>
                                <th className="px-6 py-3">Nombre Plantilla</th>
                                <th className="px-6 py-3">Frecuencia</th>
                                <th className="px-6 py-3">Próx. Ejecución</th>
                                <th className="px-6 py-3 text-center">Estado</th>
                                <th className="px-6 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {filteredRecurring.map(r => (
                                <tr key={r.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 font-bold text-gray-800">{r.name}</td>
                                    <td className="px-6 py-3 capitalize">{r.frequency}</td>
                                    <td className="px-6 py-3 text-gray-500">{new Date(r.nextRun).toLocaleDateString()}</td>
                                    <td className="px-6 py-3 text-center">
                                        <Badge color={r.active ? 'purple' : 'gray'}>{r.active ? 'Activa' : 'Pausada'}</Badge>
                                    </td>
                                    <td className="px-6 py-3 text-right flex justify-end space-x-2">
                                        <button onClick={() => handleRunRecurring(r.id)} className="text-green-600 hover:bg-green-50 p-1 rounded" title="Ejecutar Ahora"><Play size={16} /></button>
                                        <button onClick={() => setEditor({ open: true, id: r.id, recurring: true })} className="text-[var(--accent-blue)] hover:bg-[var(--accent-blue-soft)] p-1 rounded"><Edit3 size={16} /></button>
                                        <button onClick={() => handleDelete(r.id, true)} className="text-red-400 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                            {filteredRecurring.length === 0 && (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-400">No hay plantillas recurrentes.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {editor.open && (
                <DocumentEditor
                    type={type}
                    initialId={editor.id}
                    initialData={editor.data}
                    isRecurringMode={editor.recurring}
                    onClose={() => {
                        setEditor({ open: false });
                        navigate(`/${type}s`);
                    }}
                />
            )}
        </div>
    );
}

export default DocumentsPage;

