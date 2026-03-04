# ContikPro Core — Deployment Guide

## Two build targets, one codebase

### Desktop (primary product)
```bash
npm run tauri:dev          # development with hot-reload
npm run tauri:build        # production .app / .exe / .deb installer
```
- Uses: Rust + SQLite + full filesystem access
- Data stored in: `<chosen folder>/ContikProData/contikpro.sqlite`
- Backups in: `<chosen folder>/ContikProData/backups/`

---

### Web Demo (secondary — Cloudflare Pages)
```bash
npm run dev:web            # local web dev server on port 5173
npm run build:web          # production static build → dist/
npm run preview:web        # preview the dist/ build locally
```
- Uses: Dexie (IndexedDB) — fully in-browser, no server needed
- Deploy to Cloudflare Pages:
  - Build command: `npm run build:web`
  - Build output directory: `dist`
  - Node version: 20

No `@tauri-apps/*` code is included in the web bundle.
No SQLite, no filesystem, no Rust references.

---

## Environment detection

| Constant       | Tauri dev/build | Web dev/build |
|----------------|-----------------|---------------|
| `__IS_TAURI__` | `true`          | `false`       |
| `IS_TAURI`     | `true`          | `false`       |
| `IS_WEB`       | `false`         | `true`        |

`BUILD_TARGET=web` is set by `cross-env` in `build:web` and `dev:web` scripts.
When unset (default), Tauri mode is assumed.

---

## What gets bundled per mode

| File / Module              | Desktop bundle | Web bundle |
|----------------------------|:--------------:|:----------:|
| `sqlite.ts` + `@tauri-apps`| ✅             | ❌ (DCE'd) |
| `DataFolderSetup.tsx`      | ✅ (lazy)      | ❌ (DCE'd) |
| `DesktopBackup.tsx`        | ✅ (lazy)      | ❌ (DCE'd) |
| `dexie-bridge.ts` + Dexie  | ❌ (DCE'd)     | ✅         |

Dead-code elimination (DCE) is performed by esbuild/Rollup because
`IS_TAURI` is a **build-time constant** (`true` or `false`), not a
runtime variable. Unreachable branches are stripped entirely.
