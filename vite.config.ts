import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

// ─── Build mode detection ─────────────────────────────────────────────────────
//
// BUILD_TARGET=web  → web demo build (Dexie, Cloudflare Pages)
// default           → Tauri desktop build (SQLite)
//
// Set by:
//   npm run build:web  → cross-env BUILD_TARGET=web vite build
//   npm run build      → vite build (Tauri, called by tauri build)
//   npm run tauri:dev  → tauri dev (Tauri, no BUILD_TARGET)
//   npm run dev:web    → cross-env BUILD_TARGET=web vite dev

const isWebBuild = process.env.BUILD_TARGET === 'web';
const isTauriBuild = !isWebBuild;

export default defineConfig(({ command }) => ({
  root: '.',
  base: isWebBuild ? './' : '/',

  server: {
    // Tauri requires a fixed port. Web dev can use default (5173) or 3000.
    port: isTauriBuild ? 3000 : 5173,
    host: '0.0.0.0',
    strictPort: isTauriBuild, // Tauri needs strict port; web dev is flexible
  },

  plugins: [react()],

  define: {
    // ── Build-time constants ──────────────────────────────────────────────
    // __IS_TAURI__ enables dead-code elimination in the web bundle:
    // any `if (IS_TAURI) { ... }` block is eliminated by esbuild when false,
    // meaning DataFolderSetup and @tauri-apps/* are stripped from web output.
    '__IS_TAURI__': JSON.stringify(isTauriBuild),
    '__APP_VERSION__': JSON.stringify(pkg.version),
    '__BUILD_TIME__': JSON.stringify(new Date().toISOString()),
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Only suppress screen clearing in Tauri mode (so Rust logs are visible)
  clearScreen: !isTauriBuild,

  build: {
    outDir: isWebBuild ? 'dist-web' : 'dist',

    // Tauri uses modern Chromium → tight targets, smaller bundle
    // Web demo supports more browsers → slightly broader targets
    target: isTauriBuild
      ? ['es2021', 'chrome105', 'safari15']
      : ['es2020', 'chrome90', 'safari14', 'firefox90'],

    minify: command === 'build' && !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG || isWebBuild,

    rollupOptions: isWebBuild
      ? {
        // Web build: externalize ALL @tauri-apps/* packages.
        // They are never called at runtime (IS_TAURI=false guards all call sites),
        // but static imports in DataFolderSetup/DesktopBackup would still bundle
        // them. Externalizing means they are NOT included in the web bundle at all.
        // Since those components are guarded by IS_TAURI (build-time constant=false),
        // esbuild eliminates the component trees; the external declaration is a
        // belt-and-suspenders safety net.
        external: [/@tauri-apps\/.*/],
        output: {
          // If somehow a tauri import slips through, replace with a no-op at runtime
          globals: {
            '@tauri-apps/api/core': '__tauriStub',
          },
        },
      }
      : {},
  },
}));
