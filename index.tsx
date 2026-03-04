import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initAdapter } from '@/core/db-adapter';
import { APP_VERSION } from '@/version';

import { loadVerticalModules, registerVertical } from './src/core/vertical-engine';
import { peluqueriaVertical } from './src/verticals/peluqueria/descriptor';
// ─── Boot sequence ────────────────────────────────────────────────────────────
//
// Boot errors (initAdapter failure, missing root element) are caught here
// and rendered as a safe inline fallback — the ErrorBoundary inside App
// only catches render-phase errors, not imperative boot errors.

async function boot(): Promise<void> {
  const bootId = Math.random().toString(36).substring(7);
  console.log(`[ClickPro] 🚀 Boot init — ID:${bootId} — v${APP_VERSION}`);

  try {
    // Timeout-guarded adapter initialization
    const adapterPromise = initAdapter();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('initAdapter timeout (10s)')), 10000)
    );

    console.log(`[ClickPro] [${bootId}] Initializing adapter...`);
    await Promise.race([adapterPromise, timeoutPromise]);
    console.log(`[ClickPro] [${bootId}] Adapter initialized!`);

    try {
      registerVertical(peluqueriaVertical as any);
      await loadVerticalModules();
      console.log(`[ClickPro] [${bootId}] Verticals loaded!`);
    } catch (e) {
      console.warn(`[ClickPro] [${bootId}] Vertical load failed (continuing):`, e);
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ClickPro] [${bootId}] Boot failed at initAdapter:`, msg);
    renderBootError(`Error al inicializar el adaptador de datos: ${msg}`);
    return;
  }

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error(`[ClickPro] [${bootId}] Root element not found!`);
    renderBootError('Elemento #root no encontrado en el DOM.');
    return;
  }

  console.log(`[ClickPro] [${bootId}] Mounting React tree...`);
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log(`[ClickPro] [${bootId}] React tree mounted!`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ClickPro] [${bootId}] React mount failed:`, msg);
    renderBootError(`Error crítico al montar la interfaz: ${msg}`);
  }
}

/** Renders a minimal error screen when the full React tree can't mount. */
function renderBootError(message: string): void {
  const root = document.getElementById('root') ?? document.body;
  root.innerHTML = `
    <div style="
      min-height:100vh; display:flex; align-items:center; justify-content:center;
      background:#f9fafb; font-family:system-ui,sans-serif; padding:2rem;
    ">
      <div style="
        background:#fff; border:1px solid #fee2e2; border-radius:1rem;
        padding:2rem; max-width:480px; width:100%; box-shadow:0 4px 24px rgba(0,0,0,.08);
      ">
        <div style="
          width:3rem; height:3rem; background:#fef2f2; border-radius:.75rem;
          display:flex; align-items:center; justify-content:center; margin-bottom:1rem;
        ">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#dc2626" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <h1 style="font-size:1.125rem;font-weight:700;color:#991b1b;margin:0 0 .5rem">
          ClickPro no pudo iniciarse
        </h1>
        <p style="font-size:.875rem;color:#6b7280;margin:0 0 1.5rem">${message}</p>
        <p style="font-size:.75rem;color:#9ca3af;margin:0 0 1rem">
          v${APP_VERSION}
        </p>
        <button
          onclick="window.location.reload()"
          style="
            width:100%; padding:.625rem 1rem; background:#2563eb; color:#fff;
            border:none; border-radius:.75rem; font-size:.875rem; font-weight:600;
            cursor:pointer;
          "
        >Reintentar</button>
      </div>
    </div>
  `;
}

boot().catch(err => {
  console.error('[ClickPro] Unhandled boot error:', err);
  renderBootError(err instanceof Error ? err.message : 'Error desconocido en el arranque.');
});
