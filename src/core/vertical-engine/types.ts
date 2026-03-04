/**
 * vertical-engine/types.ts
 *
 * Type contracts for the ContikPro vertical plug-in system.
 *
 * A "vertical" is a product-specific module (e.g. "contikpro-legal",
 * "contikpro-realestate") that extends the Core without modifying it.
 * Verticals register themselves; Core discovers and activates them.
 *
 * Core guarantees:
 *   - registerVertical() is idempotent (safe to call multiple times)
 *   - Verticals cannot override Core routes or Core menu items
 *   - init() is called after DB is ready (never before dbReady === true)
 *   - Verticals are isolated — failure in one does not crash Core
 */

import type { ComponentType } from 'react';

// ─── Menu extension ───────────────────────────────────────────────────────────

export interface VerticalMenuItem {
  /** Unique key, must be prefixed with vertical id: "legal:contracts" */
  key:      string;
  label:    string;
  path:     string;
  /** Lucide icon name (string) or a React component */
  icon?:    string | ComponentType<{ size?: number; className?: string }>;
  /** Optional position hint; Core uses this for ordering */
  order?:   number;
  /** Optional badge (count, "new", etc.) */
  badge?:   string | number;
}

// ─── Route extension ──────────────────────────────────────────────────────────

export interface VerticalRoute {
  path:      string;
  component: ComponentType<object>;
  /** Wrap in Layout sidebar shell? Defaults to true */
  withLayout?: boolean;
}

// ─── Vertical descriptor ──────────────────────────────────────────────────────

export interface VerticalDescriptor {
  /** Globally unique id, e.g. "contikpro-legal" */
  id:      string;
  /** Display name shown in UI if needed */
  name:    string;
  /** Semver of this vertical */
  version: string;

  /** Menu items to inject into the Core sidebar */
  menu?:   VerticalMenuItem[];

  /** React routes to register in the Core router */
  routes?: VerticalRoute[];

  /**
   * Optional async init hook.
   * Called once after dbReady === true.
   * Use for: seeding default data, running migrations, loading config.
   * Must not throw — errors are caught and logged.
   */
  init?:   () => Promise<void>;
}

// ─── Engine events ────────────────────────────────────────────────────────────

export type VerticalEngineEvent =
  | { type: 'vertical:registered'; id: string }
  | { type: 'vertical:initialized'; id: string }
  | { type: 'vertical:error';       id: string; error: string };
