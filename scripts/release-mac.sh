#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ContikPro Core — Release pipeline macOS
#
# Uso:
#   ./scripts/release-mac.sh                    # build x86_64 (Intel/Rosetta)
#   ./scripts/release-mac.sh --arm64            # build aarch64 (Apple Silicon)
#   ./scripts/release-mac.sh --universal        # build universal (fat binary)
#
# Requisitos:
#   - Rust + cargo instalado (rustup)
#   - Target añadido: rustup target add x86_64-apple-darwin
#   - Node.js ≥ 18, npm instalado
#   - Cloudflare wrangler: npm install -g wrangler (solo para --publish)
#
# Variables de entorno opcionales:
#   SKIP_INSTALL=1   → salta npm install (si ya tienes node_modules)
#   PUBLISH=1        → despliega landing a Cloudflare Pages tras el build
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Guard: con "set -u" cualquier variable no inicializada rompe.
# TARGET_FLAG se usa para pasar flags opcionales (p.ej. --target ...). Por defecto vacío.
TARGET_FLAG="${TARGET_FLAG:-}"

# ── Configuración ────────────────────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAGES_PROJECT="contikpro-core"           # nombre en Cloudflare Pages
DOWNLOADS_DIR="$PROJECT_ROOT/public/downloads"
ARCH="x86_64-apple-darwin"              # default
TARGET_FLAG="--target x86_64-apple-darwin"

# ── Parse args ───────────────────────────────────────────────────────────────
PUBLISH=0
for arg in "$@"; do
  case "$arg" in
    --arm64)     ARCH="aarch64-apple-darwin"; TARGET_FLAG="--target aarch64-apple-darwin" ;;
    --universal) ARCH="universal-apple-darwin"; TARGET_FLAG="--target universal-apple-darwin" ;;
    --publish)   PUBLISH=1 ;;
  esac
done

# DMG_STAGING points where Tauri places bundles for cross-compilation
DMG_STAGING="$PROJECT_ROOT/src-tauri/target/$ARCH/release/bundle/dmg"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ContikPro Core — Release macOS [$ARCH]"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

cd "$PROJECT_ROOT"

# ── 1. Limpiar builds anteriores (sin borrar código) ─────────────────────────
echo "▶ [1/6] Limpiando builds anteriores (dist/ y dist-web/)…"
rm -rf dist/ dist-web/
echo "   dist/ y dist-web/ limpiados"

# ── 2. npm install ────────────────────────────────────────────────────────────
if [[ "${SKIP_INSTALL:-0}" == "1" ]]; then
  echo "▶ [2/6] npm install omitido (SKIP_INSTALL=1)"
else
  echo "▶ [2/6] npm install…"
  npm install --prefer-offline
fi


# ── 3. Build frontend Tauri ───────────────────────────────────────────────────
echo "▶ [3/6] Build frontend (vite build, modo DESKTOP)…"
echo "   [BUILD: DESKTOP] outDir=dist  BUILD_TARGET no seteado"
npm run build
echo "   dist/ generado: $(du -sh dist/ | cut -f1)"

# ── Guard: verificar que dist/ es build DESKTOP ───────────────────────────────
# NOTA: grep -q no produce output; el pipe estaba roto en versiones anteriores.
# Forma correcta: grep -rq busca en todo el árbol y retorna exit code.
if grep -rq "dexie\|DexieBridgeAdapter" dist/ 2>/dev/null; then
  echo ""
  echo "   ❌ GUARD: dist/ contiene build WEB (se detectó Dexie/DexieBridgeAdapter)."
  echo "   El desktop build usa el adaptador SQLite, no Dexie."
  echo "   Ejecuta 'npm run clean' y vuelve a intentarlo."
  exit 1
fi
if [[ ! -f "dist/index.html" ]]; then
  echo ""
  echo "   ❌ GUARD: dist/index.html no existe. El build frontend falló."
  exit 1
fi
echo "   ✅ Guard OK: dist/ contiene build DESKTOP"

# ── 4. Build Tauri release ────────────────────────────────────────────────────
echo "▶ [4/6] npx tauri build ${TARGET_FLAG:-}…"
npx tauri build ${TARGET_FLAG:-}


# ── 5. Localizar y renombrar DMG ─────────────────────────────────────────────
echo "▶ [5/6] Localizando DMG…"
# Tauri genera: "ContikPro Core_<version>_<arch>.dmg" (con espacios)
DMG_SRC=$(find "$DMG_STAGING" -maxdepth 2 -name "*.dmg" | sort -t_ -k2 -V | tail -1)

if [[ -z "$DMG_SRC" ]]; then
  echo "   ❌ No se encontró ningún .dmg en $DMG_STAGING"
  exit 1
fi

echo "   DMG original: $DMG_SRC"

# Leer versión de package.json
VERSION=$(node -p "require('./package.json').version")

# Nombre URL-friendly (sin espacios)
DMG_NAME="ContikPro-Core_${VERSION}_${ARCH}.dmg"
DMG_DEST="$DOWNLOADS_DIR/$DMG_NAME"

mkdir -p "$DOWNLOADS_DIR"
cp "$DMG_SRC" "$DMG_DEST"
echo "   ✅ DMG copiado: public/downloads/$DMG_NAME"

# ── 6. (Opcional) Publicar landing ───────────────────────────────────────────
if [[ "$PUBLISH" == "1" ]]; then
  echo "▶ [6/6] Publicando landing a Cloudflare Pages…"
  npm run publish:landing
  echo ""
  echo "   🌐 URL de descarga:"
  echo "   https://${PAGES_PROJECT}.pages.dev/downloads/${DMG_NAME}"
else
  echo "▶ [6/6] Publicación omitida (usa --publish para desplegar)"
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Build completado:"
echo "  Versión:  $VERSION"
echo "  Arch:     $ARCH"
echo "  DMG:      public/downloads/$DMG_NAME"
echo ""
echo "  Para publicar ahora:"
echo "  ./scripts/release-mac.sh --publish"
echo "══════════════════════════════════════════════════════"
echo ""
