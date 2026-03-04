/**
 * environment.ts — Single source of truth for environment detection.
 *
 * Every file that needs to know "are we in Tauri?" imports from here.
 * No scattered window.__TAURI_INTERNALS__ checks allowed elsewhere.
 *
 * Detection strategy (two layers):
 *
 *   1. Build-time: __IS_TAURI__ injected by vite.config.ts
 *      - Tauri dev/build:  __IS_TAURI__ = true
 *      - Web build/dev:    __IS_TAURI__ = false
 *      - Enables dead code elimination — unused branches are stripped from
 *        the web bundle, including all @tauri-apps/* imports behind them.
 *
 *   2. Runtime fallback: window.__TAURI_INTERNALS__
 *      - Guards against edge cases (HMR, misconfigured build).
 *      - Evaluated only when the build-time constant isn't set.
 *
 * USAGE:
 *   import { IS_TAURI, IS_WEB, IS_DEV } from '@/core/environment';
 */

// Build-time constant — injected by vite.config.ts
// TypeScript declaration lives in src/env.d.ts
declare const __IS_TAURI__: boolean;

// Runtime detection — used as fallback when build constant not available
const _runtimeTauri: boolean =
  typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

/**
 * true  when running inside the Tauri desktop shell (SQLite mode).
 * false when running in a browser (Dexie/IndexedDB mode).
 *
 * Determined at module load time — never changes during app lifetime.
 */
export const IS_TAURI: boolean =
  (typeof __IS_TAURI__ !== 'undefined' ? __IS_TAURI__ : false) || _runtimeTauri;

/**
 * true when running in a browser without Tauri (web demo / marketing).
 * Dexie bridge adapter is active.
 */
export const IS_WEB: boolean = !IS_TAURI;

/**
 * true during Vite dev server (both tauri dev and web dev).
 * false in production builds.
 */
export const IS_DEV: boolean = (import.meta as any).env?.DEV ?? false;

/**
 * Human-readable mode label for UI display.
 */
export const MODE_LABEL: string = IS_TAURI ? 'Desktop' : 'Web';

/**
 * true when running in demo mode (e.g. from the landing page via ?demo=1).
 * Used to trigger seeded data and read-only UI.
 */
export const IS_DEMO: boolean =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).get('demo') === '1' ||
    new URLSearchParams(window.location.hash.split('?')[1]).get('demo') === '1');

/**
 * Default seed for deterministic random data in demo mode.
 */
export const DEMO_SEED: string =
  (typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('seed') ||
      new URLSearchParams(window.location.hash.split('?')[1]).get('seed'))) ||
  'contikpro';

/**
 * true if the UI should be in read-only mode.
 */
export const IS_READONLY: boolean =
  IS_DEMO ||
  (typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('readonly') === '1' ||
      new URLSearchParams(window.location.hash.split('?')[1]).get('readonly') === '1'));
