# ContikPro Core — Desktop App

Aplicación de escritorio local. Datos en SQLite físico. Sin servidores, sin internet.

## Requisitos previos

```bash
# Rust (todas las plataformas)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Linux
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

# macOS — Xcode tools
xcode-select --install
```

## Arranque

```bash
npm install
npm run tauri:dev
```

Primera vez: selector de carpeta de datos. Se crea `ContikProData/contikpro.sqlite`.

## Build

```bash
npm run tauri:build
# → src-tauri/target/release/bundle/
```

## Arquitectura

```
UI Pages → src/core/db-adapter → Tauri Rust → contikpro.sqlite
```

- `src/core/db-adapter/interface.ts`  — IDbAdapter + event bus
- `src/core/db-adapter/sqlite.ts`     — SQLiteAdapter (Tauri invoke)
- `src/core/db-adapter/dexie-bridge.ts` — Bridge para dev web
- `src/core/db-adapter/useQuery.ts`   — Hook reactivo (≈useLiveQuery)
- `src-tauri/src/lib.rs`              — Comandos Rust SQLite

## CORE_MODE: sin SaaS

- Sin autenticación
- Sin cloud sync
- Sin Stripe
- Sin workers remotos
- 100% offline
