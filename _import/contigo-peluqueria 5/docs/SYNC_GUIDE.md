# Sincronización Buzón: D1 → App Local — Contigo v2.4.2

> Guía completa: configuración, flujo, endpoints, idempotencia y checklist.

---

## Arquitectura del flujo

```
Usuario en web ──► POST /reservations ──► D1 (Cloudflare)
                   POST /contact        ──► inbox_messages

App local ──────► GET /inbox/pull ───────► descarga nuevos
          ◄──────                  ◄──────  items normalizados
          │
          ├── INSERT OR IGNORE por external_id (idempotencia)
          ├── Estado local siempre "unread" al llegar
          └── POST /inbox/mark-synced (best-effort, confirma recepción)
```

El dato vive en el **dispositivo del cliente** (SQLite local).  
Cloudflare D1 es únicamente buzón temporal de entrada. No guardamos datos de clientes en servidores propios.

---

## Configuración desde la app

Ve a **Buzón → barra de sync → Configurar**:

| Campo | Descripción |
|-------|-------------|
| URL del Worker | `https://contigo-api.TU-CUENTA.workers.dev` |
| Token de sync  | Valor que configuraste con `wrangler secret put API_SECRET` |

Pulsa **Test** para verificar la conexión antes de guardar.

Estos valores se guardan en `sync_config` (SQLite local). Nunca salen de la app excepto para autenticar con el Worker.

---

## Rutas del Worker (Fase 2B)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET  | `/inbox/pull?since=TS&limit=N&type=T` | Bearer token | Descarga entradas nuevas |
| POST | `/inbox/mark-synced` | Bearer token | Confirma recepción de IDs |
| GET  | `/health` | ninguna | Estado del Worker |
| GET  | `/services` | ninguna | Lista pública de servicios |
| GET  | `/availability?date=YYYY-MM-DD` | ninguna | Huecos disponibles |
| POST | `/reservations` | ninguna | Envío de solicitud de cita |
| POST | `/contact` | ninguna | Envío de formulario de contacto |

### GET /inbox/pull

```
GET /inbox/pull?since=1700000000000&limit=100&type=reservation-request
Authorization: Bearer TU_TOKEN
```

**Query params:**

| Param | Default | Descripción |
|-------|---------|-------------|
| `since` | `0` | Unix ms — devuelve solo mensajes con `created_at > since` |
| `limit` | `100` | Máximo 500 |
| `type`  | todos | `reservation-request` \| `contact-form` \| `whatsapp` \| `cancellation` \| `other` |

**Respuesta 200:**
```json
{
  "items": [
    {
      "externalId": "abc123...",
      "type": "reservation-request",
      "status": "unread",
      "senderName": "Ana García",
      "senderPhone": "612345678",
      "senderEmail": null,
      "subject": null,
      "body": "Solicitud de cita recibida desde la web.\nServicio: Corte señora\nFecha preferida: 2025-12-15\nHora preferida: 10:00",
      "preferredDatetime": 1734256800000,
      "preferredServiceName": "Corte señora",
      "preferredDate": "2025-12-15",
      "preferredTime": "10:00",
      "notes": null,
      "source": "web",
      "createdAt": 1734100000000,
      "updatedAt": 1734100000000
    }
  ],
  "count": 1,
  "nextCursor": 1734100000000,
  "hasMore": false,
  "syncedAt": 1734200000000
}
```

**Errores:**
- `401` — token ausente o incorrecto
- `400` — parámetros inválidos
- `429` — rate limit
- `500` — error de D1

### POST /inbox/mark-synced

```json
{
  "ids": ["external_id_1", "external_id_2"]
}
```

Respuesta: `{ "ok": true, "updated": 2 }`

Esta llamada es **best-effort** — si falla, los mensajes no se pierden ni duplican en la siguiente sync (el `INSERT OR IGNORE` los ignorará).

---

## Estrategia de idempotencia

**En D1 (Worker):**
- Cada mensaje tiene `external_id` = SHA-256(nombre + teléfono + fecha + hora-bloque)
- `ON CONFLICT(external_id) DO NOTHING` — doble clic en el formulario no duplica

**En SQLite local (app):**
- La columna `external_id` tiene índice `UNIQUE`
- `INSERT OR IGNORE` — si la sync se interrumpe y se relanza, los ya descargados se ignoran silenciosamente
- El estado local (leído, convertido, archivado) **nunca se sobrescribe** con datos del Worker
- El cursor `last_sync_cursor` se actualiza solo al completar una página exitosamente

**Resumen:** el mismo mensaje puede pasar por el flujo infinitas veces sin causar duplicados ni pérdida de datos.

---

## Lógica de sync (app local)

```
1. Leer workerUrl + syncToken + lastCursor de sync_config
2. Si workerUrl o syncToken vacíos → error "no configurado"
3. Bucle (máx 20 páginas de 100 items = 2000 items):
   a. GET /inbox/pull?since={cursor}&limit=100
   b. Por cada item:
      - INSERT OR IGNORE en inbox_messages por external_id
      - Si insertado: totalNew++, añadir a insertedIds
      - Si ignorado: totalSkipped++
   c. POST /inbox/mark-synced con insertedIds (best-effort)
   d. cursor = nextCursor de la respuesta
   e. Si hasMore=false o items vacíos → parar
4. Guardar lastSyncCursor + lastSyncAt en sync_config
5. Retornar SyncResult { success, newItems, skippedItems, nextCursor, hasMore? }
```

---

## Checklist de prueba manual

### 1. Reserva desde web → sync → buzón

```bash
# 1. Enviar reserva desde la web pública (o con curl):
curl -X POST https://TU-WORKER.workers.dev/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ana García",
    "phone": "612345678",
    "service": "Corte señora",
    "preferredDate": "2025-12-15",
    "preferredTime": "10:00",
    "notes": "Que no corten mucho"
  }'
# Esperado: { "ok": true, "id": "..." }

# 2. Verificar en D1:
npx wrangler d1 execute contigo-peluqueria-data \
  --command="SELECT id, sender_name, type, status FROM inbox_messages ORDER BY created_at DESC LIMIT 5" \
  --remote

# 3. En la app: Buzón → botón "Sincronizar"
# Esperado: "1 nueva"

# 4. En el buzón: aparece el mensaje de Ana García con:
#    - tipo "Solicitud de cita"
#    - origen "Web"
#    - fecha/hora pre-rellenas
#    - badge azul (no leído)
```

### 2. Convertir a cita

```
1. Abrir el mensaje de Ana García en el buzón
2. Click "Crear cita"
3. Verificar que se pre-rellena:
   - Nombre: Ana García  ✓
   - Teléfono: 612345678  ✓
   - Servicio: Corte señora (si existe en catálogo)  ✓
   - Fecha: 2025-12-15  ✓
   - Hora: 10:00  ✓
   - Notas: contenido del mensaje  ✓
4. Ajustar profesional si hace falta
5. Click "Crear cita"
6. Verificar:
   - Badge verde "Convertido a cita"  ✓
   - Cita aparece en el calendario  ✓
   - Enlace inbox_message_id → appointment.id  ✓
```

### 3. Idempotencia

```
1. Sincronizar 2 veces seguidas
2. Esperado: la segunda sync devuelve "Sin novedades" (0 nuevas)
3. Los mensajes NO se duplican en el buzón
```

### 4. Formulario de contacto

```bash
curl -X POST https://TU-WORKER.workers.dev/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Carlos López",
    "phone": "687654321",
    "message": "¿Hacéis mechas californianas?"
  }'

# Sync → aparece en buzón con tipo "Formulario" y origen "Web"
```

---

## Limitaciones conocidas Fase 2B

| Limitación | Impacto | Solución prevista |
|------------|---------|-------------------|
| Sync manual (botón) | El negocio debe pulsar para recibir | Auto-sync cada N min (Fase 2C) |
| D1 no se borra tras sync | D1 crece indefinidamente | Purge automático mensajes > 90 días (Fase 2C) |
| `/availability` no consulta citas reales | Puede mostrar huecos ocupados | Fase 2C: push de appointments a D1 |
| Sin notificación push | No avisa al negocio de mensajes nuevos | Fase 2C: Cloudflare Email Worker o webhook |

---

*Contigo v2.4.2 — Vertical Peluquería*
