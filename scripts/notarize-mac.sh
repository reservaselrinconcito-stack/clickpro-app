#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ContikPro Core — Notarización macOS
#
# Uso:
#   source ~/.contikpro-notarize.env   # carga credenciales
#   ./scripts/notarize-mac.sh public/downloads/ContikPro-Core_2.0.0_x86_64-apple-darwin.dmg
#
# Variables requeridas (en ~/.contikpro-notarize.env o como env vars):
#   APPLE_ID         → tu@email.com
#   APPLE_TEAM_ID    → XXXXXXXXXX (10 chars)
#   APPLE_PASSWORD   → xxxx-xxxx-xxxx-xxxx (app-specific password)
#
# Ver docs/NOTARIZATION.md para guía completa.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DMG_PATH="${1:-}"
if [[ -z "$DMG_PATH" ]]; then
  echo "❌ Uso: $0 <path/to/ContikPro-Core.dmg>"
  exit 1
fi

if [[ ! -f "$DMG_PATH" ]]; then
  echo "❌ No se encuentra el DMG: $DMG_PATH"
  exit 1
fi

# ── Verificar variables ───────────────────────────────────────────────────────
for var in APPLE_ID APPLE_TEAM_ID APPLE_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    echo "❌ Variable de entorno $var no definida."
    echo "   Ejecuta: source ~/.contikpro-notarize.env"
    exit 1
  fi
done

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ContikPro Core — Notarización macOS"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  DMG: $DMG_PATH"
echo "  Apple ID: $APPLE_ID"
echo "  Team: $APPLE_TEAM_ID"
echo ""

# ── Paso 1: Subir a Apple para notarización ───────────────────────────────────
echo "▶ [1/3] Enviando a Apple Notary Service (puede tardar 2-10 min)…"
SUBMISSION_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_PASSWORD" \
  --wait \
  --output-format json)

echo "$SUBMISSION_OUTPUT"

STATUS=$(echo "$SUBMISSION_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','unknown'))")
SUBMISSION_ID=$(echo "$SUBMISSION_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")

if [[ "$STATUS" != "Accepted" ]]; then
  echo ""
  echo "❌ Notarización rechazada. Estado: $STATUS"
  if [[ -n "$SUBMISSION_ID" ]]; then
    echo "   Log detallado:"
    xcrun notarytool log "$SUBMISSION_ID" \
      --apple-id "$APPLE_ID" \
      --team-id "$APPLE_TEAM_ID" \
      --password "$APPLE_PASSWORD"
  fi
  exit 1
fi

echo "   ✅ Notarización aceptada (ID: $SUBMISSION_ID)"

# ── Paso 2: Staple — pegar el ticket al DMG ───────────────────────────────────
echo ""
echo "▶ [2/3] Stapling ticket al DMG…"
xcrun stapler staple "$DMG_PATH"
echo "   ✅ Ticket pegado"

# ── Paso 3: Verificar con Gatekeeper ─────────────────────────────────────────
echo ""
echo "▶ [3/3] Verificando con Gatekeeper…"
spctl --assess --type open --context context:primary-signature -v "$DMG_PATH"
echo "   ✅ Gatekeeper acepta el DMG"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  ✅ Notarización completada:"
echo "  $DMG_PATH"
echo "══════════════════════════════════════════════════════"
echo ""
