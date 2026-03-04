
import jsPDF from 'jspdf';
import { Invoice, CompanySettings, Contact, Quote, DocumentTemplate, TemplateBlock } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { normalizeLayout } from '../src/lib/layoutUtils';

// Helper to simulate currency formatting
const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);
};

// Helper for hex colors
const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

// Resolve Paths
const resolvePath = (path: string, obj: any) => path.split('.').reduce((prev, curr) => prev ? prev[curr] : null, obj);

// Variable Replacer
const replaceVariables = (text: string, context: any) => {
    if (!text) return '';
    return text.replace(/{{([^}]+)}}/g, (match, path) => {
        const value = resolvePath(path.trim(), context);
        if (value instanceof Date) return value.toLocaleDateString();
        return value !== null && value !== undefined ? String(value) : match;
    });
};

export type PDFGeneratorOptions = {
    action: 'download' | 'print' | 'blob';
    showGuides?: boolean;
};

export const generateDocumentPDF = (
    doc: Invoice | Quote,
    client: Contact,
    settings: CompanySettings,
    template: DocumentTemplate,
    options: PDFGeneratorOptions | 'download' | 'print' | 'blob' = 'download'
): string | void => {
    const pdf = new jsPDF();
    const { config } = template;
    const layout = normalizeLayout(config.layout);
    const action = typeof options === 'string' ? options : options.action;
    const showGuides = typeof options === 'object' ? options.showGuides : false;

    // -- CONTEXT FOR VARIABLES --
    const context = {
        doc: {
            ...doc,
            date: new Date(doc.date).toLocaleDateString(),
            dueDate: doc.dueDate ? new Date(doc.dueDate).toLocaleDateString() : '',
            total: formatCurrency(doc.grandTotal, settings.currency)
        },
        client,
        company: settings
    };

    // -- CONFIGURATION --
    const margin = 20;
    const pageWidth = 210;
    const pageHeight = 297;
    const contentWidth = pageWidth - (margin * 2);
    let y = margin;

    // Set Font
    const fontMap: any = { 'helvetica': 'helvetica', 'times': 'times', 'courier': 'courier' };
    const fontName = fontMap[config.design.font] || 'helvetica';
    const baseFontSize = config.design.fontSizeBase || 10;
    const primaryColor = hexToRgb(config.design.primaryColor);
    const secondaryColor = hexToRgb(config.design.secondaryColor);

    pdf.setFont(fontName);

    // --- HELPERS ---

    const drawBackground = () => {
        const bg = config.design.background;
        if (bg && bg.image) {
            try {
                pdf.setGState(new (pdf as any).GState({ opacity: bg.opacity || 0.1 }));
            } catch (e) { }

            const mode = bg.mode || 'cover';
            let imgW = pageWidth;
            let imgH = pageHeight;
            let imgX = 0;
            let imgY = 0;

            try {
                const props = pdf.getImageProperties(bg.image);
                const imgRatio = props.width / props.height;
                const pageRatio = pageWidth / pageHeight;

                if (mode === 'contain') {
                    if (imgRatio > pageRatio) {
                        imgW = pageWidth;
                        imgH = imgW / imgRatio;
                        imgY = (pageHeight - imgH) / 2;
                    } else {
                        imgH = pageHeight;
                        imgW = imgH * imgRatio;
                        imgX = (pageWidth - imgW) / 2;
                    }
                } else if (mode === 'cover') {
                    if (imgRatio > pageRatio) {
                        imgH = pageHeight;
                        imgW = imgH * imgRatio;
                        imgX = (pageWidth - imgW) / 2;
                    } else {
                        imgW = pageWidth;
                        imgH = imgW / imgRatio;
                        imgY = (pageHeight - imgH) / 2;
                    }
                }
            } catch (e) { }

            pdf.addImage(bg.image, 'PNG', imgX, imgY, imgW, imgH, undefined, 'FAST');
            try {
                pdf.setGState(new (pdf as any).GState({ opacity: 1.0 }));
            } catch (e) { }
        }
    };

    const drawGuideRect = (x: number, y: number, w: number, h: number, label: string, color: [number, number, number]) => {
        if (!showGuides) return;
        pdf.setDrawColor(color[0], color[1], color[2]);
        pdf.setLineWidth(0.1);
        pdf.setLineDash([1, 1], 0);
        pdf.rect(x, y, w, h);

        pdf.setTextColor(color[0], color[1], color[2]);
        pdf.setFontSize(6);
        pdf.setFont('helvetica', 'normal');
        pdf.text(label, x + 1, y + 2);

        pdf.setLineDash([], 0);
        pdf.setTextColor(0, 0, 0);
    };

    const drawPageGuides = () => {
        if (!showGuides) return;
        pdf.setDrawColor(255, 0, 0);
        pdf.setLineWidth(0.1);
        pdf.setLineDash([3, 3], 0);
        pdf.rect(margin, margin, contentWidth, pageHeight - (margin * 2));
        pdf.setTextColor(255, 0, 0);
        pdf.setFontSize(6);
        pdf.text("ÁREA SEGURA (A4)", margin + 2, margin - 2);
        pdf.setDrawColor(255, 100, 0);
        pdf.line(0, 270, pageWidth, 270);
        pdf.text("LÍMITE SALTO DE PÁGINA SUGERIDO", 5, 269);
        pdf.setLineDash([], 0);
        pdf.setTextColor(0, 0, 0);
    };

    const renderTextBlock = (block: TemplateBlock, manualY?: number) => {
        if (!block.content) return;

        const content = replaceVariables(block.content, context);

        // Setup Style
        const fontSizeVal = block.styles?.fontSize === 'xl' ? baseFontSize + 6 : block.styles?.fontSize === 'lg' ? baseFontSize + 4 : block.styles?.fontSize === 'sm' ? baseFontSize - 2 : baseFontSize;
        pdf.setFontSize(fontSizeVal);
        pdf.setFont(fontName, block.styles?.bold ? 'bold' : 'normal');

        if (block.styles?.color === 'primary') pdf.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
        else if (block.styles?.color === 'secondary') pdf.setTextColor(secondaryColor.r, secondaryColor.g, secondaryColor.b);
        else pdf.setTextColor(0, 0, 0);

        // Positioning Logic
        if (block.positioning === 'absolute' && block.coords) {
            const { x, y, w } = block.coords;
            const align = block.styles?.align || 'left';
            // For absolute text, align relative to the provided width box
            const textX = align === 'center' ? x + (w || 50) / 2 : align === 'right' ? x + (w || 50) : x;
            const splitText = pdf.splitTextToSize(content, w || 100);
            pdf.text(splitText, textX, y, { align: align as any });
            drawGuideRect(x, y, w || 50, splitText.length * 5, "ABS TEXT", [100, 0, 100]);
        } else {
            // Relative Flow
            const currentY = manualY !== undefined ? manualY : y;
            const align = block.styles?.align || 'left';
            const x = align === 'center' ? pageWidth / 2 : align === 'right' ? pageWidth - margin : margin;

            const splitText = pdf.splitTextToSize(content, contentWidth);
            pdf.text(splitText, x, currentY, { align: align as any });

            const h = (splitText.length * (fontSizeVal * 0.3527)) + 5;
            drawGuideRect(margin, currentY - (fontSizeVal * 0.3527), contentWidth, h, "REL TEXT", [100, 100, 100]);

            if (manualY === undefined) y += h;
        }
    };

    const drawRepeatedElements = () => {
        layout.filter(b => b.repeat).forEach(block => {
            if (block.type === 'text') {
                renderTextBlock(block);
            }
        });
    };

    // --- INITIAL PAGE ---
    drawBackground();
    drawRepeatedElements();
    drawPageGuides();

    const getCompanyDetails = () => {
        const details: string[] = [];
        if (settings.fiscalName) details.push(settings.fiscalName);
        if (settings.nif) details.push(`NIF: ${settings.nif}`);
        const addr = [settings.address, settings.zip, settings.city, settings.province, settings.country].filter(Boolean).join(', ');
        if (addr) details.push(addr);
        const contact = [settings.email, settings.phone, settings.website].filter(Boolean).join(' | ');
        if (contact) details.push(contact);
        return details;
    };

    // --- MAIN RENDER LOOP ---
    layout.forEach(block => {
        if (block.repeat) return;

        if (block.positioning === 'absolute') {
            if (block.type === 'text') {
                renderTextBlock(block);
            }
            return;
        }

        // Check for overflow
        if (y > 270 && block.type !== 'pagebreak') {
            pdf.addPage();
            drawBackground();
            drawRepeatedElements();
            drawPageGuides();
            y = margin;
        }

        switch (block.type) {
            case 'header': {
                const startY = 0;
                const drawHeader = () => {
                    if (config.design.headerStyle === 'modern' || config.design.headerStyle === 'bold') {
                        pdf.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
                        pdf.rect(0, 0, pageWidth, 50, 'F');
                        pdf.setTextColor(255, 255, 255);
                    } else {
                        pdf.setTextColor(0, 0, 0);
                    }

                    const alignment = config.design.headerAlignment || 'left';
                    let logoW = 40; let logoH = 20;
                    if (config.design.logoSize === 'S') { logoW = 25; logoH = 12; }
                    if (config.design.logoSize === 'M') { logoW = 40; logoH = 20; }
                    if (config.design.logoSize === 'L') { logoW = 60; logoH = 30; }

                    let curY = y;

                    if (alignment === 'center') {
                        if (config.header.showLogo && settings.logo) {
                            try {
                                pdf.addImage(settings.logo, 'PNG', (pageWidth - logoW) / 2, curY, logoW, logoH, undefined, 'FAST');
                                curY += logoH + 5;
                            } catch (e) { }
                        }
                        if (config.header.showCompanyDetails) {
                            if (!config.header.showLogo && settings.companyName) {
                                pdf.setFontSize(baseFontSize + 10);
                                pdf.setFont(fontName, 'bold');
                                pdf.text(settings.companyName, pageWidth / 2, curY + 8, { align: 'center' });
                                curY += 15;
                            }
                            pdf.setFontSize(baseFontSize - 1);
                            pdf.setFont(fontName, 'normal');
                            getCompanyDetails().forEach(line => {
                                pdf.text(line, pageWidth / 2, curY, { align: 'center' });
                                curY += 4;
                            });
                        }
                        curY += 10;
                        const docTitle = config.header.customTitle || (template.type === 'invoice' ? 'FACTURA' : 'PRESUPUESTO');
                        pdf.setFontSize(baseFontSize + 14);
                        pdf.setFont(fontName, 'bold');
                        pdf.text(docTitle, pageWidth / 2, curY, { align: 'center' });
                        curY += 8;
                        pdf.setFontSize(baseFontSize);
                        pdf.setFont(fontName, 'normal');
                        pdf.text(`${doc.number} | ${new Date(doc.date).toLocaleDateString()}`, pageWidth / 2, curY, { align: 'center' });
                        y = curY + 15;
                    } else {
                        const companyX = alignment === 'left' ? margin : pageWidth - margin;
                        const companyAlign = alignment;
                        const metaX = alignment === 'left' ? pageWidth - margin : margin;
                        const metaAlign = alignment === 'left' ? 'right' : 'left';

                        if (config.header.showLogo && settings.logo) {
                            const logoX = alignment === 'left' ? margin : pageWidth - margin - logoW;
                            try {
                                pdf.addImage(settings.logo, 'PNG', logoX, curY, logoW, logoH, undefined, 'FAST');
                                curY += logoH + 5;
                            } catch (e) { }
                        } else if (!config.header.showLogo && settings.companyName) {
                            pdf.setFontSize(baseFontSize + 10);
                            pdf.setFont(fontName, 'bold');
                            pdf.text(settings.companyName, companyX, curY + 8, { align: companyAlign });
                            curY += 15;
                        }

                        if (config.header.showCompanyDetails) {
                            pdf.setFontSize(baseFontSize - 1);
                            pdf.setFont(fontName, 'normal');
                            getCompanyDetails().forEach(line => {
                                pdf.text(line, companyX, curY, { align: companyAlign });
                                curY += 4;
                            });
                        }
                        const companyBottomY = curY;
                        curY = y;
                        const docTitle = config.header.customTitle || (template.type === 'invoice' ? 'FACTURA' : 'PRESUPUESTO');
                        pdf.setFontSize(baseFontSize + 14);
                        pdf.setFont(fontName, 'bold');
                        pdf.text(docTitle, metaX, curY + 8, { align: metaAlign });
                        curY += 12;
                        if (config.header.slogan) {
                            pdf.setFontSize(baseFontSize);
                            pdf.text(config.header.slogan, metaX, curY, { align: metaAlign });
                            curY += 8;
                        }
                        pdf.setFontSize(baseFontSize);
                        pdf.setFont(fontName, 'normal');
                        pdf.text(`Número: ${doc.number}`, metaX, curY, { align: metaAlign });
                        curY += 5;
                        pdf.text(`Fecha: ${new Date(doc.date).toLocaleDateString()}`, metaX, curY, { align: metaAlign });
                        curY += 5;
                        y = Math.max(companyBottomY, curY) + 15;
                    }
                    pdf.setTextColor(0, 0, 0);
                };
                drawHeader();
                drawGuideRect(0, startY, pageWidth, y - startY, "ZONA HEADER", [0, 0, 255]);
                break;
            }

            case 'client': {
                const startY = y;
                pdf.setFontSize(baseFontSize);
                pdf.setFont(fontName, 'bold');
                pdf.setTextColor(secondaryColor.r, secondaryColor.g, secondaryColor.b);
                pdf.text(config.client.label, margin, y);
                y += 5;
                pdf.setTextColor(0, 0, 0);
                pdf.setFont(fontName, 'bold');
                pdf.text(client.name, margin, y);
                y += 5;
                pdf.setFont(fontName, 'normal');
                if (config.client.showVat) {
                    pdf.text(client.nif, margin, y);
                    y += 5;
                }
                if (config.client.showAddress) {
                    pdf.text(`${client.address}`, margin, y);
                    y += 5;
                    pdf.text(`${client.zip} ${client.city}`, margin, y);
                    y += 5;
                    if (client.province || client.country) {
                        pdf.text(`${client.province} ${client.country}`, margin, y);
                        y += 5;
                    }
                }
                drawGuideRect(margin, startY, contentWidth, y - startY + 2, "ZONA CLIENTE", [0, 128, 0]);
                y += 10;
                break;
            }

            case 'lines': {
                const startY = y;
                const activeCols = config.columns;
                const colDefs = [
                    { id: 'desc', header: 'Descripción', width: 0, align: 'left' },
                    { id: 'qty', header: 'Cant.', width: 15, align: 'right', enabled: activeCols.quantity },
                    { id: 'unit', header: 'Ud.', width: 15, align: 'right', enabled: activeCols.unit },
                    { id: 'price', header: 'Precio', width: 25, align: 'right', enabled: activeCols.price },
                    { id: 'discount', header: 'Desc.%', width: 15, align: 'right', enabled: activeCols.discount },
                    { id: 'vat', header: 'IVA%', width: 15, align: 'right', enabled: activeCols.vat },
                    { id: 'total', header: 'Total', width: 25, align: 'right', enabled: activeCols.total },
                ].filter(c => c.id === 'desc' || c.enabled);

                const fixedWidth = colDefs.reduce((acc, c) => acc + (c.width || 0), 0);
                const descCol = colDefs.find(c => c.id === 'desc');
                if (descCol) descCol.width = contentWidth - fixedWidth;

                pdf.setFillColor(secondaryColor.r, secondaryColor.g, secondaryColor.b);
                pdf.setFillColor(245, 245, 245);
                pdf.rect(margin, y - 6, contentWidth, 8, 'F');
                pdf.setFont(fontName, 'bold');
                pdf.setTextColor(0, 0, 0);

                let currentX = margin;
                colDefs.forEach(col => {
                    const textX = col.align === 'right' ? currentX + col.width - 2 : currentX + 2;
                    pdf.text(col.header, textX, y - 1, { align: col.align as any });
                    currentX += col.width;
                });
                y += 4;

                pdf.setFont(fontName, 'normal');
                doc.lines.forEach((line) => {
                    const lineTotal = line.quantity * line.price * (1 - (line.discountPct || 0) / 100);
                    const descWidth = (descCol?.width || 100) - 4;
                    const splitDesc = pdf.splitTextToSize(line.description, descWidth);
                    const rowHeight = Math.max(6, splitDesc.length * 5);

                    if (y + rowHeight > 270) {
                        pdf.addPage();
                        drawBackground();
                        drawRepeatedElements();
                        drawPageGuides();
                        y = 20;
                    }

                    let rowX = margin;
                    colDefs.forEach(col => {
                        const textX = col.align === 'right' ? rowX + col.width - 2 : rowX + 2;
                        if (col.id === 'desc') pdf.text(splitDesc, textX, y);
                        else if (col.id === 'qty') pdf.text(line.quantity.toString(), textX, y, { align: 'right' });
                        else if (col.id === 'unit') pdf.text(line.unit || '', textX, y, { align: 'right' });
                        else if (col.id === 'price') pdf.text(formatCurrency(line.price, settings.currency), textX, y, { align: 'right' });
                        else if (col.id === 'discount') pdf.text(line.discountPct ? `${line.discountPct}%` : '-', textX, y, { align: 'right' });
                        else if (col.id === 'vat') pdf.text(`${line.vatPct}%`, textX, y, { align: 'right' });
                        else if (col.id === 'total') pdf.text(formatCurrency(lineTotal, settings.currency), textX, y, { align: 'right' });
                        rowX += col.width;
                    });
                    y += rowHeight + 2;
                });
                drawGuideRect(margin, startY - 6, contentWidth, y - startY + 6, "ZONA LÍNEAS", [255, 165, 0]);
                y += 5;
                break;
            }

            case 'totals': {
                const startY = y;
                const totalsWidth = 70;
                const totalsX = pageWidth - margin - totalsWidth;
                const breakdown: Record<number, number> = {};
                doc.lines.forEach(l => {
                    const base = l.quantity * l.price * (1 - (l.discountPct || 0) / 100);
                    const rate = l.vatPct || 0;
                    breakdown[rate] = (breakdown[rate] || 0) + base;
                });

                if (config.totals.showVatBreakdown && Object.keys(breakdown).length > 0) {
                    pdf.setFontSize(baseFontSize - 2);
                    pdf.setTextColor(100);
                    pdf.text('Desglose Impuestos', pageWidth - margin, y, { align: 'right' });
                    y += 4;
                    Object.entries(breakdown).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0])).forEach(([rate, base]) => {
                        const vatAmount = base * (parseFloat(rate) / 100);
                        pdf.text(`${parseFloat(rate)}% IVA sobre ${formatCurrency(base, settings.currency)}: ${formatCurrency(vatAmount, settings.currency)}`, pageWidth - margin, y, { align: 'right' });
                        y += 4;
                    });
                    y += 2;
                }

                pdf.setFontSize(baseFontSize);
                pdf.setTextColor(0);
                if (config.totals.showSubtotal) {
                    pdf.setFont(fontName, 'normal');
                    pdf.text(config.totals.labels.subtotal, totalsX, y);
                    pdf.text(formatCurrency(doc.baseTotal, settings.currency), pageWidth - margin, y, { align: 'right' });
                    y += 5;
                }
                pdf.text(config.totals.labels.vat, totalsX, y);
                pdf.text(formatCurrency(doc.vatTotal, settings.currency), pageWidth - margin, y, { align: 'right' });
                y += 5;
                if (doc.retentionTotal > 0) {
                    pdf.text('Retención IRPF (-)', totalsX, y);
                    pdf.text(formatCurrency(doc.retentionTotal, settings.currency), pageWidth - margin, y, { align: 'right' });
                    y += 5;
                }
                if (config.totals.showTotal) {
                    y += 2;
                    pdf.setFontSize(baseFontSize + 2);
                    pdf.setFont(fontName, 'bold');
                    pdf.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
                    pdf.text(config.totals.labels.total, totalsX, y);
                    pdf.text(formatCurrency(doc.grandTotal, settings.currency), pageWidth - margin, y, { align: 'right' });
                }
                drawGuideRect(totalsX - 5, startY, totalsWidth + 5, y - startY + 5, "ZONA TOTALES", [128, 0, 128]);
                y += 15;
                break;
            }

            case 'footer': {
                const startY = y;
                pdf.setTextColor(0);
                pdf.setFontSize(baseFontSize - 1);
                pdf.setFont(fontName, 'normal');
                if (config.footer.showBankDetails && settings.iban) {
                    pdf.setFont(fontName, 'bold');
                    pdf.text('Datos de Pago:', margin, y);
                    y += 4;
                    pdf.setFont(fontName, 'normal');
                    pdf.text(`${settings.bankName || 'Banco'} - IBAN: ${settings.iban}`, margin, y);
                    if (settings.swift) { y += 4; pdf.text(`SWIFT/BIC: ${settings.swift}`, margin, y); }
                    y += 8;
                }
                if (doc.notes) {
                    pdf.setFont(fontName, 'bold');
                    pdf.text('Notas / Términos:', margin, y);
                    y += 4;
                    pdf.setFont(fontName, 'normal');
                    const splitNotes = pdf.splitTextToSize(replaceVariables(doc.notes, context), contentWidth);
                    pdf.text(splitNotes, margin, y);
                    y += (splitNotes.length * 4) + 8;
                }
                if (config.footer.terms) {
                    const splitTerms = pdf.splitTextToSize(replaceVariables(config.footer.terms, context), contentWidth);
                    pdf.text(splitTerms, margin, y);
                    y += (splitTerms.length * 4) + 8;
                }
                if (config.footer.thanksMessage) pdf.text(replaceVariables(config.footer.thanksMessage, context), margin, y);

                if (config.footer.showSignature) {
                    const sigY = y;
                    pdf.line(pageWidth - margin - 50, sigY, pageWidth - margin, sigY);
                    pdf.setFontSize(8);
                    pdf.text('Firma y Sello', pageWidth - margin - 25, sigY + 4, { align: 'center' });
                }
                drawGuideRect(margin, startY, contentWidth, Math.min(y - startY + 10, pageHeight - startY), "ZONA FOOTER", [0, 128, 128]);
                break;
            }

            case 'text': {
                renderTextBlock(block);
                break;
            }

            case 'separator': {
                const h = block.styles?.height === 'lg' ? 40 : block.styles?.height === 'sm' ? 10 : 20;
                if (block.styles?.line) {
                    pdf.setDrawColor(200, 200, 200);
                    pdf.setLineWidth(0.1);
                    pdf.line(margin, y + (h / 2), pageWidth - margin, y + (h / 2));
                }
                drawGuideRect(margin, y, contentWidth, h, "SEPARADOR", [200, 200, 200]);
                y += h;
                break;
            }

            case 'pagebreak': {
                pdf.addPage();
                drawBackground();
                drawRepeatedElements();
                drawPageGuides();
                y = margin;
                break;
            }
        }
    });

    // Legal Terms (Bottom Fixed)
    if (settings.legalTerms && (config.footer.showLegalTerms ?? true)) {
        const pageHeight = pdf.internal.pageSize.height;
        pdf.setFontSize(7);
        pdf.setTextColor(150);
        const splitLegal = pdf.splitTextToSize(replaceVariables(settings.legalTerms, context), contentWidth);
        const legalY = pageHeight - 15 - (splitLegal.length * 3);
        pdf.text(splitLegal, margin, legalY);
        drawGuideRect(margin, legalY, contentWidth, (splitLegal.length * 3) + 2, "LEGAL (FIXED BOTTOM)", [100, 100, 100]);
    }

    if (action === 'print') {
        pdf.autoPrint();
        window.open(pdf.output('bloburl'), '_blank');
    } else if (action === 'blob') {
        return pdf.output('bloburl');
    } else {
        pdf.save(`${doc.number}.pdf`);
    }
};
