# Notarización macOS — ContikPro Core

> **Estado actual**: build sin firma (unsigned). Gatekeeper en macOS bloqueará la app en equipos de terceros.  
> **Workaround temporal**: Control+Click → Abrir (o `xattr -cr /Applications/ContikPro\ Core.app`).  
> Cuando tengas credenciales Apple Developer, sigue esta guía y ejecuta 3 comandos.

---

## Prerequisitos

| Requisito | Cómo obtenerlo |
|---|---|
| Apple Developer Program | https://developer.apple.com/programs/ (99 USD/año) |
| Xcode Command Line Tools | `xcode-select --install` |
| Certificado "Developer ID Application" | Xcode → Preferences → Accounts → Manage Certificates |
| App-specific password | https://appleid.apple.com → Seguridad → Contraseñas específicas de app |
| Bundle ID | `com.contikpro.core` (ya configurado en `tauri.conf.json`) |

---

## Variables a configurar

Crea `~/.contikpro-notarize.env` (nunca lo commites):

```bash
export APPLE_ID="tu@email.com"                    # Apple ID del Developer Program
export APPLE_TEAM_ID="XXXXXXXXXX"                 # Team ID (10 chars, en developer.apple.com)
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"       # App-specific password
export SIGNING_IDENTITY="Developer ID Application: Tu Nombre (XXXXXXXXXX)"
```

---

## Flujo completo: 3 comandos

Una vez que tengas las credenciales y el DMG generado:

```bash
# 1. Cargar variables (o pásalas directamente)
source ~/.contikpro-notarize.env

# 2. Notarizar y pegar el ticket (staple)
./scripts/notarize-mac.sh public/downloads/ContikPro-Core_2.0.0_x86_64-apple-darwin.dmg

# 3. Verificar que Gatekeeper lo acepta
spctl --assess --type open --context context:primary-signature -v \
  "public/downloads/ContikPro-Core_2.0.0_x86_64-apple-darwin.dmg"
```

---

## Configuración de tauri.conf.json para firma

Cuando tengas el certificado, rellena en `src-tauri/tauri.conf.json`:

```json
"bundle": {
  "macOS": {
    "signingIdentity": "Developer ID Application: Tu Nombre (XXXXXXXXXX)",
    "providerShortName": "XXXXXXXXXX",
    "entitlements": "entitlements.plist"
  }
}
```

Y crea `src-tauri/entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>          <false/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key> <false/>
  <key>com.apple.security.cs.disable-library-validation</key>       <false/>
  <key>com.apple.security.files.user-selected.read-write</key>      <true/>
  <key>com.apple.security.files.downloads.read-write</key>          <true/>
</dict>
</plist>
```

---

## Workaround sin notarización (distribución interna)

Los usuarios que reciban el DMG sin notarizar tienen dos opciones:

```bash
# Opción 1: desde Finder (recomendada para usuarios finales)
# Control+Click sobre la app → "Abrir" → confirmar en el diálogo

# Opción 2: desde terminal (para admins / distribución interna)
xattr -cr "/Applications/ContikPro Core.app"
# Elimina el atributo com.apple.quarantine que activa Gatekeeper
```

---

## Checklist pre-release con notarización

- [ ] `SIGNING_IDENTITY` configurada en tauri.conf.json
- [ ] `entitlements.plist` creado
- [ ] `npm run release:mac` genera DMG firmado (ver log "code signing")
- [ ] `./scripts/notarize-mac.sh <dmg>` ejecutado correctamente
- [ ] `spctl --assess` devuelve `accepted`
- [ ] Probado en un Mac limpio sin Xcode
