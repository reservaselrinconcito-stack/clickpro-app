import { peluqueriaVertical } from '../../verticals/peluqueria/descriptor';
/**
 * vertical-engine/index.ts
 *
 * Phase 7 — ContikPro Core Vertical Engine
 *
 * Allows future vertical products to plug into Core without modifying Core code.
 * Core stays generic; verticals are additive.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │                     ARCHITECTURE                            │
 * │                                                             │
 * │  ContikPro Core                                             │
 * │    └─ vertical-engine (this file)                           │
 * │         ├─ registerVertical(descriptor)                     │
 * │         ├─ loadVerticalModules() → VerticalDescriptor[]     │
 * │         ├─ extendMenu()          → VerticalMenuItem[]       │
 * │         └─ extendRoutes()        → VerticalRoute[]          │
 * │                                                             │
 * │  Vertical products (separate packages, loaded at runtime)   │
 * │    ├─ @contikpro/legal   → registerVertical({...})         │
 * │    ├─ @contikpro/realty  → registerVertical({...})         │
 * │    └─ @contikpro/clinic  → registerVertical({...})         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * USAGE (from a vertical's entry point):
 *
 *   import { registerVertical } from '@contikpro/core/vertical-engine';
 *
 *   registerVertical({
 *     id:      'contikpro-legal',
 *     name:    'Legal',
 *     version: '1.0.0',
 *     menu: [
 *       { key: 'legal:contracts', label: 'Contratos', path: '/legal/contracts', order: 100 },
 *     ],
 *     routes: [
 *       { path: '/legal/contracts', component: ContractsPage },
 *     ],
 *     init: async () => {
 *       // Seed default contract templates, run migrations, etc.
 *     },
 *   });
 *
 * USAGE (from App.tsx to get all extensions):
 *
 *   const extraMenu   = extendMenu();    // injected into <Sidebar>
 *   const extraRoutes = extendRoutes();  // injected into <Routes>
 */

import type {
  VerticalDescriptor,
  VerticalMenuItem,
  VerticalRoute,
  VerticalEngineEvent,
} from './types';

// ─── Registry ─────────────────────────────────────────────────────────────────

const _registry = new Map<string, VerticalDescriptor>();
const _eventListeners = new Set<(e: VerticalEngineEvent) => void>();

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a vertical with Core.
 *
 * - Idempotent: re-registering the same id overwrites the previous entry.
 * - Safe to call before dbReady — init() is deferred until DB is ready.
 * - Does not call init() — call loadVerticalModules() to trigger init hooks.
 */
export function registerVertical(descriptor: VerticalDescriptor): void {
  if (!descriptor.id || !descriptor.name) {
    console.error('[vertical-engine] registerVertical: missing required fields (id, name)');
    return;
  }

  const isUpdate = _registry.has(descriptor.id);
  _registry.set(descriptor.id, descriptor);

  _emit({ type: 'vertical:registered', id: descriptor.id });

  if (isUpdate) {
    console.log(`[vertical-engine] ↺ Updated vertical: ${descriptor.id} v${descriptor.version}`);
  } else {
    console.log(`[vertical-engine] ✓ Registered vertical: ${descriptor.id} v${descriptor.version}`);
  }
}

// ─── Module loading ───────────────────────────────────────────────────────────

/**
 * Initialize all registered verticals.
 *
 * Call this AFTER dbReady === true (from App.tsx or index.tsx).
 * Each vertical's init() hook is run sequentially so they can depend on each other.
 * Errors are caught and logged — a failing vertical does not crash Core.
 *
 * Returns the list of successfully loaded verticals.
 */
export async function loadVerticalModules(): Promise<VerticalDescriptor[]> {
  const loaded: VerticalDescriptor[] = [
  peluqueriaVertical,
];

  for (const [id, v] of _registry) {
    if (v.init) {
      try {
        await v.init();
        _emit({ type: 'vertical:initialized', id });
        console.log(`[vertical-engine] ✓ Initialized: ${id}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        _emit({ type: 'vertical:error', id, error });
        console.error(`[vertical-engine] ✗ Init failed for ${id}:`, error);
        // Continue — do not crash Core for one failing vertical
        continue;
      }
    }
    loaded.push(v);
  }

  return loaded;
}

// ─── Extension points ─────────────────────────────────────────────────────────

/**
 * Get all menu items contributed by registered verticals.
 *
 * Returns items sorted by `order` (ascending), then by label alphabetically.
 * Core Sidebar calls this to inject vertical menu entries.
 */
export function extendMenu(): VerticalMenuItem[] {
  const items: VerticalMenuItem[] = [];

  for (const v of _registry.values()) {
    if (v.menu) {
      items.push(...v.menu);
    }
  }

  return items.sort((a, b) => {
    const orderDiff = (a.order ?? 999) - (b.order ?? 999);
    return orderDiff !== 0 ? orderDiff : a.label.localeCompare(b.label);
  });
}

/**
 * Get all routes contributed by registered verticals.
 *
 * Core App.tsx calls this to inject vertical pages into the React Router.
 * Core routes always take precedence — verticals cannot override them.
 */
export function extendRoutes(): VerticalRoute[] {
  const routes: VerticalRoute[] = [];

  for (const v of _registry.values()) {
    if (v.routes) {
      routes.push(...v.routes);
    }
  }

  return routes;
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

/**
 * Returns a snapshot of the current registry for debugging / settings UI.
 */
export function getRegisteredVerticals(): VerticalDescriptor[] {
  return Array.from(_registry.values());
}

/**
 * Returns true if a vertical with the given id is registered.
 */
export function isVerticalRegistered(id: string): boolean {
  return _registry.has(id);
}

// ─── Event bus ────────────────────────────────────────────────────────────────

/**
 * Subscribe to vertical engine events.
 * Returns an unsubscribe function.
 */
export function onVerticalEvent(
  handler: (e: VerticalEngineEvent) => void,
): () => void {
  _eventListeners.add(handler);
  return () => _eventListeners.delete(handler);
}

function _emit(event: VerticalEngineEvent): void {
  _eventListeners.forEach(fn => {
    try { fn(event); } catch { /* listeners must not crash the engine */ }
  });
}

// ─── Re-export types ──────────────────────────────────────────────────────────

export type { VerticalDescriptor, VerticalMenuItem, VerticalRoute, VerticalEngineEvent };
