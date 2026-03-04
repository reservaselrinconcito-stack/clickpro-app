import React, { useEffect, useState } from 'react';
import { Invoice, Quote, Contact, CompanySettings, DocumentTemplate, TemplateBlock } from '../types';
import { AlertTriangle } from 'lucide-react';
import { normalizeLayout } from '../lib/layoutUtils';

// --- UTILS ---
const formatMoney = (amount: number, currency: string = 'EUR') =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount || 0);

const resolvePath = (path: string, obj: any) => {
    try {
        return path.split('.').reduce((prev, curr) => prev ? prev[curr] : null, obj);
    } catch (e) {
        return null;
    }
};

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

// --- HTML GENERATOR ---
const generateFullHtml = (
    doc: Invoice | Quote,
    client: Contact,
    settings: CompanySettings,
    template: DocumentTemplate
): string => {

    const config = template?.config || {
        layout: ['header', 'client', 'lines', 'totals', 'footer'],
        design: { font: 'helvetica', textColor: '#333', fontSizeBase: 10, primaryColor: '#000', secondaryColor: '#555', background: { mode: 'cover', opacity: 0.1 } },
        header: { showLogo: true, showCompanyDetails: true },
        client: { label: 'Cliente', showVat: true, showAddress: true },
        columns: { quantity: true, price: true, total: true },
        totals: { showSubtotal: true, showVatBreakdown: true, showTotal: true, labels: { subtotal: 'Subtotal', vat: 'IVA', total: 'TOTAL' } },
        footer: { showBankDetails: true }
    };

    const { design } = config;
    const fontFamily = design.font === 'times' ? '"Times New Roman", serif' : design.font === 'courier' ? '"Courier New", monospace' : 'Helvetica, Arial, sans-serif';

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

    // --- RENDER BLOCKS ---
    const renderHeader = () => `
        <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="width: 50%;">
                ${config.header.showLogo && settings?.logo ?
            `<img src="${settings.logo}" style="max-height: 80px; max-width: 100%; object-fit: contain; margin-bottom: 10px;" alt="Logo" />` :
            (!config.header.showLogo && settings?.companyName ? `<h1 style="color: ${design.primaryColor}; font-size: 1.5rem; font-weight: bold; margin: 0;">${settings.companyName}</h1>` : '')
        }
                ${config.header.showCompanyDetails ? `
                    <div style="font-size: 0.85rem; opacity: 0.8; line-height: 1.4;">
                        <strong>${settings?.fiscalName || ''}</strong><br/>
                        ${settings?.nif ? `NIF: ${settings.nif}<br/>` : ''}
                        ${settings?.address || ''}<br/>
                        ${settings?.city ? `${settings.zip || ''} ${settings.city}` : ''}
                    </div>
                ` : ''}
            </div>
            <div style="width: 50%; text-align: right;">
                <h2 style="color: ${design.primaryColor}; font-size: 2rem; font-weight: bold; margin: 0; text-transform: uppercase;">
                    ${config.header.customTitle || (template.type === 'invoice' ? 'FACTURA' : 'PRESUPUESTO')}
                </h2>
                ${config.header.slogan ? `<p style="font-size: 0.9rem; opacity: 0.6; margin-top: 0;">${config.header.slogan}</p>` : ''}
                <div style="margin-top: 1rem; font-size: 0.9rem;">
                    <p style="margin: 2px 0;"><strong>Nº:</strong> ${doc.number || 'Draft'}</p>
                    <p style="margin: 2px 0;"><strong>Fecha:</strong> ${new Date(doc.date).toLocaleDateString()}</p>
                    ${doc.dueDate ? `<p style="margin: 2px 0;"><strong>Vencimiento:</strong> ${new Date(doc.dueDate).toLocaleDateString()}</p>` : ''}
                </div>
            </div>
        </div>
    `;

    const renderClient = () => `
        <div style="margin-bottom: 2rem; background: #f9f9f9; padding: 1.5rem; border-radius: 4px; border-left: 4px solid ${design.secondaryColor};">
            <div style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase; color: ${design.secondaryColor}; margin-bottom: 0.5rem;">
                ${config.client.label || 'Cliente'}
            </div>
            <div style="font-size: 1.1rem; font-weight: bold; margin-bottom: 0.25rem;">${client?.name || 'Cliente sin asignar'}</div>
            <div style="font-size: 0.9rem; line-height: 1.4;">
                ${config.client.showVat && client?.nif ? `NIF: ${client.nif}<br/>` : ''}
                ${config.client.showAddress ? `
                    ${client?.address || ''}<br/>
                    ${client?.city ? `${client.zip || ''} ${client.city}` : ''}<br/>
                    ${client?.province || ''} ${client?.country || ''}
                ` : ''}
            </div>
        </div>
    `;

    const renderLines = () => {
        const cols = config.columns;
        return `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 0.9rem;">
            <thead>
                <tr style="background: ${design.secondaryColor}20; color: #000;">
                    <th style="padding: 10px; text-align: left;">Descripción</th>
                    ${cols.quantity ? `<th style="padding: 10px; text-align: right; width: 10%;">Cant.</th>` : ''}
                    ${cols.price ? `<th style="padding: 10px; text-align: right; width: 15%;">Precio</th>` : ''}
                    ${cols.discount ? `<th style="padding: 10px; text-align: right; width: 10%;">Dto.</th>` : ''}
                    ${cols.vat ? `<th style="padding: 10px; text-align: right; width: 10%;">IVA</th>` : ''}
                    ${cols.total ? `<th style="padding: 10px; text-align: right; width: 15%;">Total</th>` : ''}
                </tr>
            </thead>
            <tbody>
                ${(doc.lines || []).map((line: any) => {
            const lineTotal = line.quantity * line.price * (1 - (line.discountPct || 0) / 100);
            return `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 10px;">
                            <div style="font-weight: bold;">${line.description}</div>
                        </td>
                        ${cols.quantity ? `<td style="padding: 10px; text-align: right;">${line.quantity} ${cols.unit ? (line.unit || '') : ''}</td>` : ''}
                        ${cols.price ? `<td style="padding: 10px; text-align: right;">${formatMoney(line.price, settings.currency)}</td>` : ''}
                        ${cols.discount ? `<td style="padding: 10px; text-align: right;">${line.discountPct ? line.discountPct + '%' : '-'}</td>` : ''}
                        ${cols.vat ? `<td style="padding: 10px; text-align: right;">${line.vatPct}%</td>` : ''}
                        ${cols.total ? `<td style="padding: 10px; text-align: right;">${formatMoney(lineTotal, settings.currency)}</td>` : ''}
                    </tr>
                    `;
        }).join('')}
            </tbody>
        </table>
        `;
    };

    const renderTotals = () => `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 2rem;">
            <div style="width: 40%; min-width: 250px;">
                ${config.totals.showSubtotal ? `
                <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee;">
                    <span>${config.totals.labels.subtotal || 'Base Imponible'}</span>
                    <span>${formatMoney(doc.baseTotal, settings.currency)}</span>
                </div>
                ` : ''}
                ${config.totals.showVatBreakdown ? `
                <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; font-size: 0.9rem; opacity: 0.8;">
                    <span>${config.totals.labels.vat || 'IVA'}</span>
                    <span>${formatMoney(doc.vatTotal, settings.currency)}</span>
                </div>
                ` : ''}
                ${doc.retentionTotal > 0 ? `
                <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; color: #d32f2f;">
                    <span>Retención IRPF</span>
                    <span>-${formatMoney(doc.retentionTotal, settings.currency)}</span>
                </div>
                ` : ''}
                ${config.totals.showTotal ? `
                <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 1.25rem; font-weight: bold; color: ${design.primaryColor}; border-top: 2px solid ${design.primaryColor}; margin-top: 5px;">
                    <span>${config.totals.labels.total || 'TOTAL'}</span>
                    <span>${formatMoney(doc.grandTotal, settings.currency)}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    const renderFooter = () => `
        <div style="border-top: 1px solid #eee; padding-top: 2rem; font-size: 0.8rem; color: #666;">
            ${config.footer.showBankDetails && settings?.iban ? `
                <div style="margin-bottom: 1rem;">
                    <strong>Datos de Pago:</strong><br/>
                    ${settings.bankName ? `${settings.bankName} - ` : ''}${settings.iban}<br/>
                    ${settings.swift ? `BIC/SWIFT: ${settings.swift}` : ''}
                </div>
            ` : ''}
            
            ${(doc.notes || template.defaultNotes) ? `
                <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-bottom: 1rem;">
                    <strong>Notas:</strong><br/>
                    ${replaceVariables(doc.notes || template.defaultNotes, context).replace(/\n/g, '<br/>')}
                </div>
            ` : ''}

            ${config.footer.thanksMessage ? `
                <div style="text-align: center; margin-top: 1.5rem; font-style: italic;">
                    ${replaceVariables(config.footer.thanksMessage, context)}
                </div>
            ` : ''}

            ${config.footer.terms ? `
                <div style="margin-top: 1.5rem; font-size: 0.7rem; text-align: justify; opacity: 0.7;">
                    ${replaceVariables(config.footer.terms, context)}
                </div>
            ` : ''}
        </div>
    `;

    const renderText = (block: any) => `
        <div style="margin-bottom: 1rem; text-align: ${block.styles?.align || 'left'}; font-size: ${block.styles?.fontSize === 'xl' ? '1.5em' : block.styles?.fontSize === 'lg' ? '1.25em' : block.styles?.fontSize === 'sm' ? '0.875em' : '1em'}; font-weight: ${block.styles?.bold ? 'bold' : 'normal'}; color: ${block.styles?.color === 'primary' ? design.primaryColor : block.styles?.color === 'secondary' ? design.secondaryColor : 'inherit'};">
            ${replaceVariables(block.content, context)}
        </div>
    `;

    const layoutNorm = normalizeLayout(config.layout);
    const blocksToRender = layoutNorm.length > 0 ? layoutNorm : [
        { type: 'header', id: 'h' },
        { type: 'client', id: 'c' },
        { type: 'lines', id: 'l' },
        { type: 'totals', id: 't' },
        { type: 'footer', id: 'f' }
    ];

    const bodyContent = blocksToRender.map((block: any) => {
        switch (block.type) {
            case 'header': return renderHeader();
            case 'client': return renderClient();
            case 'lines': return renderLines();
            case 'totals': return renderTotals();
            case 'footer': return renderFooter();
            case 'text': return renderText(block);
            case 'separator': return `<hr style="border: 0; border-top: 1px solid #ddd; margin: 2rem 0;">`;
            default: return '';
        }
    }).join('');

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
                body {
                    margin: 0;
                    padding: 40px;
                    background-color: white;
                    font-family: ${fontFamily};
                    color: ${design.textColor || '#333'};
                    font-size: ${design.fontSizeBase || 10}pt;
                    box-sizing: border-box;
                    width: 100%;
                }
                * { box-sizing: border-box; }
                ${design.background?.image ? `
                body::before {
                    content: "";
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-image: url('${design.background.image}');
                    background-size: ${design.background.mode === 'contain' ? 'contain' :
                design.background.mode === 'stretch' ? '100% 100%' :
                    design.background.mode === 'custom' ? `${design.background.scale || 100}%` :
                        'cover'
            };
                    background-repeat: ${design.background.mode === 'custom' ? 'repeat' : 'no-repeat'};
                    background-position: center;
                    opacity: ${design.background.opacity || 0.1};
                    z-index: -1;
                    pointer-events: none;
                }
                ` : ''}
            </style>
        </head>
        <body>
            ${bodyContent}
            ${settings.legalTerms && config.footer?.showLegalTerms ? `
                <div style="position: fixed; bottom: 10px; left: 40px; right: 40px; font-size: 8px; color: #999; text-align: justify;">
                    ${replaceVariables(settings.legalTerms, context)}
                </div>
            ` : ''}
        </body>
        </html>
    `;
};

// --- COMPONENT ---

interface DocumentHTMLPreviewProps {
    doc: Invoice | Quote;
    client: Contact;
    settings: CompanySettings;
    template: DocumentTemplate;
}

export const DocumentHTMLPreview: React.FC<DocumentHTMLPreviewProps> = ({ doc, client, settings, template }) => {
    const [previewHtml, setPreviewHtml] = useState<string>('');

    useEffect(() => {
        if (doc && settings) {
            const html = generateFullHtml(doc, client, settings, template);
            setPreviewHtml(html);
        }
    }, [doc, client, settings, template]);

    if (!previewHtml || previewHtml.length < 50) {
        return (
            <div className="w-full h-full min-h-[70vh] flex flex-col items-center justify-center bg-gray-50 border border-gray-200 rounded-lg text-gray-400">
                <AlertTriangle size={48} className="mb-4 opacity-30" />
                <p className="font-medium">No hay contenido para previsualizar.</p>
                <p className="text-xs mt-2">Verifique que los datos del documento y la plantilla son correctos.</p>
            </div>
        );
    }

    return (
        <div
            style={{
                width: '100%',
                minHeight: '70vh',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            <iframe
                title="Document Preview"
                srcDoc={previewHtml}
                style={{
                    width: '100%',
                    height: '100%',
                    flex: 1,
                    border: 'none',
                    backgroundColor: 'white',
                    display: 'block'
                }}
                sandbox="allow-same-origin"
            />
        </div>
    );
};