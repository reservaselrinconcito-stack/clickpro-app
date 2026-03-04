# Despliegue Web del Negocio — Contigo v2.4.1

> Guía completa y ejecutable. Todos los comandos son copy/paste reales.

---

## Requisitos previos

```bash
# Instalar Wrangler (si no está instalado)
npm install -g wrangler

# Autenticarse en Cloudflare
npx wrangler login
```

---

## PARTE A — Deploy del Worker de reservas

El Worker recibe solicitudes de cita y contacto desde la web pública y las guarda en D1.

### A1. Crear la base de datos D1

```bash
cd reservation-api
npm install

# Crear la BD en Cloudflare
npx wrangler d1 create contigo-peluqueria-data
```

Cloudflare devuelve algo como:
```
✅ Successfully created DB contigo-peluqueria-data
{
  "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  ...
}
```

Copia el `uuid` y edita `wrangler.toml`:
```toml
[[d1_databases]]
binding      = "DB"
database_name = "contigo-peluqueria-data"
database_id  = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   ← pegar aquí
```

### A2. Aplicar el schema de tablas

```bash
# Aplica las tablas en la BD remota (Cloudflare)
npx wrangler d1 execute contigo-peluqueria-data \
  --file=migrations/d1-schema.sql \
  --remote

# Verificar que se crearon las tablas
npx wrangler d1 execute contigo-peluqueria-data \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" \
  --remote
```

Debe devolver: `business_public_config`, `inbox_messages`, `web_contacts`, `web_reservations`.

### A3. Configurar CORS

Edita `wrangler.toml` con el dominio de la web del negocio:
```toml
[vars]
ALLOWED_ORIGINS = "https://www.mipeluqueria.com,https://mipeluqueria.com"
```

Para desarrollo local, usa `"*"` temporalmente.

### A4. Configurar el secret (opcional, para Fase 2B)

```bash
npx wrangler secret put API_SECRET
# Introduce un valor aleatorio seguro, ej: openssl rand -hex 32
```

### A5. Deployar el Worker

```bash
npm run deploy
```

La URL del Worker será:
```
https://contigo-reservation-api.TU-CUENTA.workers.dev
```

### A6. Verificar

```bash
# Health check
curl https://contigo-reservation-api.TU-CUENTA.workers.dev/health

# Servicios (seed del schema)
curl https://contigo-reservation-api.TU-CUENTA.workers.dev/services

# Disponibilidad
curl "https://contigo-reservation-api.TU-CUENTA.workers.dev/availability?date=2025-12-15"

# Test reserva
curl -X POST https://contigo-reservation-api.TU-CUENTA.workers.dev/reservations \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana García","phone":"612345678","service":"Corte señora","preferredDate":"2025-12-15","preferredTime":"10:00"}'

# Test contacto
curl -X POST https://contigo-reservation-api.TU-CUENTA.workers.dev/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Carlos López","phone":"612345678","message":"Me gustaría saber el precio del tinte"}'
```

---

## PARTE B — Configurar la app (editor web)

En la app de escritorio, ve a **Mi Web → Publicar web**:

1. **URL del Worker de reservas** → pegar `https://contigo-reservation-api.TU-CUENTA.workers.dev`
2. Guardar → los formularios de la web ya estarán conectados al Worker.

Sin esta URL, los formularios no aparecen en el HTML generado.

---

## PARTE C — Deploy de la web del negocio

### Opción 1: Subdominio automático (`.pages.dev`)

```bash
# Crear proyecto (solo la primera vez)
npx wrangler pages project create mipeluqueria

# Desde la app: "Generar y publicar" → descarga index.html
# Luego deployar:
mkdir -p /tmp/web-deploy
cp ~/Downloads/index.html /tmp/web-deploy/
npx wrangler pages deploy /tmp/web-deploy --project-name mipeluqueria
```

URL resultante: `https://mipeluqueria.pages.dev`

### Opción 2: Dominio propio

```bash
# 1. Crear proyecto igual que arriba
npx wrangler pages project create mipeluqueria

# 2. En Cloudflare Dashboard:
#    Pages → mipeluqueria → Custom Domains → Add
#    Dominio: www.mipeluqueria.com

# 3. Añadir CNAME en tu DNS:
#    www  CNAME  mipeluqueria.pages.dev

# 4. Deploy igual que Opción 1
```

### Opción 3: Deploy automático desde el editor (un clic)

En la app, el botón "Generar y publicar" descarga el HTML.
Para automatizar completamente (sin paso manual), el flujo futuro usará
la API de Cloudflare Pages para subir el archivo desde la app.
Esto se implementará en Fase 2C.

---

## PARTE D — Actualizar la lista de servicios en el Worker

El Worker sirve `GET /services` desde `business_public_config` en D1.
En Fase 2A se actualiza manualmente; en Fase 2B la app lo hará automáticamente.

Para actualizar ahora:

```bash
# Ejemplo: actualizar los servicios
npx wrangler d1 execute contigo-peluqueria-data --remote --command="
  INSERT OR REPLACE INTO business_public_config (key, value, updated_at)
  VALUES ('services', '[
    {\"name\":\"Corte caballero\",\"price\":15,\"durationMinutes\":30},
    {\"name\":\"Corte señora\",\"price\":25,\"durationMinutes\":45},
    {\"name\":\"Tinte completo\",\"price\":55,\"durationMinutes\":90},
    {\"name\":\"Mechas\",\"price\":80,\"durationMinutes\":120}
  ]', unixepoch() * 1000)
"
```

---

## Rutas disponibles del Worker

| Método | Ruta            | Descripción                                          |
|--------|-----------------|------------------------------------------------------|
| GET    | `/health`       | Estado del Worker                                    |
| GET    | `/services`     | Lista pública de servicios del negocio               |
| GET    | `/availability?date=YYYY-MM-DD` | Huecos disponibles (orientativo) |
| POST   | `/reservations` | Enviar solicitud de cita                             |
| POST   | `/contact`      | Enviar formulario de contacto                        |

### Ejemplos de payload

**POST /reservations**
```json
{
  "name": "Ana García",
  "phone": "612345678",
  "email": "ana@email.com",
  "service": "Corte señora",
  "preferredDate": "2025-12-15",
  "preferredTime": "10:00",
  "notes": "Prefiero que no corten mucho"
}
```

**POST /contact**
```json
{
  "name": "Carlos López",
  "phone": "612345678",
  "email": "carlos@email.com",
  "subject": "Consulta precio tinte",
  "message": "Me gustaría saber el precio del tinte completo y si hay que reservar."
}
```

---

## ⚠️ Limitaciones conocidas Fase 2A

| Limitación | Solución prevista |
|------------|-------------------|
| `/availability` no consulta citas reales | Fase 2B: sync bidireccional |
| Servicios en D1 se actualizan manualmente | Fase 2B: push automático desde app |
| No hay notificaciones push al abrir la app | Fase 2B: polling o webhook |

---

*Contigo v2.4.1 — Vertical Peluquería*
