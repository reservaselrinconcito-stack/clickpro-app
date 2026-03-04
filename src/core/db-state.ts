/**
 * db-state.ts — Global DB ready state
 *
 * Single source of truth for whether the database is initialized and
 * safe to query. All hooks and services gate on this before any adapter call.
 *
 * Design: pure JS module (no React), imported anywhere without circular deps.
 * React hook is provided separately via useDbReady().
 *
 * HMR safety: on Vite hot-reload, the module re-evaluates, which would reset
 * _dbReady to false. We guard against this by checking a flag on `window`
 * that survives module re-evaluation.
 */

import { useState, useEffect } from 'react';

// ─── HMR-safe persistence ────────────────────────────────────────────────────
// window.__CONTIKPRO_DB_READY__ survives Vite HMR module re-evaluation.
// Only meaningful in browser; in SSR/tests it stays as module state.

declare global {
  interface Window {
    __CONTIKPRO_DB_READY__?: boolean;
  }
}

function getPersistedReady(): boolean {
  if (typeof window !== 'undefined' && window.__CONTIKPRO_DB_READY__ === true) {
    return true;
  }
  return false;
}

// ─── Core state ───────────────────────────────────────────────────────────────

let _dbReady: boolean = getPersistedReady();
const _listeners: Set<() => void> = new Set();

// Promise that resolves when DB becomes ready.
// If already ready on module init (e.g. after HMR), resolves immediately.
let _resolveReady!: () => void;
let _readyPromise: Promise<void> = _dbReady
  ? Promise.resolve()
  : new Promise<void>((resolve) => { _resolveReady = resolve; });

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the database adapter is fully initialized and responding.
 * Safe to call from any context (hooks, services, guards).
 */
export function isDbReady(): boolean {
  return _dbReady;
}

/**
 * Mark the database as ready. Called exactly once:
 * - In Tauri: by DataFolderSetup after invoke('init_data_folder') + verify()
 * - In web: by initAdapter() after DexieBridgeAdapter is set up
 *
 * Idempotent — subsequent calls are no-ops.
 */
export function setDbReady(val: boolean): void {
  if (val === _dbReady) return;

  _dbReady = val;

  if (typeof window !== 'undefined') {
    window.__CONTIKPRO_DB_READY__ = val;
  }

  if (val) {
    // Resolve the promise — all waitForDbReady() callers unblock
    _resolveReady?.();
    // Fire one-shot listeners
    _listeners.forEach(fn => {
      try { fn(); } catch (e) { console.error('[db-state] listener error:', e); }
    });
    _listeners.clear();
  }
}

/**
 * Returns a Promise that resolves when the DB is ready.
 * If already ready, resolves on the next microtask.
 * Safe to use in async functions that need to wait for DB.
 *
 * Usage:
 *   await waitForDbReady();
 *   const data = await adapter.query('invoices');
 */
export function waitForDbReady(): Promise<void> {
  if (_dbReady) return Promise.resolve();
  return _readyPromise;
}

/**
 * Register a one-shot callback that fires when DB becomes ready.
 * Returns an unsubscribe function (for cleanup in useEffect).
 *
 * If DB is already ready, callback fires on the next animation frame
 * to avoid synchronous state updates during React rendering.
 */
export function onDbReady(fn: () => void): () => void {
  if (_dbReady) {
    const id = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(id);
  }
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * useDbReady() — React hook that returns true once DB is fully ready.
 *
 * Components using this will re-render exactly once when the DB becomes ready.
 * Use this as the primary boot gate in App.tsx.
 *
 * Usage:
 *   const dbReady = useDbReady();
 *   if (!dbReady) return <LoadingScreen />;
 */
export function useDbReady(): boolean {
  const [ready, setReady] = useState<boolean>(_dbReady);

  useEffect(() => {
    // Check again inside effect — handles the case where DB became ready
    // between the useState initializer and when this effect runs (React 18 batching)
    if (_dbReady) {
      setReady(true);
      return;
    }
    const unsub = onDbReady(() => setReady(true));
    return unsub;
  }, []);

  return ready;
}

// ─── Dev/test utilities ───────────────────────────────────────────────────────

/**
 * Reset DB state. Only for tests or forced re-initialization.
 * Do NOT call in production code.
 */
export function _resetDbState(): void {
  _dbReady = false;
  if (typeof window !== 'undefined') {
    delete window.__CONTIKPRO_DB_READY__;
  }
  _listeners.clear();
  _readyPromise = new Promise<void>((resolve) => { _resolveReady = resolve; });
}
