
export type EmailTheme = 'corporate' | 'minimal' | 'dark-light';

export interface ThemeColors {
    primaryColor: string;
    headingFontSize: number;
    headingBold: boolean;
    textColor: string;
    backgroundColor: string;
}

export const THEME_DEFAULTS: Record<EmailTheme, ThemeColors> = {
    corporate: {
        primaryColor: '#2563eb',
        headingFontSize: 22,
        headingBold: true,
        textColor: '#475569',
        backgroundColor: '#ffffff'
    },
    minimal: {
        primaryColor: '#000000',
        headingFontSize: 20,
        headingBold: false,
        textColor: '#1f2937',
        backgroundColor: '#ffffff'
    },
    'dark-light': {
        primaryColor: '#1e293b',
        headingFontSize: 24,
        headingBold: true,
        textColor: '#334155',
        backgroundColor: '#f8fafc'
    }
};
