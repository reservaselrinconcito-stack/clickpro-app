
/**
 * Normalizes a header string for better matching.
 * Removes accents, special chars, spaces and converts to lowercase.
 */
export const normalizeHeader = (header: string): string => {
    return header
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9]/g, "") // Remove everything else
        .trim();
};

/**
 * Common heuristic for matching headers to internal fields.
 */
export const matchHeuristic = (header: string, fieldKey: string, fieldLabel: string): boolean => {
    const normH = normalizeHeader(header);
    const normK = normalizeHeader(fieldKey);
    const normL = normalizeHeader(fieldLabel);

    if (normH === normK || normH === normL) return true;

    // Advanced heuristics
    const synonyms: Record<string, string[]> = {
        name: ['nombre', 'razonsocial', 'client', 'company', 'empresa', 'cliente'],
        taxId: ['nif', 'cif', 'tax', 'vat', 'identificacion', 'dni'],
        email: ['correo', 'e-mail', 'mail'],
        phone: ['telefono', 'tel', 'mobile', 'movil', 'phone'],
        address: ['direccion', 'address', 'calle', 'domicilio'],
        city: ['poblacion', 'ciudad', 'city', 'localidad'],
        zip: ['codigopostal', 'cp', 'zip', 'postalcode'],
        country: ['pais', 'country', 'nacion'],
        number: ['numero', 'num', 'ref', 'id'],
        date: ['fecha', 'dia'],
        total: ['importe', 'base', 'monto', 'total', 'precio', 'amount'],
        description: ['concepto', 'descripcion', 'description', 'detalle'],
    };

    const targetSynonyms = synonyms[fieldKey] || [];
    return targetSynonyms.some(s => normH.includes(normalizeHeader(s)));
};
