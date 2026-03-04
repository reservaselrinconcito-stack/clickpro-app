# ContikPro Core — Architecture & Stability Reference

> Version: 2.0.0 | Schema: v1 | Last updated: 2026-02

This document is the **canonical reference** for everyone working on ContikPro Core
or building verticals on top of it. Read this before touching anything.

---

## 1. What this is

ContikPro Core is a **local-first desktop application** built with:

- **Tauri v2** — native desktop shell (Rust backend, Webview frontend)
- **SQLite** — all data stored on the user's machine, never in the cloud
- **React 19 + Vite 6** — frontend
- **db-adapter abstraction** — storage engine is swappable without touching UI

It also ships a **web demo** (Dexie/IndexedDB) for marketing/onboarding, built from
the same codebase using `npm run build:web`.

---

## 2. Module Map

```
contikpro-core/
├── src/
│   ├── core/
│   │   ├── environment.ts          ← SINGLE SOURCE: IS_TAURI, IS_WEB, IS_DEV
│   │   ├── db-state.ts             ← DB ready gate (useDbReady hook)
│   │   ├── adapter-api.ts          ← High-level typed API (contacts, invoices…)
│   │   ├── db-adapter/
│   │   │   ├── interface.ts        ← IDbAdapter contract + event bus
│   │   │   ├── index.ts            ← Environment routing + initAdapter()
│   │   │   ├── sqlite.ts           ← Tauri invoke bridge (desktop only)
│   │   │   ├── dexie-bridge.ts     ← Dexie wrapper (web only)
│   │   │   └── useQuery.ts         ← Reactive query hook
│   │   └── vertical-engine/
│   │       ├── index.ts            ← registerVertical, extendMenu, extendRoutes
│   │       └── types.ts            ← VerticalDescriptor, VerticalMenuItem, etc.
│   ├── version.ts                  ← APP_VERSION, BUILD_TIME, SCHEMA_VERSION
│   ├── pages/                      ← Route-level components
│   ├── components/                 ← Shared UI components
│   └── services/
│       └── backupService.ts        ← Unified backup API (desktop + web)
├── components/
│   └── ErrorBoundary.tsx           ← Global React crash protection
├── src-tauri/src/lib.rs            ← Rust backend: SQLite, migrations, commands
├── vite.config.ts                  ← BUILD_TARGET routing (__IS_TAURI__ constant)
└── ARCHITECTURE.md                 ← You are here
```

---

## 3. Environment Detection — The One True Way

**Always** import from `@/core/environment`. Never check `window.__TAURI_INTERNALS__` directly.

```typescript
import { IS_TAURI, IS_WEB, IS_DEV, MODE_LABEL } from '@/core/environment';
```

`IS_TAURI` is a **build-time constant** (`__IS_TAURI__` injected by Vite).
When `false`, esbuild dead-code-eliminates all Tauri imports from the web bundle.

| Constant     | Tauri dev/build | Web dev/build |
|--------------|:---------------:|:-------------:|
| `IS_TAURI`   | `true`          | `false`       |
| `IS_WEB`     | `false`         | `true`        |
| `IS_DEV`     | `true` / `false`| `true` / `false`|

---

## 4. Data Access — Always Through the Adapter

**Never** call `invoke()` directly from UI components or services.
**Never** import Dexie outside `src/core/db-adapter/dexie-bridge.ts`.

```typescript
// ✅ Correct
import { contactsApi } from '@/core/adapter-api';
const contacts = await contactsApi.all();

// ✅ Also correct (low-level)
import { getAdapter } from '@/core/db-adapter';
const adapter = getAdapter();
const items = await adapter.query('contacts');

// ❌ WRONG — bypasses adapter, breaks web mode, breaks tests
import { invoke } from '@tauri-apps/api/core';
const items = await invoke('db_query', { table: 'contacts' });
```

### Desktop-only components must be lazy-loaded

If a component has static `@tauri-apps/*` imports, it **must** be lazy:

```typescript
const DataFolderSetup = IS_TAURI
  ? React.lazy(() => import('@/components/DataFolderSetup'))
  : null;
```

When `IS_TAURI = false` (web build), this resolves to `null` at compile time and
the entire component tree is eliminated from the web bundle.

---

## 5. DB Ready Gate

The app has a strict boot sequence:

```
initAdapter()
  ↓
  IS_TAURI=true:  SQLiteAdapter created (not ready)
                  DataFolderSetup shown
                  → invoke('init_data_folder') → Rust opens .sqlite
                  → adapter.verify() → test query
                  → adapter.markReady()
                  → setDbReady(true)
                  → App mounts routes

  IS_TAURI=false: DexieBridgeAdapter created
                  → setDbReady(true) immediately
                  → App mounts routes
```

**`useDbReady()`** — the single React hook for the boot gate:
```typescript
const ready = useDbReady();
if (!ready) return <LoadingScreen />;
```

**`useQuery()`** — never fires before `dbReady = true`:
```typescript
const invoices = useQuery(
  () => invoicesApi.all(),  // query function
  [],                        // deps
  ['invoices'],              // tables to watch
) ?? [];
```

---

## 6. Schema & Migrations

SQLite schema version is tracked in `schema_meta(id, version, applied_at)`.

**To add a migration:**

1. Add an `if current_version < N { ... }` block in `run_migrations()` in `src-tauri/src/lib.rs`
2. Increment `CURRENT_SCHEMA_VERSION` in `lib.rs`
3. Increment `SCHEMA_VERSION` in `src/version.ts`
4. Update the migration history comment in both files

```rust
// lib.rs — example migration 2
if current_version < 2 {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute_batch("ALTER TABLE contacts ADD COLUMN tags TEXT;")?;
    tx.execute(
        "UPDATE schema_meta SET version = 2, applied_at = ?1 WHERE id = 1",
        params![Utc::now().timestamp_millis()],
    )?;
    tx.commit()?;
    current_version = 2;
    log::info!("[ContikPro] Migration 2 applied");
}
```

`run_migrations()` is called from `open_db()` — runs on every launch, idempotent.

---

## 7. Backup & Recovery

```
Desktop backup flow:
  backupNow()
    → Rust create_backup
    → VACUUM INTO 'backups/contikpro_backup_YYYYMMDD_HHMMSS.sqlite'
    → Atomic, consistent SQLite snapshot

Desktop recovery flow:
  init_data_folder
    → open_db → PRAGMA integrity_check
    → if not "ok": drop conn → fs::copy(latest_backup) → reopen
    → DataFolderSetup shows amber recovery notice

Web backup flow:
  backupNow()
    → JSON export of all adapter tables
    → Browser download
```

Never call Rust backup commands directly. Use the unified service:
```typescript
import { backupNow, listDesktopBackups } from '@/services/backupService';
```

---

## 8. Vertical Engine

Verticals extend Core without modifying it:

```typescript
// In a vertical's entry point
import { registerVertical } from '@/core/vertical-engine';

registerVertical({
  id:      'contikpro-legal',
  name:    'Legal',
  version: '1.0.0',
  menu: [
    { key: 'legal:contracts', label: 'Contratos', path: '/legal/contracts', order: 100 },
  ],
  routes: [
    { path: '/legal/contracts', component: ContractsPage },
  ],
  init: async () => { /* seed data, run migrations */ },
});
```

In App.tsx, inject after DB ready:
```typescript
const extraMenu   = extendMenu();    // → Sidebar
const extraRoutes = extendRoutes();  // → Router
```

A failing vertical `init()` is caught and logged — Core never crashes.

---

## 9. Error Boundary

`<ErrorBoundary>` wraps all routes in `App.tsx`. It:
- Shows a safe recovery UI with the error message and stack
- Provides "Try again" (reset), "Copy error" (clipboard), and "Reload" buttons
- Logs structured output to console with app version
- Can be narrowed with `context` prop: `<ErrorBoundary context="Settings">`

---

## 10. Version Alignment

When bumping the app version, update **all four** locations:

| File | Field |
|------|-------|
| `package.json` | `"version": "x.y.z"` |
| `src-tauri/tauri.conf.json` | `"version": "x.y.z"` |
| `src-tauri/Cargo.toml` | `version = "x.y.z"` |
| `src/version.ts` | `SCHEMA_VERSION` (only if schema changed) |

Version is displayed in Settings → Sistema → Información de versión.

---

## 11. Build Commands

| Command | Output | Mode |
|---------|--------|------|
| `npm run tauri:dev` | Hot-reload desktop | SQLite |
| `npm run tauri:build` | Installer (.dmg / .exe / .deb) | SQLite |
| `npm run dev:web` | Web dev server :5173 | Dexie |
| `npm run build:web` | `dist/` static files | Dexie |
| `npm run typecheck` | TS type check (desktop) | — |
| `npm run typecheck:web` | TS type check (web) | — |

---

## 12. Absolute Rules

These must never be violated:

1. **No `invoke()` outside `src/core/db-adapter/sqlite.ts`** and guarded desktop components
2. **No Dexie imports outside `src/core/db-adapter/dexie-bridge.ts`**
3. **No direct environment detection** — use `environment.ts` only
4. **No UI access before `dbReady = true`** — `useQuery` enforces this
5. **No architecture redesign** — only additive vertical extensions
6. **SCHEMA_VERSION and CURRENT_SCHEMA_VERSION must stay in sync** across Rust and TS
7. **Desktop-only components must be lazy-loaded** behind `IS_TAURI` guards
