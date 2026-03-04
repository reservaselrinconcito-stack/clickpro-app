
import React, { useState, useEffect, useRef } from 'react';
import {
    Type,
    MousePointer2,
    Trash2,
    ArrowUp,
    ArrowDown,
    Plus,
    Save,
    X,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Square,
    Minus,
    Mail,
    GripVertical,
    Image as ImageIcon,
    ExternalLink,
    Search,
    Bold,
    Settings,
    Smartphone,
    Monitor,
    ChevronDown,
    HelpCircle,
    AlertTriangle,
    Eye,
    MessageSquare,
    Sparkles,
    Check,
    ArrowLeft
} from 'lucide-react';
import { Button, Card, Input, Select, notify } from '../../components/UI';
import { EmailTemplate, EmailTemplateBlock, EmailBlockType } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { generateEmailHtml } from '../services/emailRenderer';
import { EMAIL_VARIABLES } from '../config/emailVariables';
import { THEME_DEFAULTS } from '../config/emailThemes';

interface EmailTemplateEditorProps {
    template: Partial<EmailTemplate>;
    onSave: (data: Partial<EmailTemplate>) => void;
    onClose: () => void;
}

export const EmailTemplateEditor: React.FC<EmailTemplateEditorProps> = ({ template: initialTemplate, onSave, onClose }) => {
    const [template, setTemplate] = useState<Partial<EmailTemplate>>(initialTemplate);
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
    const [isSaving, setIsSaving] = useState(false);
    const [showRealPreview, setShowRealPreview] = useState(false);
    const [activeTab, setActiveTab] = useState<'email' | 'whatsapp'>('email');
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const blocks = template.blocks || [];

    // AUTO-SAVE DEBOUNCE
    useEffect(() => {
        setIsSaving(true);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(() => {
            // Generate final HTML before saving
            const finalHtml = generateEmailHtml(template as EmailTemplate, {
                cliente_nombre: '{{cliente_nombre}}',
                doc_numero: '{{doc_numero}}',
                doc_total: '{{doc_total}}',
                doc_fecha: '{{doc_fecha}}',
                doc_link: '{{doc_link}}',
                logo_url: '{{logo_url}}'
            });

            onSave({
                ...template,
                bodyHtml: finalHtml,
                updatedAt: Date.now()
            });
            setIsSaving(false);
        }, 800); // 800ms debounce

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [template, onSave]);

    const addBlock = (type: EmailBlockType) => {
        let newBlock: EmailTemplateBlock = {
            id: uuidv4(),
            type,
            styles: {}
        };

        switch (type) {
            case 'heading':
                newBlock = {
                    ...newBlock,
                    content: 'Asunto / Título',
                    styles: { align: 'left', fontSize: 22, bold: true, paddingY: 12, paddingX: 16 }
                };
                break;
            case 'text':
                newBlock = {
                    ...newBlock,
                    content: 'Escribe tu texto aquí...',
                    styles: { align: 'left', fontSize: 14, paddingY: 8, paddingX: 16 }
                };
                break;
            case 'button':
                newBlock = {
                    ...newBlock,
                    content: 'Ver documento',
                    href: '{{doc_link}}',
                    styles: { align: 'center', background: '#2563EB', color: '#FFFFFF', paddingY: 10, paddingX: 16 }
                };
                break;
            case 'divider':
                newBlock = {
                    ...newBlock,
                    styles: { paddingY: 12 }
                };
                break;
            case 'spacer':
                newBlock = {
                    ...newBlock,
                    styles: { paddingY: 16 }
                };
                break;
            case 'image':
                newBlock = {
                    ...newBlock,
                    href: '{{logo_url}}',
                    styles: { align: 'center', paddingY: 12 }
                };
                break;
        }

        setTemplate(prev => ({
            ...prev,
            blocks: [...(prev.blocks || []), newBlock]
        }));
        setActiveBlockId(newBlock.id);
    };

    const removeBlock = (id: string) => {
        setTemplate(prev => ({
            ...prev,
            blocks: (prev.blocks || []).filter(b => b.id !== id)
        }));
        if (activeBlockId === id) setActiveBlockId(null);
    };

    const updateBlock = (id: string, updates: Partial<EmailTemplateBlock>) => {
        setTemplate(prev => ({
            ...prev,
            blocks: (prev.blocks || []).map(b => b.id === id ? { ...b, ...updates } : b)
        }));
    };

    const updateBlockStyle = (id: string, styleKey: string, value: any) => {
        setTemplate(prev => ({
            ...prev,
            blocks: (prev.blocks || []).map(b => {
                if (b.id === id) {
                    return { ...b, styles: { ...(b.styles || {}), [styleKey]: value } };
                }
                return b;
            })
        }));
    };

    const insertVariable = (variable: string) => {
        if (!activeBlockId) return;

        setTemplate(prev => {
            const newBlocks = (prev.blocks || []).map(b => {
                if (b.id === activeBlockId) {
                    // Tenta encontrar o textarea focado no DOM para inserção inteligente
                    const activeEl = document.activeElement as HTMLTextAreaElement | HTMLInputElement;
                    const isOurTextarea = activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT');

                    if (isOurTextarea) {
                        const field = activeEl.getAttribute('name') as 'content' | 'href' || 'content';
                        const start = activeEl.selectionStart || 0;
                        const end = activeEl.selectionEnd || 0;
                        const currentVal = (b[field] as string) || '';
                        const newVal = currentVal.substring(0, start) + variable + currentVal.substring(end);

                        return { ...b, [field]: newVal };
                    } else {
                        // Si no hay foco, añadir al final del content
                        return { ...b, content: (b.content || '') + variable };
                    }
                }
                return b;
            });
            return { ...prev, blocks: newBlocks };
        });
    };

    // DRAG & DROP LOGIC
    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedBlockId(id);
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';

        // Custom drag ghost image/opactiy
        const target = e.currentTarget as HTMLElement;
        target.classList.add('opacity-50');
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setDraggedBlockId(null);
        setDragOverIndex(null);
        const target = e.currentTarget as HTMLElement;
        target.classList.remove('opacity-50');
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        if (draggedBlockId === null) return;

        const sourceIndex = blocks.findIndex(b => b.id === draggedBlockId);
        if (sourceIndex === -1 || sourceIndex === targetIndex) return;

        const newBlocks = [...blocks];
        const [removed] = newBlocks.splice(sourceIndex, 1);
        newBlocks.splice(targetIndex, 0, removed);

        setTemplate(prev => ({ ...prev, blocks: newBlocks }));
        setDraggedBlockId(null);
        setDragOverIndex(null);
    };

    const handleAutoGenerateWhatsApp = async () => {
        const { generateWhatsAppText } = await import('../services/whatsappRenderer');
        const generated = generateWhatsAppText(template as EmailTemplate, {
            cliente_nombre: '{{cliente_nombre}}',
            doc_numero: '{{doc_numero}}',
            doc_total: '{{doc_total}}',
            doc_fecha: '{{doc_fecha}}',
            doc_link: '{{doc_link}}',
            logo_url: '{{logo_url}}'
        });
        setTemplate(prev => ({ ...prev, whatsappText: generated }));
        notify('Texto generado correctamente', 'success');
    };

    const handleDuplicateBlock = (id: string) => {
        const block = blocks.find(b => b.id === id);
        if (!block) return;
        const newBlock = { ...block, id: uuidv4() };
        const index = blocks.findIndex(b => b.id === id);
        const newBlocks = [...blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        setTemplate(prev => ({ ...prev, blocks: newBlocks }));
    };

    const activeBlock = blocks.find(b => b.id === activeBlockId);

    // HELPERS FOR PREVIEW
    const getBlockStyles = (block: EmailTemplateBlock): React.CSSProperties => {
        const themeKey = template.theme || 'corporate';
        const theme = THEME_DEFAULTS[themeKey];
        const s = block.styles || {};

        const isHeading = block.type === 'heading';

        return {
            textAlign: s.align || 'left' as any,
            paddingTop: `${s.paddingY !== undefined ? s.paddingY : 10}px`,
            paddingBottom: `${s.paddingY !== undefined ? s.paddingY : 10}px`,
            paddingLeft: `${s.paddingX !== undefined ? s.paddingX : 20}px`,
            paddingRight: `${s.paddingX !== undefined ? s.paddingX : 20}px`,
            fontSize: `${s.fontSize || (isHeading ? theme.headingFontSize : 16)}px`,
            fontWeight: s.bold !== undefined ? (s.bold ? 'bold' : 'normal') : (isHeading ? (theme.headingBold ? 'bold' : 'normal') : 'normal'),
            color: s.color || theme.textColor,
            lineHeight: '1.5',
            transition: 'all 0.2s ease'
        };
    };

    const renderPreviewBlock = (block: EmailTemplateBlock) => {
        const baseStyle = getBlockStyles(block);

        switch (block.type) {
            case 'heading':
                return <div style={{ ...baseStyle, fontSize: `${block.styles?.fontSize || 22}px`, color: block.styles?.color || '#1e293b' }}>{block.content || 'Título'}</div>;
            case 'text':
                return <div style={baseStyle}>{block.content || 'Escribe contenido...'}</div>;
            case 'button':
                const themeKey = template.theme || 'corporate';
                const theme = THEME_DEFAULTS[themeKey];
                const hasLink = !!block.href;

                return (
                    <div style={{ textAlign: block.styles?.align || 'center', padding: `${block.styles?.paddingY !== undefined ? block.styles.paddingY : 10}px 0` }}>
                        {!hasLink && activeBlockId === block.id && (
                            <div className="flex items-center justify-center space-x-2 mb-2 text-[10px] font-bold text-amber-600 bg-amber-50 py-1 px-3 rounded-full border border-amber-100 animate-pulse">
                                <AlertTriangle size={12} />
                                <span>Falta el enlace del botón</span>
                            </div>
                        )}
                        <a
                            href="#"
                            onClick={(e) => e.preventDefault()}
                            style={{
                                display: 'inline-block',
                                padding: `${block.styles?.paddingY !== undefined ? block.styles.paddingY : 12}px ${block.styles?.paddingX !== undefined ? block.styles.paddingX : 24}px`,
                                backgroundColor: block.styles?.background || theme.primaryColor,
                                color: block.styles?.color || (themeKey === 'dark-light' ? 'white' : 'white'),
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontWeight: 600,
                                fontSize: `${block.styles?.fontSize || 14}px`,
                                minWidth: '140px',
                                opacity: hasLink ? 1 : 0.6,
                                transition: 'opacity 0.2s'
                            }}
                        >
                            {block.content || 'Botón'}
                        </a>
                    </div>
                );
            case 'divider':
                return <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: `${block.styles?.paddingY || 12}px 0`, width: '100%' }} />;
            case 'spacer':
                return <div style={{ height: `${block.styles?.paddingY || 16}px` }} />;
            case 'image':
                const isVariable = block.href?.includes('{{');
                const hasImageUrl = !!block.href;

                return (
                    <div style={{ textAlign: block.styles?.align || 'center', padding: `${block.styles?.paddingY || 12}px 0` }}>
                        {isVariable || !hasImageUrl ? (
                            <div className={`rounded-xl flex flex-col items-center justify-center border-2 border-dashed aspect-video max-w-full overflow-hidden transition-all
                                ${!hasImageUrl ? 'bg-amber-50 border-amber-200' : 'bg-gray-100 border-gray-200'}
                            `}>
                                <ImageIcon size={32} className={!hasImageUrl ? 'text-amber-300 mb-2' : 'text-gray-300 mb-2'} />
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${!hasImageUrl ? 'text-amber-600' : 'text-gray-400'}`}>
                                    {!hasImageUrl ? 'URL de imagen requerida' : `Dinámica: ${block.href}`}
                                </span>
                            </div>
                        ) : (
                            <img src={block.href} style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }} alt="Email" />
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    const LIBRARY_BLOCKS: { type: EmailBlockType, label: string, icon: any }[] = [
        { type: 'heading', label: 'Título', icon: Type },
        { type: 'text', label: 'Texto', icon: AlignLeft },
        { type: 'button', label: 'Botón', icon: MousePointer2 },
        { type: 'divider', label: 'Divisor', icon: Minus },
        { type: 'spacer', label: 'Espacio', icon: Square },
        { type: 'image', label: 'Imagen', icon: ImageIcon },
    ];

    return (
        <div className="flex flex-col h-full bg-[#f1f5f9] overflow-hidden">
            {/* HEADER / NAVIGATION */}
            <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between shadow-sm sticky top-0 z-40">
                <div className="flex items-center space-x-6">
                    <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                    <div>
                        <h1 className="text-sm font-black text-gray-800 uppercase tracking-widest">{template.name || 'Nueva Plantilla'}</h1>
                        <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-tighter">Editor Omnicanal</p>
                    </div>

                    <div className="h-8 w-px bg-gray-100 mx-2" />

                    {/* CHANNEL TABS */}
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setActiveTab('email')}
                            className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'email' ? 'bg-white shadow text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <Mail size={14} />
                            <span>Email</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('whatsapp')}
                            className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'whatsapp' ? 'bg-white shadow text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <MessageSquare size={14} />
                            <span>WhatsApp</span>
                        </button>
                    </div>
                </div>

                <div className={`flex items-center space-x-2 px-4 py-2 rounded-full border transition-all duration-300 ${isSaving ? 'bg-gray-50 border-gray-100 text-gray-400' : 'bg-green-50 border-green-100 text-green-600 shadow-sm shadow-green-50'}`}>
                    <div className={`w-2 h-2 rounded-full ${isSaving ? 'bg-gray-300 animate-pulse' : 'bg-green-500'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                        {isSaving ? 'Guardando...' : 'Guardado'}
                    </span>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* COLUMN 1: BLOCK LIBRARY (280px) */}
                <aside className={`w-[280px] bg-white border-r border-gray-100 flex flex-col z-20 ${activeTab !== 'email' ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="p-6">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.1em] mb-6">Contenido</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {LIBRARY_BLOCKS.map(block => (
                                <button
                                    key={block.type}
                                    onClick={() => addBlock(block.type)}
                                    className="flex flex-col items-center justify-center p-4 border border-gray-50 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all group shadow-sm bg-white"
                                >
                                    <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-blue-100 transition-colors mb-2">
                                        <block.icon size={20} className="text-gray-400 group-hover:text-blue-600" />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-600 group-hover:text-blue-700">{block.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-6 border-t border-gray-50">
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            <h4 className="text-xs font-black text-blue-700 uppercase mb-2 flex items-center">
                                <HelpCircle size={14} className="mr-2" /> Tips de Diseño
                            </h4>
                            <p className="text-[11px] text-blue-600 leading-relaxed font-medium">
                                Usa variables como <code className="bg-white/50 px-1 rounded">{"{{cliente_nombre}}"}</code> para personalizar tus envíos.
                            </p>
                        </div>
                    </div>
                </aside>

                {/* COLUMN 2: CANVAS (FLEX-1) */}
                <main className={`flex-1 overflow-y-auto p-12 flex flex-col items-center custom-scrollbar transition-colors duration-500 ${viewMode === 'mobile' && activeTab === 'email' ? 'bg-slate-900' : 'bg-white'}`}>
                    {activeTab === 'email' ? (
                        <>
                            {/* GLOBAL ACTIONS BAR */}
                            <div className="mb-8 flex items-center space-x-4 bg-gray-50/50 p-1 rounded-2xl border border-gray-100 backdrop-blur-sm sticky top-0 z-30">
                                <div className="flex bg-white rounded-xl p-0.5 shadow-sm border border-gray-100">
                                    <button
                                        onClick={() => setViewMode('desktop')}
                                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'desktop' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        <Monitor size={14} />
                                        <span>Escritorio</span>
                                    </button>
                                    <button
                                        onClick={() => setViewMode('mobile')}
                                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'mobile' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        <Smartphone size={14} />
                                        <span>Móvil</span>
                                    </button>
                                </div>

                                <div className="h-4 w-px bg-gray-200" />

                                <div className="flex items-center space-x-2 pr-2">
                                    <Settings size={14} className="text-gray-400 ml-2" />
                                    <select
                                        className="bg-transparent border-0 text-[10px] font-black uppercase tracking-widest text-gray-600 focus:ring-0 cursor-pointer outline-none"
                                        value={template.theme || 'corporate'}
                                        onChange={(e) => setTemplate(prev => ({ ...prev, theme: e.target.value as any }))}
                                    >
                                        <option value="corporate">Tema: Corporativo</option>
                                        <option value="minimal">Tema: Minimalista</option>
                                        <option value="dark-light">Tema: Dark-Light</option>
                                    </select>
                                </div>

                                <div className="h-4 w-px bg-gray-200" />

                                <button
                                    onClick={() => setShowRealPreview(true)}
                                    className="flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-all"
                                >
                                    <Eye size={14} />
                                    <span>Vista Final</span>
                                </button>
                            </div>

                            <div
                                className={`bg-white shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-2xl overflow-hidden min-h-[800px] transition-all duration-500 origin-top
                                ${viewMode === 'mobile' ? 'w-[360px] ring-8 ring-slate-800' : 'w-full max-w-[600px]'}
                            `}
                                style={{
                                    backgroundColor: template.theme ? THEME_DEFAULTS[template.theme].backgroundColor : '#ffffff'
                                }}
                            >
                                {/* CANVAS HEADER */}
                                <div className="h-1.5 bg-gradient-to-r from-blue-500 via-indigo-600 to-blue-500 w-full animate-gradient-x" />

                                <div className="p-10 space-y-1 relative min-h-[700px]">
                                    {/* GLOBAL VALIDATION ALERTS */}
                                    {blocks.length > 0 && !blocks.some(b => ['heading', 'text'].includes(b.type)) && (
                                        <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center space-x-3 text-amber-700 animate-in fade-in slide-in-from-top duration-500">
                                            <div className="p-2 bg-amber-100/50 rounded-xl">
                                                <AlertTriangle size={20} className="text-amber-600" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black uppercase tracking-widest">Atención</span>
                                                <span className="text-[11px] font-medium opacity-80 leading-tight">Tu plantilla no tiene bloques de contenido (título o texto). Te recomendamos añadir alguno para tus clientes.</span>
                                            </div>
                                        </div>
                                    )}

                                    {blocks.map((block, index) => (
                                        <div
                                            key={block.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, block.id)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDrop={(e) => handleDrop(e, index)}
                                            onClick={(e) => { e.stopPropagation(); setActiveBlockId(block.id); }}
                                            className={`group relative rounded-lg transition-all border-2 cursor-pointer
                                            ${activeBlockId === block.id
                                                    ? 'border-blue-500 ring-4 ring-blue-50 shadow-sm z-10'
                                                    : 'border-transparent hover:border-blue-100 hover:bg-blue-50/5'
                                                }
                                            ${dragOverIndex === index ? 'border-t-4 border-t-blue-400 pt-2' : ''}
                                            ${draggedBlockId === block.id ? 'opacity-30' : ''}
                                        `}
                                        >
                                            {/* DRAG HANDLE */}
                                            <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-300 hover:text-blue-500 cursor-grab active:cursor-grabbing">
                                                <GripVertical size={20} />
                                            </div>

                                            {renderPreviewBlock(block)}
                                        </div>
                                    ))}

                                    {blocks.length === 0 && (
                                        <div
                                            className="h-64 border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center bg-gray-50/50 group hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer m-10"
                                            onClick={() => addBlock('text')}
                                        >
                                            <Plus size={32} className="text-gray-200 group-hover:text-blue-500 mb-4 transition-transform group-hover:scale-110" />
                                            <span className="text-sm font-bold text-gray-400 group-hover:text-blue-600 tracking-tight">Crea tu primer bloque de diseño</span>
                                        </div>
                                    )}
                                </div>

                                <div className="p-10 border-t border-gray-50 bg-gray-50/30">
                                    <div className="w-full h-3 bg-gray-100 rounded-full mb-3 opacity-50"></div>
                                    <div className="w-1/2 h-3 bg-gray-100 rounded-full opacity-50"></div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-start mt-4">
                            {/* WHATSAPP EDITOR */}
                            <div className="space-y-6 animate-in slide-in-from-left-4 duration-500">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">Contenido de WhatsApp</h3>
                                    <button
                                        onClick={handleAutoGenerateWhatsApp}
                                        className="flex items-center space-x-2 px-4 py-2 bg-green-50 text-green-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-100 transition-all border border-green-100"
                                    >
                                        <Sparkles size={14} />
                                        <span>Autogenerar desde Email</span>
                                    </button>
                                </div>
                                <div className="relative">
                                    <textarea
                                        value={template.whatsappText || ''}
                                        onChange={(e) => setTemplate(prev => ({ ...prev, whatsappText: e.target.value }))}
                                        className="w-full h-[500px] bg-white border border-gray-200 rounded-[32px] p-8 text-sm focus:ring-4 focus:ring-green-50 focus:border-green-400 outline-none transition-all resize-none font-mono shadow-sm"
                                        placeholder="Escribe el mensaje optimizado para WhatsApp aquí..."
                                    />
                                    {(!template.whatsappText) && (
                                        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] rounded-[32px] flex items-center justify-center p-12 text-center pointer-events-none">
                                            <div className="animate-in fade-in zoom-in-95 duration-500">
                                                <p className="text-gray-400 text-xs font-black uppercase tracking-widest mb-4">Sin texto manual</p>
                                                <p className="text-gray-400 text-[10px] font-bold uppercase leading-relaxed max-w-[200px]">Se usará la versión autogenerada si dejas este campo vacío.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* WHATSAPP PREVIEW */}
                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                                <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest text-center">Simulación WhatsApp</h3>
                                <div className="bg-[#e5ddd5] w-full max-w-[360px] mx-auto aspect-[9/18.5] rounded-[50px] border-[10px] border-slate-900 shadow-2xl relative overflow-hidden flex flex-col ring-4 ring-slate-100">
                                    {/* iPhone Notch area */}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-2xl z-10" />

                                    {/* Header bar */}
                                    <div className="bg-[#075e54] pt-8 pb-3 px-4 flex items-center space-x-3 shadow-md relative z-10">
                                        <div className="w-9 h-9 bg-gray-200/20 rounded-full flex items-center justify-center border border-white/10 overflow-hidden">
                                            <div className="w-full h-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">JP</div>
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[13px] font-black text-white leading-tight">Juan Pérez</div>
                                            <div className="text-[10px] text-white/70 font-medium">En línea</div>
                                        </div>
                                        <div className="flex space-x-3 text-white/80">
                                            <div className="w-4 h-4 rounded-full border-2 border-current opacity-40 shrink-0" />
                                            <div className="w-4 h-4 rounded-full border-2 border-current opacity-40 shrink-0" />
                                        </div>
                                    </div>

                                    {/* Message area */}
                                    <div className="flex-1 p-4 relative overflow-y-auto custom-scrollbar bg-slate-200/50"
                                        style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: '400px' }}>

                                        <div className="bg-[#dcf8c6] p-3 rounded-2xl rounded-tl-none shadow-sm relative max-w-[92%] animate-in zoom-in-95 self-start mt-2">
                                            {/* Bubble tail */}
                                            <div className="absolute -left-2 top-0 w-0 h-0 border-t-[10px] border-t-[#dcf8c6] border-l-[10px] border-l-transparent" />

                                            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800 font-sans">
                                                {(() => {
                                                    const demoVars = {
                                                        cliente_nombre: 'Juan Pérez',
                                                        doc_numero: 'F2026-004',
                                                        doc_total: '1.250,00 €',
                                                        doc_fecha: '18/02/2026',
                                                        doc_link: 'https://totalgestpro.app/v/1a2b3c',
                                                        logo_url: 'https://via.placeholder.com/150',
                                                        company_name: template.name || 'TotalGest Pro'
                                                    };
                                                    let text = template.whatsappText || 'Hola {{cliente_nombre}},\n\nTe enviamos la {{doc_numero}} por un total de {{doc_total}}.\n\nPuedes verla aquí: {{doc_link}}\n\n¡Gracias!';

                                                    Object.entries(demoVars).forEach(([key, value]) => {
                                                        let processedValue = value;
                                                        if (key === 'doc_total' || key === 'doc_fecha') {
                                                            processedValue = value.replace(/<[^>]*>?/gm, '');
                                                        } else if (key === 'doc_link') {
                                                            processedValue = `\n${value.trim()}`;
                                                        }
                                                        text = text.replace(new RegExp(`{{${key}}}`, 'g'), processedValue);
                                                    });

                                                    // Cleanup undefined variables
                                                    text = text.replace(/{{[^{}]*}}/g, '');
                                                    return text;
                                                })()}
                                            </div>

                                            <div className="flex justify-end mt-1 space-x-1 items-center">
                                                <span className="text-[9px] text-gray-500 font-medium">11:45</span>
                                                <div className="flex -space-x-1.5 opacity-80">
                                                    <Check size={11} className="text-[#34b7f1]" />
                                                    <Check size={11} className="text-[#34b7f1]" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer bar */}
                                    <div className="bg-[#f0f0f0] p-3 flex items-center space-x-2">
                                        <div className="w-6 h-6 bg-gray-300 rounded-full" />
                                        <div className="flex-1 h-8 bg-white rounded-full" />
                                        <div className="w-8 h-8 bg-[#128c7e] rounded-full flex items-center justify-center text-white">
                                            <MessageSquare size={14} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>

                {/* COLUMN 3: PROPERTIES (320px) */}
                <aside className="w-[320px] bg-white border-l border-gray-100 flex flex-col z-20 overflow-y-auto">
                    {activeTab === 'email' ? (
                        activeBlock ? (
                            <div className="p-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.1em] mb-8 flex items-center justify-between">
                                    Propiedades
                                    <span className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded-full">{activeBlock.type}</span>
                                </h3>

                                <div className="space-y-8">
                                    {/* CONTENT / TEXT */}
                                    {['heading', 'text', 'button'].includes(activeBlock.type) && (
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-black text-gray-600 uppercase tracking-wide">
                                                {activeBlock.type === 'button' ? 'Etiqueta del Botón' : 'Contenido'}
                                            </label>
                                            <textarea
                                                name="content"
                                                className="w-full text-sm border border-gray-100 bg-gray-50/50 rounded-xl p-4 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-medium"
                                                rows={activeBlock.type === 'button' ? 2 : 4}
                                                value={activeBlock.content || ''}
                                                onChange={(e) => updateBlock(activeBlock.id, { content: e.target.value })}
                                                placeholder="Escribe aquí..."
                                            />
                                        </div>
                                    )}

                                    {/* LINKS / URL */}
                                    {(activeBlock.type === 'button' || activeBlock.type === 'image') && (
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-black text-gray-600 uppercase tracking-wide">
                                                {activeBlock.type === 'button' ? 'Enlace (URL)' : 'URL de la Imagen'}
                                            </label>
                                            <div className="relative">
                                                <ExternalLink size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    name="href"
                                                    className="w-full text-sm border border-gray-100 bg-gray-50/50 rounded-xl p-4 pl-12 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-medium"
                                                    placeholder="https://..."
                                                    value={activeBlock.href || ''}
                                                    onChange={(e) => updateBlock(activeBlock.id, { href: e.target.value })}
                                                />
                                            </div>
                                            <p className="text-[10px] text-gray-400 italic font-medium px-1">Puedes usar {"{{variables}}"}</p>
                                        </div>
                                    )}

                                    {/* COLORS */}
                                    {['heading', 'text', 'button'].includes(activeBlock.type) && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-3">
                                                <label className="text-[11px] font-black text-gray-600 uppercase tracking-wide">Color Texto</label>
                                                <div className="flex items-center space-x-2 bg-gray-50 p-2 rounded-xl border border-gray-100">
                                                    <input
                                                        type="color"
                                                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                                                        value={activeBlock.styles?.color || (activeBlock.type === 'button' ? '#FFFFFF' : '#475569')}
                                                        onChange={(e) => updateBlockStyle(activeBlock.id, 'color', e.target.value)}
                                                    />
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">{activeBlock.styles?.color || 'Auto'}</span>
                                                </div>
                                            </div>
                                            {activeBlock.type === 'button' && (
                                                <div className="space-y-3">
                                                    <label className="text-[11px] font-black text-gray-600 uppercase tracking-wide">Fondo Botón</label>
                                                    <div className="flex items-center space-x-2 bg-gray-50 p-2 rounded-xl border border-gray-100">
                                                        <input
                                                            type="color"
                                                            className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                                                            value={activeBlock.styles?.background || '#2563EB'}
                                                            onChange={(e) => updateBlockStyle(activeBlock.id, 'background', e.target.value)}
                                                        />
                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">{activeBlock.styles?.background || '#2563EB'}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ALIGNMENT */}
                                    {activeBlock.type !== 'divider' && activeBlock.type !== 'spacer' && (
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-black text-gray-600 uppercase tracking-wide">Alineación</label>
                                            <div className="flex bg-gray-50 rounded-xl p-1.5 border border-gray-100">
                                                <button
                                                    onClick={() => updateBlockStyle(activeBlock.id, 'align', 'left')}
                                                    className={`flex-1 flex justify-center py-2.5 rounded-lg transition-all ${activeBlock.styles?.align === 'left' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    <AlignLeft size={18} />
                                                </button>
                                                <button
                                                    onClick={() => updateBlockStyle(activeBlock.id, 'align', 'center')}
                                                    className={`flex-1 flex justify-center py-2.5 rounded-lg transition-all ${activeBlock.styles?.align === 'center' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    <AlignCenter size={18} />
                                                </button>
                                                <button
                                                    onClick={() => updateBlockStyle(activeBlock.id, 'align', 'right')}
                                                    className={`flex-1 flex justify-center py-2.5 rounded-lg transition-all ${activeBlock.styles?.align === 'right' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    <AlignRight size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* FONT SIZE & PADDING Y */}
                                    <div className="grid grid-cols-2 gap-6">
                                        {activeBlock.type !== 'divider' && activeBlock.type !== 'spacer' && (
                                            <div className="space-y-3">
                                                <label className="text-[11px] font-black text-gray-600 uppercase tracking-wide">Tamaño Fuente</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        className="w-full text-sm border border-gray-100 bg-gray-50/50 rounded-xl p-4 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-bold"
                                                        value={activeBlock.styles?.fontSize || 16}
                                                        onChange={(e) => updateBlockStyle(activeBlock.id, 'fontSize', parseInt(e.target.value) || 0)}
                                                    />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300 uppercase">px</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-black text-gray-600 uppercase tracking-wide">Espaciado Y (Vertical)</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    className="w-full text-sm border border-gray-100 bg-gray-50/50 rounded-xl p-4 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-bold"
                                                    value={activeBlock.styles?.paddingY || 0}
                                                    onChange={(e) => updateBlockStyle(activeBlock.id, 'paddingY', parseInt(e.target.value) || 0)}
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300 uppercase">px</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* PADDING X & BOLD */}
                                    <div className="grid grid-cols-2 gap-6">
                                        {activeBlock.type !== 'divider' && activeBlock.type !== 'spacer' && (
                                            <div className="space-y-3">
                                                <label className="text-[11px] font-black text-gray-600 uppercase tracking-wide">Margen X (Lateral)</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        className="w-full text-sm border border-gray-100 bg-gray-50/50 rounded-xl p-4 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-bold"
                                                        value={activeBlock.styles?.paddingX || 0}
                                                        onChange={(e) => updateBlockStyle(activeBlock.id, 'paddingX', parseInt(e.target.value) || 0)}
                                                    />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300 uppercase">px</span>
                                                </div>
                                            </div>
                                        )}
                                        {['heading', 'text'].includes(activeBlock.type) && (
                                            <div className="space-y-3">
                                                <label className="text-[11px] font-black text-gray-600 uppercase tracking-wide">Negrita</label>
                                                <button
                                                    onClick={() => updateBlockStyle(activeBlock.id, 'bold', !activeBlock.styles?.bold)}
                                                    className={`w-full h-[54px] rounded-xl flex items-center justify-center transition-all border ${activeBlock.styles?.bold ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                                                >
                                                    <Bold size={20} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-6 border-t border-gray-50">
                                        <button
                                            onClick={() => removeBlock(activeBlock.id)}
                                            className="w-full py-4 px-6 bg-red-50 text-red-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-100 transition-all flex items-center justify-center group"
                                        >
                                            <Trash2 size={16} className="mr-3 group-hover:rotate-12 transition-transform" /> Eliminar Bloque
                                        </button>
                                    </div>

                                    {/* VARIABLE LIBRARY */}
                                    {['heading', 'text', 'button'].includes(activeBlock.type) && (
                                        <div className="pt-8 border-t border-gray-100 space-y-4">
                                            <div className="flex items-center space-x-2">
                                                <div className="p-1.5 bg-blue-50 rounded-lg">
                                                    <Minus size={14} className="text-blue-500" />
                                                </div>
                                                <label className="text-[11px] font-black text-gray-700 uppercase tracking-widest">
                                                    Variables disponibles
                                                </label>
                                            </div>
                                            <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100/50">
                                                <div className="grid grid-cols-1 gap-2">
                                                    {EMAIL_VARIABLES.map((v) => (
                                                        <button
                                                            key={v.key}
                                                            onClick={() => insertVariable(v.key)}
                                                            className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all group text-left"
                                                            title={v.description}
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="text-[11px] font-bold text-gray-700 group-hover:text-blue-600 truncate">{v.label}</span>
                                                                <span className="text-[9px] font-mono text-gray-400 group-hover:text-blue-400">{v.key}</span>
                                                            </div>
                                                            <Plus size={14} className="text-gray-300 group-hover:text-blue-500 group-hover:rotate-90 transition-all" />
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="mt-4 text-[10px] text-gray-400 italic text-center font-medium">Haz click para insertar en el cursor</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-gray-400 space-y-4">
                                <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center animate-pulse">
                                    <Settings size={32} className="text-gray-200" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-500">Sin Selección</p>
                                    <p className="text-[11px] text-gray-400">Selecciona un bloque en el lienzo para editar sus propiedades.</p>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="p-8 animate-in fade-in slide-in-from-right-4 duration-300">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.1em] mb-8 flex items-center justify-between">
                                Variables WhatsApp
                                <span className="bg-green-600 text-white text-[9px] px-2 py-0.5 rounded-full">Global</span>
                            </h3>
                            <div className="space-y-4">
                                <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100/50">
                                    <div className="grid grid-cols-1 gap-2">
                                        {EMAIL_VARIABLES.map((v) => (
                                            <button
                                                key={v.key}
                                                onClick={() => {
                                                    const textarea = document.querySelector('textarea[placeholder*="WhatsApp"]') as HTMLTextAreaElement;
                                                    if (textarea) {
                                                        const start = textarea.selectionStart;
                                                        const end = textarea.selectionEnd;
                                                        const currentVal = template.whatsappText || '';
                                                        const newVal = currentVal.substring(0, start) + v.key + currentVal.substring(end);
                                                        setTemplate(prev => ({ ...prev, whatsappText: newVal }));
                                                        // Request focus back
                                                        setTimeout(() => {
                                                            textarea.focus();
                                                            textarea.setSelectionRange(start + v.key.length, start + v.key.length);
                                                        }, 10);
                                                    } else {
                                                        setTemplate(prev => ({ ...prev, whatsappText: (prev.whatsappText || '') + v.key }));
                                                    }
                                                }}
                                                className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-sm transition-all group text-left"
                                                title={v.description}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-bold text-gray-700 group-hover:text-green-600 truncate">{v.label}</span>
                                                    <span className="text-[9px] font-mono text-gray-400 group-hover:text-green-400">{v.key}</span>
                                                </div>
                                                <Plus size={14} className="text-gray-300 group-hover:text-green-500 group-hover:rotate-90 transition-all" />
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mt-4 text-[10px] text-gray-400 italic text-center font-medium">Haz click para insertar en el mensaje</p>
                                </div>
                            </div>
                        </div>
                    )}
                </aside>

                {/* REAL HTML PREVIEW OVERLAY */}
                {showRealPreview && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex flex-col animate-in fade-in duration-300">
                        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-8 shadow-sm">
                            <div className="flex items-center space-x-4">
                                <div className="p-2 bg-blue-50 rounded-xl">
                                    <Eye size={20} className="text-blue-600" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Simulación Cliente Email</h2>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Renderizado real basado en tablas (HTML/CSS Inline)</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowRealPreview(false)}
                                className="w-10 h-10 rounded-full hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all"
                            >
                                <X size={20} />
                            </button>
                        </header>
                        <main className="flex-1 bg-gray-200 p-8 flex justify-center overflow-auto custom-scrollbar">
                            <div className="w-full max-w-[700px] h-fit bg-white shadow-2xl rounded-2xl overflow-hidden border border-gray-100">
                                {/* IFRAME TO ISOLATE STYLES AND SHOW PURE HTML */}
                                <iframe
                                    title="Email Preview"
                                    className="w-full min-h-[90vh] border-0"
                                    srcDoc={generateEmailHtml(template as EmailTemplate, {
                                        cliente_nombre: "Juan Pérez",
                                        doc_numero: "F2026-004",
                                        doc_total: "1.250,00 €",
                                        doc_fecha: "17/02/2026",
                                        doc_link: "https://midominio.com/factura/123",
                                        logo_url: "https://via.placeholder.com/120x60"
                                    })}
                                />
                            </div>
                        </main>
                    </div>
                )}
            </div>
        </div>
    );
};
