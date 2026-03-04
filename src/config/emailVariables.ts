
export interface EmailVariable {
    label: string;
    key: string;
    description: string;
}

export const EMAIL_VARIABLES: EmailVariable[] = [
    { label: 'Cliente nombre', key: '{{cliente_nombre}}', description: 'Nombre completo del destinatario' },
    { label: 'Número documento', key: '{{doc_numero}}', description: 'Número de factura o presupuesto' },
    { label: 'Total', key: '{{doc_total}}', description: 'Importe total con impuestos' },
    { label: 'Fecha', key: '{{doc_fecha}}', description: 'Fecha de emisión del documento' },
    { label: 'Enlace documento', key: '{{doc_link}}', description: 'URL para descargar el PDF' },
    { label: 'Logo empresa', key: '{{logo_url}}', description: 'URL del logotipo de la empresa' },
];
