/**
 * db-adapter/index.ts — Adapter bootstrap
 *
 * Environment → adapter routing:
 *
 *   IS_TAURI = true  →  SQLiteAdapter (dynamic import — never bundled in web)
 *   IS_TAURI = false →  DexieBridgeAdapter (dynamic import — never bundled in desktop)
 *
 * Phase 2 guarantee: Dexie is behind a dynamic import that only executes
 * when IS_TAURI === false. In Tauri builds (IS_TAURI=true at compile-time),
 * the Dexie branch is dead code and the dynamic import is never reached.
 *
 * Phase 1 guarantee: IS_TAURI comes from the single source of truth in
 * environment.ts — no scattered window.__TAURI_INTERNALS__ checks here.
 *
 * HMR safety: SQLiteAdapter instance persisted on window across module
 * re-evaluations during Vite hot-reload.
 */

export * from './interface';
export * from './useQuery';

// ─── Phase 1: centralized environment ────────────────────────────────────────
import { IS_TAURI } from '../environment';
export { IS_TAURI };

import type { SQLiteAdapter } from './sqlite';
import { setAdapter, getAdapter as _getAdapter, IDbAdapter } from './interface';
import { setDbReady, isDbReady } from '../db-state';

// ─── HMR-safe adapter ref ─────────────────────────────────────────────────────
declare global {
  interface Window {
    __CONTIKPRO_SQLITE_ADAPTER__?: SQLiteAdapter;
  }
}

let _initialized = false;

/**
 * initAdapter() — call once at app boot (index.tsx).
 *
 * Tauri:   dynamic-imports SQLiteAdapter → no Dexie code in bundle.
 *          Does NOT set dbReady — DataFolderSetup does that after verify().
 *
 * Web:     dynamic-imports DexieBridgeAdapter → no sqlite/tauri code in bundle.
 *          Sets dbReady immediately — IndexedDB is always available.
 */
export async function initAdapter(): Promise<IDbAdapter> {
  if (_initialized) return _getAdapter();

  if (IS_TAURI) {
    // ── Phase 2 hard guard ────────────────────────────────────────────────
    // Dynamic import means sqlite.ts (and its @tauri-apps/api/core import)
    // is NEVER loaded in web builds. Vite/Rollup will not include this chunk
    // in the web bundle because the import() call is unreachable (IS_TAURI=false
    // is a compile-time constant → dead-code eliminated).
    const { SQLiteAdapter } = await import('./sqlite');

    console.log('[ContikPro] Tauri mode — SQLiteAdapter');

    // Reuse adapter across HMR re-evaluations
    let adapter: SQLiteAdapter =
      (typeof window !== 'undefined' && window.__CONTIKPRO_SQLITE_ADAPTER__)
      || new SQLiteAdapter();

    if (typeof window !== 'undefined') {
      window.__CONTIKPRO_SQLITE_ADAPTER__ = adapter;
    }

    // Re-sync ready state after HMR
    if (isDbReady() && !adapter.isReady()) {
      adapter.markReady();
    }

    setAdapter(adapter);
    _initialized = true;
    // ⚠️  dbReady stays false — DataFolderSetup calls setDbReady(true) after verify()
    return adapter;
  }

  // ── Phase 2: Dexie only loads in web/browser mode ────────────────────────
  // This dynamic import is the ONLY place Dexie is ever loaded.
  console.log('[ContikPro] Web mode — DexieBridgeAdapter');
  const [{ DexieBridgeAdapter }, { db: dexieDb }] = await Promise.all([
    import('./dexie-bridge'),
    import('../../../db'),
  ]);

  const adapter = new DexieBridgeAdapter(dexieDb);
  setAdapter(adapter);
  _initialized = true;
  setDbReady(true);
  return adapter;
}

/**
 * Returns the SQLiteAdapter instance (Tauri only).
 * Used by DataFolderSetup for verify() + markReady().
 */
export function getSQLiteAdapter(): SQLiteAdapter | null {
  if (!IS_TAURI) return null;
  return (typeof window !== 'undefined'
    ? window.__CONTIKPRO_SQLITE_ADAPTER__
    : null) ?? null;
}

export { _getAdapter as getAdapter };
