/**
 * app-config.ts — Core application configuration
 *
 * Centralizes branding and feature flags so the app can be white-labeled
 * or specialized per vertical without changing scattered hardcoded strings.
 *
 * Override at runtime by calling setAppConfig() during boot,
 * or by providing a config.json file in the data folder.
 */

// ─── Branding ─────────────────────────────────────────────────────────────────

export interface AppBranding {
  /** Short display name, e.g. "Contigo" */
  appName: string;
  /** Full product name, e.g. "Contigo — Gestión para peluquerías" */
  appFullName: string;
  /** Primary color hex used in UI accents */
  primaryColor: string;
  /** URL to app logo (optional) */
  logoUrl?: string;
  /** Support email shown in error screens */
  supportEmail?: string;
  /** Landing page / marketing URL */
  marketingUrl?: string;
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

export interface FeatureFlags {
  /** Core accounting + invoicing module (always true) */
  accounting: boolean;
  /** Peluquería vertical: calendar, reservations, professionals */
  peluqueria: boolean;
  /** Web editor / publisher module */
  webEditor: boolean;
  /** Notification inbox (inbox messages + reservations) */
  inbox: boolean;
  /** Email sending features */
  emailSending: boolean;
  /** VeriFactu (Spain e-invoicing compliance) */
  verifactu: boolean;
}

// ─── App Config ───────────────────────────────────────────────────────────────

export interface AppConfig {
  branding: AppBranding;
  features: FeatureFlags;
  /** Active vertical identifier, used for sector-specific labels */
  activeVertical: 'none' | 'peluqueria' | 'obra' | 'electricidad' | string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AppConfig = {
  branding: {
    appName: 'Contigo',
    appFullName: 'Contigo — Gestión empresarial',
    primaryColor: '#6366f1',
    supportEmail: 'soporte@contigo.app',
    marketingUrl: 'https://contigo.app',
  },
  features: {
    accounting: true,
    peluqueria: true,  // enable peluquería vertical
    webEditor: true,
    inbox: true,
    emailSending: true,
    verifactu: true,
  },
  activeVertical: 'peluqueria',
};

// ─── Singleton ────────────────────────────────────────────────────────────────

let _config: AppConfig = { ...DEFAULT_CONFIG };

/** Replace config at boot time (e.g. loaded from settings table) */
export function setAppConfig(partial: Partial<AppConfig>) {
  _config = {
    ..._config,
    ...partial,
    branding: { ..._config.branding, ...partial.branding },
    features: { ..._config.features, ...partial.features },
  };
}

export function getAppConfig(): AppConfig {
  return _config;
}

export function getFeature(flag: keyof FeatureFlags): boolean {
  return _config.features[flag];
}

export function getBranding(): AppBranding {
  return _config.branding;
}
