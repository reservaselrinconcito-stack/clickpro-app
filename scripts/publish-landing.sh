#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ContikPro Core — Publicar landing a Cloudflare Pages
#
# Uso:
#   npm run publish:landing
#   ./scripts/publish-landing.sh
#
# Garantías:
#   - Limpia dist-web y copia contenido de public/landing
#   - Copia _headers, _redirects y downloads si existen
#   - Falla con error claro si no existe public/landing
#   - Requiere wrangler autenticado: npx wrangler login
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAGES_PROJECT="contikpro-core"
WEB_DIST="$PROJECT_ROOT/dist-landing"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ContikPro Core — Publicar Landing Estática          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

cd "$PROJECT_ROOT"

# ── 1. Preparar dist-web/ ─────────────────────────────────────────────────────
echo "▶ [1/3] Limpiando y preparando dist-web/…"
rm -rf "$WEB_DIST"
mkdir -p "$WEB_DIST"

# ── 2. Copiar archivos estáticos ──────────────────────────────────────────────
echo "▶ [2/3] Copiando landing y assets a dist-web/…"

if [ ! -d "public/landing" ]; then
  echo "❌ Error: La carpeta public/landing no existe."
  exit 1
fi

# Copiar contenido de la landing estática
cp -a "public/landing/." "$WEB_DIST/"

# Copiar _headers y _redirects si existen (para config de Cloudflare)
if [ -f "public/_headers" ]; then
  cp "public/_headers" "$WEB_DIST/"
  echo "   ✅ _headers copiado."
fi
if [ -f "public/_redirects" ]; then
  cp "public/_redirects" "$WEB_DIST/"
  echo "   ✅ _redirects copiado."
fi

# Copiar DMGs si existen
DMG_COUNT=0
if [ -d "public/downloads" ]; then
  mkdir -p "$WEB_DIST/downloads"
  cp -a "public/downloads/." "$WEB_DIST/downloads/" 2>/dev/null || true
  DMG_COUNT=$(find "$WEB_DIST/downloads" -name "*.dmg" 2>/dev/null | wc -l | tr -d ' ')
fi

if [[ "$DMG_COUNT" -eq 0 ]]; then
  echo "⚠️  AVISO: No se encontraron DMGs en public/downloads/."
  echo "   La URL /downloads/*.dmg dará 404 en Pages."
else
  echo "   ✅ DMGs en dist-web/downloads/: $DMG_COUNT archivo(s)"
fi

echo "   dist-web/ preparado."

# ── 3. Deploy a Cloudflare Pages ──────────────────────────────────────────────
echo "▶ [3/3] Desplegando a Cloudflare Pages (proyecto: $PAGES_PROJECT)…"
export WRANGLER_HOME="$PROJECT_ROOT/.wrangler"
export XDG_CONFIG_HOME="$PROJECT_ROOT/.config"
export XDG_CACHE_HOME="$PROJECT_ROOT/.cache"
mkdir -p "$WRANGLER_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
npx wrangler pages deploy "$WEB_DIST" --project-name "$PAGES_PROJECT"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  ✅ Landing publicado:"
echo "  https://${PAGES_PROJECT}.pages.dev"
if [[ "$DMG_COUNT" -gt 0 ]]; then
  VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "VERSION")
  echo ""
  echo "  URL descarga (x86_64):"
  echo "  https://${PAGES_PROJECT}.pages.dev/downloads/ContikPro-Core_${VERSION}_x86_64-apple-darwin.dmg"
fi
echo "══════════════════════════════════════════════════════"
echo ""
