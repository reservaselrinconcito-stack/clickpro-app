import { EmailTemplate } from '../types';

/**
 * Generates an optimized plain text version of an email template for WhatsApp.
 * Converts blocks like headings, text, and buttons into WhatsApp-compatible formatting.
 */
export function generateWhatsAppText(template: EmailTemplate, variables: Record<string, string>): string {
    const blocks = template.blocks || [];

    // 1. Process blocks into an array of text sections
    const sections: string[] = [];

    blocks.forEach(block => {
        const content = block.content || '';

        switch (block.type) {
            case 'heading':
                // Headings are converted to UPPERCASE BOLD
                sections.push(`*${content.toUpperCase()}*`);
                break;

            case 'text':
                // Regular text is kept as is
                if (content.trim()) {
                    sections.push(content);
                }
                break;

            case 'divider':
                // Dividers are converted to a decorative line
                sections.push('──────────');
                break;

            case 'button':
                // Buttons show a label and the link with an emoji
                const buttonLabel = block.content || 'Ver documento';
                const buttonLink = block.href || '#';
                sections.push(`[${buttonLabel}]\n👉 ${buttonLink}`);
                break;

            case 'spacer':
                // Spacers are handled by the joining logic (adding an empty line)
                // but we can add an explicit entry if needed.
                break;

            case 'image':
                // Images are ignored as WhatsApp text doesn't support inline images
                break;

            default:
                break;
        }
    });

    // 2. Join sections with double newlines for a clean look
    let finalOutput = sections.join('\n\n');

    // 3. Perform Variable Replacement with WhatsApp specific adaptations
    Object.entries(variables).forEach(([key, value]) => {
        let processedValue = value;

        // Special handling for specific variables
        if (key === 'doc_total') {
            // Strip HTML like <b>€</b>
            processedValue = value.replace(/<[^>]*>?/gm, '');
        } else if (key === 'doc_fecha') {
            // Ensure format is clean (the app usually provides DD/MM/YYYY, but we ensure no HTML)
            processedValue = value.replace(/<[^>]*>?/gm, '');
        } else if (key === 'doc_link') {
            // Force new line for link to trigger preview
            processedValue = `\n${value.trim()}`;
        }

        const regex = new RegExp(`{{${key}}}`, 'g');
        finalOutput = finalOutput.replace(regex, processedValue);
    });

    // 4. Cleanup: remove any remaining {{...}} tags that weren't replaced
    finalOutput = finalOutput.replace(/{{[^{}]*}}/g, '');

    return finalOutput.trim();
}
