

import React, { useState, useEffect } from 'react';
import { useQuery } from '@/core/db-adapter/useQuery';
import { templatesApi as tplApi, settingsApi } from '@/core/adapter-api';
import { DocumentTemplate, Invoice, Contact, TemplateBlockType, TemplateBlock } from '../types';
import { Button, Input, Card, Badge, Select, notify } from '../components/UI';
import { Plus, Trash2, Edit3, FileText, Copy, Save, X, Check, Tag, Eye, Layout, Type, ArrowUp, ArrowDown, GripVertical, Minus, Scissors, AlignLeft, AlignCenter, AlignRight, Bold, Image as ImageIcon, Move, Repeat, Anchor, Code, Braces } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DocumentHTMLPreview } from '../components/DocumentHTMLPreview';

// --- DUMMY DATA FOR PREVIEW ---
const DUMMY_CLIENT: Contact = {
    id: 'demo-client',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    type: 'client',
    name: 'Empresa Demo S.L.',
    nif: 'B-12345678',
    email: 'contacto@empresademo.com',
    phone: '91 123 45 67',
    address: 'Calle Industria 44, 1º',
    city: 'Madrid',
    zip: '28001',
    province: 'Madrid',
    country: 'España',
    notes: ''
};

const DUMMY_DOC: Invoice = {
    id: 'demo-doc',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    number: 'FAC-2025-001',
    contactId: 'demo-client',
    date: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000 * 30).toISOString(),
    status: 'sent',
    notes: 'Estas son notas de ejemplo que aparecerán en el documento según la configuración elegida.',
    lines: [
        { id: 'l1', description: 'Servicio de Consultoría', quantity: 1, price: 500, vatPct: 21, discountPct: 0, retentionPct: 0, unit: 'proyecto' },
        { id: 'l2', description: 'Licencia Software Anual', quantity: 2, price: 120, vatPct: 21, discountPct: 10, retentionPct: 0, unit: 'licencia' },
        { id: 'l3', description: 'Mantenimiento Mensual', quantity: 1, price: 50, vatPct: 21, discountPct: 0, retentionPct: 15, unit: 'mes' }
    ],
    baseTotal: 766,
    vatTotal: 160.86,
    retentionTotal: 7.5,
    grandTotal: 919.36,
    paidAmount: 0
};

// --- UTILS ---
const normalizeLayout = (layout: any[]): TemplateBlock[] => {
    if (!layout) return [];
    return layout.map(item => {
        if (typeof item === 'string') {
            return { id: uuidv4(), type: item as TemplateBlockType };
        }
        return item;
    });
};

// --- TEMPLATE EDITOR COMPONENT ---
const TemplateEditor = ({ isOpen, onClose, onSave, initialData, type }: { isOpen: boolean, onClose: () => void, onSave: (data: Partial<DocumentTemplate>) => void, initialData?: DocumentTemplate | null, type: 'invoice' | 'quote' }) => {
    const settings = useQuery(() => settingsApi.get(), [], ['settings']);
    const [activeTab, setActiveTab] = useState<'design' | 'code' | 'variables'>('design');
    const [tagsInput, setTagsInput] = useState('');
    const [jsonError, setJsonError] = useState('');

    // Standard Blocks Definition
    const STANDARD_BLOCKS: { id: TemplateBlockType; label: string }[] = [
        { id: 'header', label: 'Cabecera (Logo/Empresa)' },
        { id: 'client', label: 'Datos del Cliente' },
        { id: 'lines', label: 'Líneas (Tabla)' },
        { id: 'totals', label: 'Totales e Impuestos' },
        { id: 'footer', label: 'Pie (Notas/Banco)' }
    ];

    const [template, setTemplate] = useState<Partial<DocumentTemplate>>({
        name: '', type, isDefault: false, defaultVat: 21, defaultNotes: '', tags: [],
        config: {
            layout: [],
            design: {
                primaryColor: '#2563eb', secondaryColor: '#1e40af', font: 'helvetica',
                headerStyle: 'classic', fontSizeBase: 10, textColor: '#1f2937',
                logoSize: 'M', headerAlignment: 'left',
                background: { mode: 'cover', opacity: 0.1, scale: 100 }
            },
            header: { showLogo: true, showCompanyDetails: true, slogan: '' },
            client: { label: type === 'invoice' ? 'Facturar a:' : 'Presupuesto para:', showVat: true, showAddress: true, showEmail: false },
            columns: { quantity: true, unit: false, price: true, vat: true, discount: true, total: true },
            totals: { showSubtotal: true, showVatBreakdown: true, showTotal: true, labels: { subtotal: 'Base Imponible', vat: 'IVA', total: 'TOTAL' } },
            footer: { showBankDetails: true, thanksMessage: 'Gracias por su confianza.', showSignature: false, showLegalTerms: true, terms: '' }
        }
    });

    // JSON Editor State
    const [jsonCode, setJsonCode] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                const merged = {
                    ...initialData,
                    config: {
                        ...initialData.config,
                        layout: normalizeLayout(initialData.config.layout || ['header', 'client', 'lines', 'totals', 'footer']),
                        design: {
                            ...initialData.config.design,
                            background: initialData.config.design.background || { mode: 'cover', opacity: 0.1, scale: 100 }
                        }
                    }
                };
                setTemplate(JSON.parse(JSON.stringify(merged)));
                setTagsInput((merged.tags || []).join(', '));
                setJsonCode(JSON.stringify(merged.config, null, 2));
            } else {
                const newTpl = {
                    id: uuidv4(),
                    name: '',
                    type,
                    isDefault: false,
                    defaultVat: 21,
                    defaultNotes: '',
                    tags: [],
                    config: {
                        layout: normalizeLayout(['header', 'client', 'lines', 'totals', 'footer']),
                        design: {
                            primaryColor: '#2563eb', secondaryColor: '#1e40af', font: 'helvetica',
                            headerStyle: 'classic', fontSizeBase: 10, textColor: '#1f2937',
                            logoSize: 'M', headerAlignment: 'left',
                            background: { mode: 'cover', opacity: 0.1, scale: 100 }
                        },
                        header: { showLogo: true, showCompanyDetails: true, slogan: '' },
                        client: { label: type === 'invoice' ? 'Facturar a:' : 'Presupuesto para:', showVat: true, showAddress: true, showEmail: false },
                        columns: { quantity: true, unit: true, price: true, vat: true, discount: true, total: true },
                        totals: { showSubtotal: true, showVatBreakdown: true, showTotal: true, labels: { subtotal: 'Base Imponible', vat: 'IVA', total: 'TOTAL' } },
                        footer: { showBankDetails: true, thanksMessage: 'Gracias por su confianza.', showSignature: false, showLegalTerms: true, terms: '' }
                    }
                };
                setTemplate(newTpl as any);
                setTagsInput('');
                setJsonCode(JSON.stringify(newTpl.config, null, 2));
            }
        }
    }, [isOpen, initialData, type]);

    // Sync JSON Code when switching tabs or modifying design
    useEffect(() => {
        if (activeTab === 'design') {
            setJsonCode(JSON.stringify(template.config, null, 2));
        }
    }, [template.config, activeTab]);

    const updateConfig = (section: string, key: string, value: any) => {
        setTemplate(prev => ({
            ...prev,
            config: {
                ...prev.config!,
                [section]: {
                    ...prev.config![section as keyof typeof prev.config],
                    [key]: value
                }
            }
        }));
    };

    const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const code = e.target.value;
        setJsonCode(code);
        try {
            const parsed = JSON.parse(code);
            setTemplate(prev => ({ ...prev, config: parsed }));
            setJsonError('');
        } catch (err) {
            setJsonError((err as Error).message);
        }
    };

    const handleSaveInternal = () => {
        const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        onSave({ ...template, tags });
    };

    // --- BACKGROUND UTILS ---
    const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    setTemplate(prev => ({
                        ...prev,
                        config: {
                            ...prev.config!,
                            design: { ...prev.config!.design, background: { ...prev.config!.design.background!, image: ev.target!.result as string } }
                        }
                    }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const updateBackground = (key: string, value: any) => {
        setTemplate(prev => ({
            ...prev,
            config: {
                ...prev.config!,
                design: { ...prev.config!.design, background: { ...prev.config!.design.background!, [key]: value } }
            }
        }));
    };

    // --- BLOCK MANIPULATION ---
    const addBlock = (type: TemplateBlockType) => {
        const newBlock: TemplateBlock = {
            id: uuidv4(),
            type,
            content: type === 'text' ? 'Nuevo Título' : undefined,
            positioning: 'relative',
            coords: { x: 20, y: 20, w: 100 },
            styles: type === 'text' ? { fontSize: 'lg', bold: true, color: 'primary', align: 'left' }
                : type === 'separator' ? { height: 'md', line: false }
                    : undefined
        };
        setTemplate(prev => ({
            ...prev,
            config: { ...prev.config!, layout: [...prev.config!.layout, newBlock] }
        }));
    };

    const removeBlock = (index: number) => {
        const newLayout = [...(template.config?.layout || [])];
        newLayout.splice(index, 1);
        setTemplate(prev => ({ ...prev, config: { ...prev.config!, layout: newLayout } }));
    };

    const moveBlock = (index: number, direction: 'up' | 'down') => {
        const newLayout = [...(template.config?.layout || [])];
        if (direction === 'up' && index > 0) {
            [newLayout[index - 1], newLayout[index]] = [newLayout[index], newLayout[index - 1]];
        } else if (direction === 'down' && index < newLayout.length - 1) {
            [newLayout[index + 1], newLayout[index]] = [newLayout[index], newLayout[index + 1]];
        }
        setTemplate(prev => ({ ...prev, config: { ...prev.config!, layout: newLayout } }));
    };

    const updateBlock = (index: number, updates: Partial<TemplateBlock>) => {
        const newLayout = [...(template.config?.layout || [])] as TemplateBlock[];
        newLayout[index] = { ...newLayout[index], ...updates };
        setTemplate(prev => ({ ...prev, config: { ...prev.config!, layout: newLayout } }));
    };

    const updateBlockStyle = (index: number, styleKey: string, value: any) => {
        const newLayout = [...(template.config?.layout || [])] as TemplateBlock[];
        newLayout[index] = {
            ...newLayout[index],
            styles: { ...(newLayout[index].styles || {}), [styleKey]: value }
        };
        setTemplate(prev => ({ ...prev, config: { ...prev.config!, layout: newLayout } }));
    };

    if (!isOpen || !template.config) return null;
    const config = template.config;
    const layout = config.layout as TemplateBlock[];

    return (
        <div className="fixed inset-0 bg-gray-600/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
                {/* HEADER */}
                <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center">
                        <Edit3 size={18} className="mr-2 text-[var(--accent-blue)]" />
                        Editor de Plantilla: {type === 'invoice' ? 'Factura' : 'Presupuesto'}
                    </h2>
                    <div className="flex space-x-2">
                        <Button variant="ghost" onClick={onClose} size="sm">Cancelar</Button>
                        <Button onClick={handleSaveInternal} size="sm"><Save size={16} className="mr-1" /> Guardar</Button>
                    </div>
                </div>

                {/* BODY - 2 COLUMNS */}
                <div className="flex-1 flex overflow-hidden">

                    {/* LEFT PANEL: CONFIG EDITOR */}
                    <div className="w-1/3 min-w-[350px] max-w-[500px] flex flex-col border-r border-gray-200 bg-gray-50">
                        {/* TABS */}
                        <div className="flex border-b bg-white">
                            <button
                                onClick={() => setActiveTab('design')}
                                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex justify-center items-center ${activeTab === 'design' ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                <Layout size={16} className="mr-2" /> Diseño
                            </button>
                            <button
                                onClick={() => setActiveTab('code')}
                                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex justify-center items-center ${activeTab === 'code' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                <Code size={16} className="mr-2" /> JSON/HTML
                            </button>
                            <button
                                onClick={() => setActiveTab('variables')}
                                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex justify-center items-center ${activeTab === 'variables' ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                <Braces size={16} className="mr-2" /> Variables
                            </button>
                        </div>

                        {/* TAB CONTENT */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">

                            {/* TAB: DESIGN */}
                            {activeTab === 'design' && (
                                <>
                                    <Card className="p-4 space-y-3">
                                        <h3 className="font-bold text-gray-700 text-sm border-b pb-1">Datos Básicos</h3>
                                        <Input label="Nombre" value={template.name} onChange={(e: any) => setTemplate({ ...template, name: e.target.value })} className="text-sm" />
                                        <div className="flex items-center space-x-2">
                                            <input type="checkbox" checked={template.isDefault} onChange={e => setTemplate({ ...template, isDefault: e.target.checked })} className="rounded text-[var(--accent-blue)]" />
                                            <span className="text-xs font-medium">Predeterminada</span>
                                        </div>
                                    </Card>

                                    <Card className="p-4 space-y-3">
                                        <div className="flex justify-between items-center border-b pb-2 mb-2">
                                            <h3 className="font-bold text-gray-700 text-sm">Bloques y Estructura</h3>
                                            <div className="flex space-x-1">
                                                <button onClick={() => addBlock('text')} className="p-1 bg-gray-100 hover:bg-[var(--accent-blue-soft)] rounded text-gray-600" title="Texto"><Type size={14} /></button>
                                                <button onClick={() => addBlock('separator')} className="p-1 bg-gray-100 hover:bg-[var(--accent-blue-soft)] rounded text-gray-600" title="Separador"><Minus size={14} /></button>
                                                <button onClick={() => addBlock('pagebreak')} className="p-1 bg-gray-100 hover:bg-[var(--accent-blue-soft)] rounded text-gray-600" title="Salto Pág"><Scissors size={14} /></button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            {layout.map((block, index) => {
                                                const label = STANDARD_BLOCKS.find(b => b.id === block.type)?.label || (block.type === 'text' ? 'Texto' : block.type === 'separator' ? 'Separador' : 'Salto Pág');
                                                return (
                                                    <div key={block.id} className="bg-white border rounded p-2 text-sm shadow-sm">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center">
                                                                {block.positioning === 'absolute' ? <Anchor size={12} className="mr-2 text-purple-500" /> : <GripVertical size={12} className="mr-2 text-gray-400" />}
                                                                <span className="font-medium">{label}</span>
                                                            </div>
                                                            <div className="flex space-x-1">
                                                                <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"><ArrowUp size={12} /></button>
                                                                <button onClick={() => moveBlock(index, 'down')} disabled={index === layout.length - 1} className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"><ArrowDown size={12} /></button>
                                                                <button onClick={() => removeBlock(index)} className="ml-1 text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                                                            </div>
                                                        </div>

                                                        {block.type === 'text' && (
                                                            <div className="mt-2 pl-4 border-l-2 border-gray-100 space-y-2">
                                                                <input className="w-full text-xs border rounded p-1" value={block.content || ''} onChange={e => updateBlock(index, { content: e.target.value })} placeholder="Contenido..." />
                                                                <div className="flex gap-2 text-xs">
                                                                    <div className="flex bg-gray-50 rounded p-0.5">
                                                                        <button onClick={() => updateBlock(index, { positioning: 'relative' })} className={`px-1.5 rounded ${block.positioning !== 'absolute' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>Rel</button>
                                                                        <button onClick={() => updateBlock(index, { positioning: 'absolute' })} className={`px-1.5 rounded ${block.positioning === 'absolute' ? 'bg-white shadow text-purple-600' : 'text-gray-400'}`}>Abs</button>
                                                                    </div>
                                                                    <button onClick={() => updateBlockStyle(index, 'bold', !block.styles?.bold)} className={`px-1.5 rounded ${block.styles?.bold ? 'bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]' : 'bg-gray-50'}`}>B</button>
                                                                    <button onClick={() => updateBlockStyle(index, 'align', 'center')} className={`px-1.5 rounded ${block.styles?.align === 'center' ? 'bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]' : 'bg-gray-50'}`}>Ctr</button>
                                                                </div>
                                                                {block.positioning === 'absolute' && (
                                                                    <div className="flex gap-1">
                                                                        <input type="number" className="w-10 text-xs border rounded px-1" placeholder="X" value={block.coords?.x || 0} onChange={e => updateBlock(index, { coords: { ...(block.coords || { y: 0 }), x: parseFloat(e.target.value) } })} />
                                                                        <input type="number" className="w-10 text-xs border rounded px-1" placeholder="Y" value={block.coords?.y || 0} onChange={e => updateBlock(index, { coords: { ...(block.coords || { x: 0 }), y: parseFloat(e.target.value) } })} />
                                                                        <button onClick={() => updateBlock(index, { repeat: !block.repeat })} className={`px-1 text-[10px] border rounded ${block.repeat ? 'bg-[var(--accent-blue-soft)] border-opacity-20' : ''}`}>Repetir</button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </Card>

                                    <Card className="p-4 space-y-3">
                                        <h3 className="font-bold text-gray-700 text-sm border-b pb-1">Estilos Globales</h3>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Select label="Fuente" value={config.design.font} onChange={(e: any) => updateConfig('design', 'font', e.target.value)} className="text-sm">
                                                <option value="helvetica">Helvetica</option>
                                                <option value="times">Times</option>
                                                <option value="courier">Courier</option>
                                            </Select>
                                            <Input label="Tamaño Base" type="number" value={config.design.fontSizeBase || 10} onChange={(e: any) => updateConfig('design', 'fontSizeBase', parseInt(e.target.value))} className="text-sm" />
                                        </div>
                                        <div className="flex space-x-2">
                                            <input type="color" value={config.design.primaryColor} onChange={e => updateConfig('design', 'primaryColor', e.target.value)} className="h-8 w-8 cursor-pointer rounded border border-gray-300 p-0.5" title="Color Principal" />
                                            <input type="color" value={config.design.secondaryColor} onChange={e => updateConfig('design', 'secondaryColor', e.target.value)} className="h-8 w-8 cursor-pointer rounded border border-gray-300 p-0.5" title="Color Secundario" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Imagen Fondo</label>
                                            <input type="file" accept="image/*" onChange={handleBackgroundUpload} className="text-xs w-full" />
                                            {config.design.background?.image && (
                                                <div className="mt-2 space-y-2">
                                                    <div className="flex items-center space-x-2">
                                                        <Select value={config.design.background.mode || 'cover'} onChange={(e: any) => updateBackground('mode', e.target.value)} className="text-xs w-24">
                                                            <option value="cover">Cubrir</option>
                                                            <option value="contain">Ajustar</option>
                                                            <option value="stretch">Estirar</option>
                                                            <option value="custom">A medida</option>
                                                        </Select>
                                                        <div className="flex flex-col flex-1">
                                                            <label className="text-[10px] text-gray-400">Opacidad ({config.design.background.opacity})</label>
                                                            <input type="range" min="0" max="1" step="0.1" value={config.design.background.opacity} onChange={e => updateBackground('opacity', parseFloat(e.target.value))} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                                                        </div>
                                                        <button onClick={() => updateBackground('image', undefined)} className="text-red-500 p-1 hover:bg-red-50 rounded"><X size={14} /></button>
                                                    </div>

                                                    {config.design.background.mode === 'custom' && (
                                                        <div className="flex flex-col space-y-1 bg-white p-2 rounded border border-gray-100">
                                                            <div className="flex justify-between items-center text-[10px]">
                                                                <span className="font-bold text-gray-500">Tamaño fondo (%)</span>
                                                                <span className="text-[var(--accent-blue)] font-mono">{config.design.background.scale || 100}%</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="10"
                                                                max="200"
                                                                step="5"
                                                                value={config.design.background.scale || 100}
                                                                onChange={e => updateBackground('scale', parseInt(e.target.value))}
                                                                className="w-full h-1 bg-[var(--accent-blue-soft)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-blue)]"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </Card>
                                </>
                            )}

                            {/* TAB: CODE (JSON) */}
                            {activeTab === 'code' && (
                                <div className="h-full flex flex-col">
                                    <div className="bg-gray-800 text-gray-300 p-2 text-xs font-mono rounded-t-lg flex justify-between">
                                        <span>template.config.json</span>
                                        {jsonError && <span className="text-red-400">{jsonError}</span>}
                                    </div>
                                    <textarea
                                        className="w-full flex-1 bg-gray-900 text-green-400 font-mono text-xs p-3 outline-none resize-none rounded-b-lg border-none focus:ring-0"
                                        value={jsonCode}
                                        onChange={handleJsonChange}
                                        spellCheck={false}
                                    />
                                    <p className="text-[10px] text-gray-500 mt-2">Edita el JSON directamente para configuraciones avanzadas. Los cambios se reflejan en tiempo real.</p>
                                </div>
                            )}

                            {/* TAB: VARIABLES */}
                            {activeTab === 'variables' && (
                                <div className="space-y-4">
                                    <div className="bg-[var(--accent-blue-soft)] border border-opacity-20 p-3 rounded text-sm text-[var(--accent-blue)]">
                                        <p>Usa estas variables en los bloques de texto para insertar datos dinámicos.</p>
                                        <p className="font-mono text-xs mt-1">{'{{client.name}}'}</p>
                                    </div>

                                    {[
                                        { cat: 'Documento', vars: ['{{doc.number}}', '{{doc.date}}', '{{doc.dueDate}}', '{{doc.total}}'] },
                                        { cat: 'Cliente', vars: ['{{client.name}}', '{{client.nif}}', '{{client.address}}', '{{client.city}}', '{{client.email}}'] },
                                        { cat: 'Empresa', vars: ['{{company.name}}', '{{company.nif}}', '{{company.email}}', '{{company.website}}'] }
                                    ].map(g => (
                                        <div key={g.cat}>
                                            <h4 className="font-bold text-xs uppercase text-gray-500 mb-1">{g.cat}</h4>
                                            <div className="grid grid-cols-1 gap-1">
                                                {g.vars.map(v => (
                                                    <div key={v} className="flex justify-between items-center bg-white border px-2 py-1 rounded text-xs">
                                                        <code className="text-[var(--accent-blue)]">{v}</code>
                                                        <button
                                                            onClick={() => { navigator.clipboard.writeText(v); notify('Copiado'); }}
                                                            className="text-gray-400 hover:text-gray-600"
                                                        >
                                                            <Copy size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT PANEL: LIVE PREVIEW */}
                    <div className="flex-1 bg-gray-200 p-8 overflow-y-auto flex justify-center relative">
                        <div className="transform scale-[0.6] lg:scale-[0.7] origin-top shadow-2xl transition-all">
                            {settings && (
                                <DocumentHTMLPreview
                                    doc={DUMMY_DOC}
                                    client={DUMMY_CLIENT}
                                    settings={settings}
                                    template={template as DocumentTemplate}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const TemplatesPage = () => {
    const templates = useQuery(() => tplApi.all(), [], ['templates']) || [];
    const [view, setView] = useState<'invoice' | 'quote'>('invoice');
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);

    const filtered = templates.filter(t => t.type === view);

    const handleNew = () => {
        setEditingTemplate(null);
        setIsEditorOpen(true);
    };

    const handleEdit = (tpl: DocumentTemplate) => {
        setEditingTemplate(tpl);
        setIsEditorOpen(true);
    };

    const handleDuplicate = async (tpl: DocumentTemplate) => {
        const newTpl = {
            ...tpl,
            id: uuidv4(),
            name: `${tpl.name} (Copia)`,
            isDefault: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await tplApi.add({ ...tpl, id: uuidv4(), name: `${tpl.name} (Copia)`, isDefault: false });
        notify('Plantilla duplicada', 'success');
    };

    const handleDelete = async (id: string) => {
        if (confirm('¿Eliminar esta plantilla?')) {
            await tplApi.delete(id);
            notify('Plantilla eliminada', 'success');
        }
    };

    const handleSetDefault = async (tpl: DocumentTemplate) => {
        await tplApi.setDefault(tpl.type, tpl.id);
        notify(`Plantilla "${tpl.name}" establecida como predeterminada`, 'success');
    };

    const handleSave = async (data: Partial<DocumentTemplate>) => {
        try {
            if (editingTemplate) {
                await tplApi.update(editingTemplate.id, { ...data });
                notify('Plantilla actualizada', 'success');
            } else {
                await tplApi.add({
                    ...data,
                    id: uuidv4(),
                } as DocumentTemplate);
                notify('Plantilla creada', 'success');
            }
            if (data.isDefault) {
                if (data.type && data.id) {
                    await templatesApi.setDefault(data.type, data.id);
                }
            }
            setIsEditorOpen(false);
        } catch (e) {
            notify('Error al guardar plantilla', 'error');
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Plantillas de Documentos</h1>
                    <p className="text-gray-500">Diseña y personaliza el aspecto de tus facturas y presupuestos.</p>
                </div>
                <Button onClick={handleNew}><Plus size={18} /> Nueva Plantilla</Button>
            </div>

            <div className="flex space-x-4 border-b border-gray-200">
                <button
                    onClick={() => setView('invoice')}
                    className={`pb-2 px-4 font-medium text-sm transition-colors border-b-2 ${view === 'invoice' ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Facturas
                </button>
                <button
                    onClick={() => setView('quote')}
                    className={`pb-2 px-4 font-medium text-sm transition-colors border-b-2 ${view === 'quote' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Presupuestos
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map(tpl => (
                    <Card key={tpl.id} className={`p-0 overflow-hidden border-2 transition-all hover:shadow-lg group ${tpl.isDefault ? 'border-green-500' : 'border-transparent hover:border-gray-300'}`}>
                        <div className="h-32 bg-gray-100 relative flex items-center justify-center border-b border-gray-100">
                            <div className="w-24 h-32 bg-white shadow-sm transform scale-75 border border-gray-200 p-2 flex flex-col gap-1">
                                <div className="h-2 w-full bg-gray-200 rounded-sm"></div>
                                <div className="h-1 w-1/2 bg-gray-200 rounded-sm mb-2"></div>
                                <div className="flex-1 space-y-1">
                                    <div className="h-0.5 w-full bg-gray-100"></div>
                                    <div className="h-0.5 w-full bg-gray-100"></div>
                                    <div className="h-0.5 w-full bg-gray-100"></div>
                                </div>
                            </div>
                            {tpl.isDefault && (
                                <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center">
                                    <Check size={10} className="mr-1" /> PREDETERMINADA
                                </div>
                            )}
                        </div>
                        <div className="p-5">
                            <h3 className="font-bold text-gray-800 mb-1">{tpl.name}</h3>
                            <div className="flex flex-wrap gap-1 mb-4">
                                {(tpl.tags || []).map(tag => (
                                    <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">{tag}</span>
                                ))}
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                                <div className="flex space-x-1">
                                    <button onClick={() => handleEdit(tpl)} className="p-1.5 text-[var(--accent-blue)] hover:bg-[var(--accent-blue-soft)] rounded" title="Editar Diseño"><Edit3 size={16} /></button>
                                    <button onClick={() => handleDuplicate(tpl)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Duplicar"><Copy size={16} /></button>
                                </div>
                                <div className="flex space-x-1">
                                    {!tpl.isDefault && (
                                        <button onClick={() => handleSetDefault(tpl)} className="text-xs font-bold text-gray-400 hover:text-green-600 px-2 py-1 rounded hover:bg-green-50 transition-colors">
                                            Hacer Default
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(tpl.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}

                <button
                    onClick={handleNew}
                    className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-6 text-gray-400 hover:text-[var(--accent-blue)] hover:border-blue-400 hover:bg-[var(--accent-blue-soft)] transition-all group h-full min-h-[250px]"
                >
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3 group-hover:bg-[var(--accent-blue-soft)] transition-colors">
                        <Plus size={24} />
                    </div>
                    <span className="font-bold">Crear Nueva Plantilla</span>
                </button>
            </div>

            {isEditorOpen && (
                <TemplateEditor
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    onSave={handleSave}
                    initialData={editingTemplate}
                    type={view}
                />
            )}
        </div>
    );
};
