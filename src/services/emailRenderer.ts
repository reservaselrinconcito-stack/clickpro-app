
import { EmailTemplate, EmailTemplateBlock } from '../../types';
import { THEME_DEFAULTS } from '../config/emailThemes';

/**
 * Generates an email-compatible HTML string from a block-based template.
 * Uses <table> based layout and inline styles for maximum compatibility.
 */
export function generateEmailHtml(template: EmailTemplate, variables: Record<string, string>): string {
    const blocks = template.blocks || [];
    const themeKey = template.theme || 'corporate';
    const theme = THEME_DEFAULTS[themeKey];

    // 2. Generate content blocks
    let contentHtml = '';

    blocks.forEach(block => {
        let blockHtml = '';
        const styles = block.styles || {};
        const align = styles.align || 'left';
        const color = styles.color || theme.textColor;
        const isHeading = block.type === 'heading';
        const fontSize = styles.fontSize || (isHeading ? theme.headingFontSize : 16);
        const paddingY = styles.paddingY !== undefined ? styles.paddingY : 10;
        const paddingX = styles.paddingX !== undefined ? styles.paddingX : 20;
        const isBold = styles.bold !== undefined ? styles.bold : (isHeading ? theme.headingBold : false);

        const cellStyle = `padding: ${paddingY}px ${paddingX}px; text-align: ${align}; border-collapse: collapse;`;

        switch (block.type) {
            case 'heading':
                blockHtml = `
                    <tr>
                        <td style="${cellStyle}">
                            <h1 style="margin: 0; color: ${color}; font-size: ${fontSize}px; font-weight: ${isBold ? 'bold' : 'normal'}; line-height: 1.2;">
                                ${block.content || ''}
                            </h1>
                        </td>
                    </tr>
                `;
                break;

            case 'text':
                blockHtml = `
                    <tr>
                        <td style="${cellStyle}">
                            <div style="margin: 0; color: ${color}; font-size: ${fontSize}px; line-height: 1.5; font-weight: ${isBold ? 'bold' : 'normal'};">
                                ${block.content?.replace(/\n/g, '<br>') || ''}
                            </div>
                        </td>
                    </tr>
                `;
                break;

            case 'button':
                blockHtml = `
                    <tr>
                        <td align="${align}" style="${cellStyle}">
                            <table border="0" cellspacing="0" cellpadding="0" style="display: inline-table;">
                                <tr>
                                    <td align="center" bgcolor="${styles.background || theme.primaryColor}" style="border-radius: 6px;">
                                        <a href="${block.href || '#'}" target="_blank" style="font-size: ${fontSize}px; font-family: Helvetica, Arial, sans-serif; color: ${styles.color || '#ffffff'}; text-decoration: none; border-radius: 6px; padding: ${paddingY}px ${paddingX}px; border: 1px solid ${styles.background || theme.primaryColor}; display: inline-block; font-weight: 600; min-width: 140px;">
                                            ${block.content || 'Botón'}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                `;
                break;

            case 'divider':
                blockHtml = `
                    <tr>
                        <td style="padding: ${paddingY}px 0; border-collapse: collapse;">
                            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 0; width: 100%;">
                        </td>
                    </tr>
                `;
                break;

            case 'spacer':
                blockHtml = `
                    <tr>
                        <td style="height: ${paddingY}px; line-height: ${paddingY}px; font-size: 0px; border-collapse: collapse;">&nbsp;</td>
                    </tr>
                `;
                break;

            case 'image':
                blockHtml = `
                    <tr>
                        <td align="${align}" style="${cellStyle}">
                            <img src="${block.href || ''}" alt="Email visual" style="display: block; max-width: 100%; height: auto; border: 0; outline: none; text-decoration: none; margin: 0 auto; border-radius: 8px;">
                        </td>
                    </tr>
                `;
                break;
        }
        contentHtml += blockHtml;
    });

    // 3. Assemble full HTML
    let finalHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <!--[if mso]>
    <style>
        * { font-family: sans-serif !important; }
    </style>
    <![endif]-->
    <title>${template.subject}</title>
</head>
<body style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly; background-color: #f4f7fa;">
    <center style="width: 100%; background-color: #f4f7fa;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 auto;">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <!--[if mso]>
                    <table align="center" border="0" cellspacing="0" cellpadding="0" width="600">
                    <tr>
                    <td align="center" valign="top" width="600">
                    <![endif]-->
                    <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin: 0 auto;">
                        <tr>
                            <td height="4" style="background: linear-gradient(to right, #2563eb, #4f46e5); font-size: 0; line-height: 0;">&nbsp;</td>
                        </tr>
                        ${contentHtml}
                        <tr>
                            <td height="40" style="font-size: 0; line-height: 0;">&nbsp;</td>
                        </tr>
                    </table>
                    <!--[if mso]>
                    </td>
                    </tr>
                    </table>
                    <![endif]-->
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
    `.trim();

    // 4. Variable Replacement
    Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        finalHtml = finalHtml.replace(regex, value);
    });

    return finalHtml;
}
