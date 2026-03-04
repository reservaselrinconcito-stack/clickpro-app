
import React, { useEffect, useRef, useState } from 'react';
import { Invoice, Quote, Contact, CompanySettings, TemplateBlock, DocumentTemplate } from '../types';
import { normalizeLayout } from '@/lib/layoutUtils';

// Helper to format currency
const formatMoney = (amount: number, currency: string = 'EUR') =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);

// Helper to resolve "dot.notation" strings from object
const resolvePath = (path: string, obj: any) => {
    try {
        return path.split('.').reduce((prev, curr) => prev ? prev[curr] : null, obj);
    } catch (e) {
        return null;
    }
};

// Variable Replacer
const replaceVariables = (text: string, context: any) => {
    if (!text) return '';
    try {
        return text.replace(/{{([^}]+)}}/g, (match, path) => {
            const value = resolvePath(path.trim(), context);
            if (value instanceof Date) return value.toLocaleDateString();
            return value !== null && value !== undefined ? String(value) : match;
        });
    } catch (e) {
        return text;
    }
};

interface DocumentHTMLPreviewProps {
    doc: Invoice | Quote;
    client: Contact;
    settings: CompanySettings;
    template: DocumentTemplate;
}

export const DocumentHTMLPreview: React.FC<DocumentHTMLPreviewProps> = ({ doc, client, settings, template }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [htmlLen, setHtmlLen] = useState<number>(0);
    const [renderError, setRenderError] = useState<string | null>(null);

    // Ensure we have minimal data structure to avoid crashes
    const safeConfig = template?.config || {
        layout: [],
        design: {
            font: 'helvetica',
            textColor: '#000',
            fontSizeBase: 10,
            primaryColor: '#000',
            secondaryColor: '#555',
            headerStyle: 'classic',
            headerAlignment: 'left',
            logoSize: 'M',
            background: { mode: 'cover' as any, opacity: 0, image: undefined }
        },
        header: {}, client: {}, columns: {}, totals: {}, footer: {}
    };

    const design = safeConfig.design;
    const layout = normalizeLayout(safeConfig.layout);
    const { header, client: clientConfig, columns, totals, footer } = safeConfig;

    // Build context for variables safely
    const context = {
        doc: {
            ...doc,
            date: doc?.date ? new Date(doc.date).toLocaleDateString() : '',
            dueDate: doc?.dueDate ? new Date(doc.dueDate).toLocaleDateString() : '',
            total: doc?.grandTotal ? formatMoney(doc.grandTotal, settings?.currency) : '0.00'
        },
        client: client || {},
        company: settings || {}
    };

    // Measure HTML length after render
    useEffect(() => {
        if (containerRef.current) {
            setHtmlLen(containerRef.current.innerHTML.length);
        }
    });

    // Fallback UI Component
    const renderFallback = () => (
        <div className="flex flex-col items-center justify-center h-full w-full p-10 text-center border-4 border-dashed border-red-200 bg-red-50 text-red-900 rounded-xl">
            <h2 className="text-3xl font-bold mb-4">PREVIEW VACÍO</h2>
            <div className="text-left bg-white p-6 rounded shadow-sm text-sm space-y-2 border border-red-100 max-w-md w-full">
                <p><strong>Razón:</strong> El contenido generado es demasiado corto o hubo un error.</p>
                <hr className="border-red-100 my-2" />
                <p><strong>Template ID:</strong> {template?.id || 'N/A'}</p>
                <p><strong>Documento:</strong> {doc?.number || 'Sin número'}</p>
                <p><strong>Cliente:</strong> {client?.name || 'Sin cliente'}</p>
                <p><strong>Líneas:</strong> {doc?.lines?.length || 0}</p>
                <p><strong>Total:</strong> {doc?.grandTotal}</p>
                {renderError && <p className="text-red-600 font-bold mt-2">Error JS: {renderError}</p>}
            </div>
        </div>
    );

    // Main Render Logic
    const renderContent = () => {
        if (!template || !doc) return null;

        try {
            const containerStyle: React.CSSProperties = {
                fontFamily: design.font === 'times' ? '"Times New Roman", serif' : design.font === 'courier' ? '"Courier New", monospace' : 'Helvetica, Arial, sans-serif',
                color: design.textColor,
                fontSize: `${design.fontSizeBase || 10}pt`,
                lineHeight: 1.5,
                width: '210mm',
                minHeight: '297mm',
                backgroundColor: 'white',
                position: 'relative',
                boxShadow: '0 0 10px rgba(0,0,0,0.1)',
                margin: '0 auto',
                padding: '20mm', // Standard Margin
                boxSizing: 'border-box',
                overflow: 'hidden'
            };

            const renderBlock = (block: TemplateBlock) => {
                const isAbsolute = block.positioning === 'absolute';
                const blockStyle: React.CSSProperties = {
                    position: isAbsolute ? 'absolute' : 'relative',
                    marginBottom: isAbsolute ? 0 : '2rem',
                    left: isAbsolute && block.coords?.x ? `${block.coords.x}mm` : undefined,
                    top: isAbsolute && block.coords?.y ? `${block.coords.y}mm` : undefined,
                    width: isAbsolute && block.coords?.w ? `${block.coords.w}mm` : '100%',
                    zIndex: isAbsolute ? 20 : 10
                };

                switch (block.type) {
                    case 'header':
                        return (
                            <div key={block.id} style={blockStyle}>
                                <div className={`flex ${design.headerAlignment === 'center' ? 'flex-col items-center text-center' : 'flex-row justify-between'} ${design.headerAlignment === 'right' ? 'flex-row-reverse text-right' : ''}`}>
                                    <div className="w-1/2">
                                        {header.showLogo && settings?.logo && (
                                            <img src={settings.logo} className="object-contain mb-4" style={{ height: design.logoSize === 'S' ? '30px' : design.logoSize === 'L' ? '80px' : '50px' }} alt="Logo" />
                                        )}
                                        {!header.showLogo && settings?.companyName && <h1 style={{ color: design.primaryColor }} className="text-2xl font-bold">{settings.companyName}</h1>}
                                        {header.showCompanyDetails && (
                                            <div className="text-sm opacity-70 mt-2">
                                                {settings?.fiscalName && <p>{settings.fiscalName}</p>}
                                                {settings?.nif && <p>NIF: {settings.nif}</p>}
                                                <p>{[settings?.address, settings?.zip, settings?.city].filter(Boolean).join(', ')}</p>
                                                <p>{[settings?.province, settings?.country].filter(Boolean).join(', ')}</p>
                                                <p>{[settings?.email, settings?.phone].filter(Boolean).join(' | ')}</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`w-1/2 ${design.headerAlignment === 'center' ? 'mt-8' : design.headerAlignment === 'right' ? 'text-left' : 'text-right'}`}>
                                        <h2 style={{ color: design.primaryColor }} className="text-3xl font-bold uppercase">{header.customTitle || (template.type === 'invoice' ? 'FACTURA' : 'PRESUPUESTO')}</h2>
                                        <p className="text-lg opacity-50 font-bold">{header.slogan}</p>
                                        <div className="mt-4">
                                            <p><strong>Nº:</strong> {doc.number}</p>
                                            <p><strong>Fecha:</strong> {new Date(doc.date).toLocaleDateString()}</p>
                                            {doc.dueDate && <p><strong>Vencimiento:</strong> {new Date(doc.dueDate).toLocaleDateString()}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    case 'client':
                        return (
                            <div key={block.id} style={blockStyle}>
                                <div className="border-l-4 pl-4" style={{ borderColor: design.secondaryColor }}>
                                    <p className="font-bold text-sm uppercase" style={{ color: design.secondaryColor }}>{clientConfig.label}</p>
                                    <p className="font-bold text-lg">{client.name}</p>
                                    {clientConfig.showVat && <p>{client.nif}</p>}
                                    {clientConfig.showAddress && (
                                        <>
                                            <p>{client.address}</p>
                                            <p>{client.zip} {client.city}</p>
                                            <p>{client.province} {client.country}</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    case 'lines':
                        return (
                            <div key={block.id} style={blockStyle}>
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr style={{ backgroundColor: `${design.secondaryColor}20`, color: '#000' }}>
                                            <th className="p-2">Descripción</th>
                                            {columns.quantity && <th className="p-2 text-right">Cant.</th>}
                                            {columns.price && <th className="p-2 text-right">Precio</th>}
                                            {columns.discount && <th className="p-2 text-right">Dto.</th>}
                                            {columns.vat && <th className="p-2 text-right">IVA</th>}
                                            {columns.total && <th className="p-2 text-right">Total</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {doc.lines.map((line: any, i: number) => (
                                            <tr key={i} className="border-b border-gray-100">
                                                <td className="p-2">
                                                    <div className="font-bold">{line.description}</div>
                                                </td>
                                                {columns.quantity && <td className="p-2 text-right">{line.quantity} {columns.unit ? line.unit : ''}</td>}
                                                {columns.price && <td className="p-2 text-right">{formatMoney(line.price, settings.currency)}</td>}
                                                {columns.discount && <td className="p-2 text-right">{line.discountPct ? `${line.discountPct}%` : '-'}</td>}
                                                {columns.vat && <td className="p-2 text-right">{line.vatPct}%</td>}
                                                {columns.total && <td className="p-2 text-right">{formatMoney(line.quantity * line.price * (1 - (line.discountPct || 0) / 100), settings.currency)}</td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    case 'totals':
                        return (
                            <div key={block.id} style={blockStyle}>
                                <div className="flex justify-end">
                                    <div className="w-1/2 space-y-2">
                                        {totals.showSubtotal && (
                                            <div className="flex justify-between"><span>{totals.labels.subtotal}</span> <span>{formatMoney(doc.baseTotal, settings.currency)}</span></div>
                                        )}
                                        {totals.showVatBreakdown && (
                                            <div className="flex justify-between text-sm opacity-70"><span>{totals.labels.vat}</span> <span>{formatMoney(doc.vatTotal, settings.currency)}</span></div>
                                        )}
                                        {doc.retentionTotal > 0 && (
                                            <div className="flex justify-between text-red-600"><span>Retención IRPF</span> <span>-{formatMoney(doc.retentionTotal, settings.currency)}</span></div>
                                        )}
                                        {totals.showTotal && (
                                            <div className="flex justify-between font-bold text-xl border-t pt-2 mt-2" style={{ color: design.primaryColor }}>
                                                <span>{totals.labels.total}</span>
                                                <span>{formatMoney(doc.grandTotal, settings.currency)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    case 'footer':
                        return (
                            <div key={block.id} style={blockStyle}>
                                <div className="border-t pt-6 text-sm opacity-75">
                                    {footer.showBankDetails && settings?.iban && (
                                        <div className="mb-4">
                                            <p className="font-bold">Datos de Pago:</p>
                                            <p>{settings.bankName} - {settings.iban}</p>
                                            {settings.swift && <p>BIC/SWIFT: {settings.swift}</p>}
                                        </div>
                                    )}
                                    {(template.defaultNotes || doc.notes) && (
                                        <div className="bg-gray-50 p-3 rounded mb-4 text-xs">
                                            <strong>Notas:</strong> {replaceVariables(doc.notes || template.defaultNotes, context)}
                                        </div>
                                    )}
                                    <p className="text-center italic mt-4">{replaceVariables(footer.thanksMessage, context)}</p>

                                    {footer.terms && (
                                        <div className="mt-4 text-[10px] text-justify opacity-60">
                                            {replaceVariables(footer.terms, context)}
                                        </div>
                                    )}

                                    {footer.showSignature && (
                                        <div className="mt-8 border-t border-black w-48 mx-auto text-center pt-2 text-xs">
                                            Firma y Sello
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    case 'text':
                        const fontSize = block.styles?.fontSize === 'xl' ? '1.5em' : block.styles?.fontSize === 'lg' ? '1.25em' : block.styles?.fontSize === 'sm' ? '0.875em' : '1em';
                        const color = block.styles?.color === 'primary' ? design.primaryColor : block.styles?.color === 'secondary' ? design.secondaryColor : 'inherit';
                        return (
                            <div key={block.id} style={{ ...blockStyle, textAlign: block.styles?.align || 'left', fontWeight: block.styles?.bold ? 'bold' : 'normal', fontSize, color }}>
                                {replaceVariables(block.content || '', context)}
                            </div>
                        );
                    case 'separator':
                        const height = block.styles?.height === 'lg' ? 40 : block.styles?.height === 'sm' ? 10 : 20;
                        return (
                            <div key={block.id} style={{ ...blockStyle, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {block.styles?.line && <div style={{ width: '100%', height: 1, backgroundColor: '#ddd' }}></div>}
                            </div>
                        );
                    case 'pagebreak':
                        return (
                            <div key={block.id} className="my-8 border-t-2 border-dashed border-gray-300 text-center relative print:hidden">
                                <span className="bg-gray-100 text-gray-500 text-xs px-2 absolute -top-2 left-1/2 -translate-x-1/2">SALTO DE PÁGINA (SOLO PDF)</span>
                            </div>
                        );
                    default: return null;
                }
            };

            return (
                <div style={containerStyle}>
                    {/* Background Layer */}
                    {design.background?.image && (
                        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                            <img
                                src={design.background.image}
                                className={`w-full h-full ${design.background.mode === 'cover' ? 'object-cover' : design.background.mode === 'contain' ? 'object-contain' : 'object-fill'}`}
                                style={{ opacity: design.background.opacity }}
                                alt=""
                            />
                        </div>
                    )}

                    {/* Content Layer */}
                    <div className="relative z-10">
                        {layout.length === 0 && <div className="text-center text-gray-300 p-10 uppercase font-bold text-xl">Sin Bloques Definidos</div>}
                        {layout.map((block: TemplateBlock) => renderBlock(block))}
                    </div>

                    {/* Fixed Legal Bottom */}
                    {settings.legalTerms && footer.showLegalTerms && (
                        <div className="absolute bottom-[10mm] left-[20mm] right-[20mm] text-[8px] text-gray-400 text-justify z-10">
                            {replaceVariables(settings.legalTerms, context)}
                        </div>
                    )}
                </div>
            );
        } catch (err: any) {
            console.error("Preview Render Error:", err);
            setRenderError(err.message);
            return null; // Will trigger length < 30 fallback
        }
    };

    const isFallback = htmlLen < 30 || renderError;

    return (
        <div className="relative group">
            {/* DEBUG HEADER */}
            <div className={`absolute top-0 left-0 right-0 py-1 px-4 text-xs font-mono font-bold uppercase tracking-wider text-center z-50 transition-colors ${isFallback ? 'bg-red-500 text-white' : 'bg-gray-800 text-green-400 opacity-0 group-hover:opacity-100'}`}>
                Debug: HTML Length: {htmlLen} chars | Status: {isFallback ? 'FALLBACK' : 'OK'}
            </div>

            <div ref={containerRef} className={isFallback ? 'hidden' : 'block'}>
                {renderContent()}
            </div>

            {isFallback && (
                <div style={{ width: '210mm', height: '297mm' }} className="bg-white shadow-lg mx-auto">
                    {renderFallback()}
                </div>
            )}
        </div>
    );
};
