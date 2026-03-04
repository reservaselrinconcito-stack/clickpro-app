/**
 * version.ts — App version constants.
 *
 * Single source for all version-related values.
 * Sourced from package.json at build time via vite.config.ts defines.
 *
 * ALIGNMENT RULE: Keep in sync with:
 *   package.json       → "version": "x.y.z"
 *   src-tauri/tauri.conf.json → "version": "x.y.z"
 *   src-tauri/Cargo.toml     → version = "x.y.z"
 *
 * Phase 5: SCHEMA_VERSION must be incremented when any migration is added
 * to src-tauri/src/lib.rs. Never decrement.
 */

/** Semantic version from package.json (injected at build time). */
export const APP_VERSION: string = __APP_VERSION__;

/** ISO 8601 build timestamp (injected at build time). */
export const BUILD_TIME: string = __BUILD_TIME__;

/**
 * Current SQLite schema version.
 *
 * This MUST be incremented whenever a new migration block is added to
 * `run_migrations()` in src-tauri/src/lib.rs.
 *
 * History:
 *   1 — Initial schema (all base tables + schema_meta)
 */
export const SCHEMA_VERSION = 1;

/** Formatted build date for display in UI. */
export const BUILD_DATE: string = (() => {
  try {
    return new Date(BUILD_TIME).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return BUILD_TIME;
  }
})();
