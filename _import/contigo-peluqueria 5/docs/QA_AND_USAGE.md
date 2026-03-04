# Contigo v2.4.0 — Documentación de uso y checklist QA

## 1. Calendario de Citas

### Cómo usar el calendario

**Vistas disponibles:**
- **Semana** — visión completa de 7 días con columnas de tiempo
- **Día** — foco en el día actual con mayor detalle

**Crear una cita:**
- Haz clic en cualquier hueco vacío del calendario → abre el modal de nueva cita
- Rellena: cliente, servicio, profesional, fecha/hora
- La duración se rellena automáticamente según el servicio elegido
- El sistema avisa si hay solapamiento con otra cita del mismo profesional

**Editar o mover una cita:**
- Haz clic en la cita → abre el modal de edición
- Arrastra la cita a otro hueco (drag & drop) para cambiar el horario

**Estados de cita y colores:**
- 🟡 **Pendiente** — creada, pendiente de confirmar
- 🔵 **Confirmada** — confirmada con el cliente
- 🟢 **Completada** — servicio realizado
- ⚫ **Cancelada** — cancelada
- 🔴 **No se presentó** — cliente no acudió

**Filtros y opciones:**
- Filtra por profesional usando el selector del encabezado
- Cambia el intervalo de agenda: 15min / 30min / 1hora
- El botón "Hoy" salta siempre al día actual

---

## 2. Buzón Notificado

### Cómo gestionar el buzón

**Entradas que llegan al buzón:**
- Solicitudes de cita desde la web del negocio
- Formularios de contacto web
- Entradas manuales de WhatsApp
- Cualquier mensaje/solicitud registrada

**Filtros:**
- **Todos** — todas las entradas
- **No leídos** — nuevas entradas sin leer
- **Pendientes** — requieren acción
- **Archivados** — cerrados/archivados

**Acciones rápidas:**
1. **Crear cita** → convierte la solicitud en cita del calendario en 3 clics
2. **Archivar** → cierra la entrada sin eliminarla
3. **Responder WA** → abre WhatsApp con el número del cliente
4. El badge rojo en la barra lateral muestra entradas sin leer

**Añadir entrada de WhatsApp manualmente:**
- Botón "+ WhatsApp" en la esquina superior derecha del buzón
- Rellena nombre, teléfono y el mensaje recibido
- Queda en el buzón para procesarlo y convertirlo en cita

---

## 3. Editor y Publicación Web

### Cómo editar la web del negocio

**Datos que puedes editar:**
- Nombre del negocio, eslogan, descripción
- Teléfono, email, dirección, WhatsApp, horarios
- Secciones visibles (activa/desactiva con el toggle)
- Galería de fotos (añade URLs de imágenes)
- Plantilla visual (Moderna / Clásica / Minimalista)
- SEO (título y descripción para Google)

**Secciones configurables:**
- Cabecera principal (siempre visible)
- Servicios (lista los servicios activos del negocio)
- Galería de fotos
- Equipo / profesionales
- Contacto y ubicación
- Botón de reserva

**Vista previa:**
- Haz clic en "Actualizar preview" para ver cómo quedará la web
- La previsualización es responsive (muestra como desktop)

**Publicar:**
1. Introduce el nombre de tu proyecto en Cloudflare Pages
2. Clic en "Generar y publicar" → se descarga `index.html`
3. Sube el HTML a Cloudflare Pages con `wrangler pages deploy`
4. Ver `docs/WEB_DEPLOY.md` para instrucciones completas

---

## 4. Checklist QA — Funcionalidad completa

### Calendario

- [ ] Abrir `/calendar` → carga calendario en vista semana
- [ ] Navegar semanas: botones anterior/siguiente
- [ ] Hacer clic en "Hoy" → vuelve a semana actual
- [ ] Cambiar a vista día → muestra solo el día seleccionado
- [ ] Clic en hueco vacío → abre modal de nueva cita
  - [ ] Selector de servicio rellena la duración automáticamente
  - [ ] Selector de profesional muestra colores
  - [ ] Crear cita → aparece en el calendario
- [ ] Citar con solape → aparece aviso de conflicto
- [ ] Clic en cita existente → abre modal de edición
  - [ ] Cambiar estado (Pendiente → Confirmada → Completada)
  - [ ] Guardar cambios → refleja en calendario
  - [ ] Eliminar cita → desaparece del calendario
- [ ] Arrastrar cita → se mueve al nuevo horario
- [ ] Filtrar por profesional → solo muestra sus citas
- [ ] Cambiar intervalo 30min → 15min → rejilla más fina

### Buzón

- [ ] Abrir `/inbox` → carga lista de mensajes
- [ ] Badge de no leídos visible en sidebar
- [ ] Filtrar por "No leídos" → muestra solo los nuevos
- [ ] Clic en mensaje → detalle en panel derecho
  - [ ] Mensaje marcado como leído (badge actualizado)
- [ ] "Crear cita" → abre panel de conversión
  - [ ] Crear cita → aparece en calendario, mensaje marcado como "Convertido"
- [ ] "Archivar" → desaparece del listado activo
- [ ] "+ WhatsApp" → abre modal, guarda entrada, aparece en buzón
- [ ] Clic en teléfono → abre `tel:` link
- [ ] "Responder WA" → abre `wa.me/` link

### Editor Web

- [ ] Abrir `/web-editor` → carga con datos de empresa (si existen en settings)
- [ ] Editar nombre → visible inmediatamente en el panel izquierdo
- [ ] Toggle sección "Galería" → se activa/desactiva
- [ ] Añadir foto por URL → aparece en galería
- [ ] Eliminar foto → desaparece
- [ ] Cambiar plantilla → selección visual
- [ ] "Guardar" → toast de confirmación
- [ ] "Actualizar preview" → iframe muestra la web generada
  - [ ] Nombre de negocio correcto en el HTML
  - [ ] Botón WhatsApp presente (si configurado)
  - [ ] Secciones visibles/ocultas correctamente
- [ ] "Generar y publicar" → descarga `index.html`
  - [ ] Abrir el HTML en navegador → web funcional

### Integración core

- [ ] Datos de empresa (settings) se pre-rellenan en el editor web
- [ ] Servicios activos del catálogo aparecen en el selector de citas
- [ ] Crear cita desde buzón → aparece en calendario `/calendar`
- [ ] La migración v3 no rompe datos existentes (invoices, contacts, etc.)
- [ ] Sidebar muestra badge correcto de no leídos
- [ ] Feature flag `peluqueria: false` → rutas `/calendar`, `/inbox`, `/web-editor` no aparecen

---

## 5. Estructura de archivos entregados

```
contigo-peluqueria/
├── src/
│   ├── core/
│   │   └── config/
│   │       └── app-config.ts              ← Branding + feature flags
│   ├── verticals/
│   │   └── peluqueria/
│   │       ├── models/index.ts            ← Todos los modelos TypeScript
│   │       ├── migrations/
│   │       │   └── v3-peluqueria.ts       ← SQL migration (additive only)
│   │       ├── services/
│   │       │   ├── appointment-service.ts ← CRUD citas + overlap detection
│   │       │   ├── professional-service.ts← CRUD profesionales + servicios
│   │       │   ├── inbox-service.ts       ← CRUD buzón
│   │       │   └── web-config-service.ts  ← Editor web + HTML generator
│   │       ├── components/
│   │       │   └── calendar/
│   │       │       └── AppointmentModal.tsx
│   │       └── pages/
│   │           ├── CalendarPage.tsx       ← Calendario visual completo
│   │           ├── InboxPage.tsx          ← Buzón notificado
│   │           └── WebEditorPage.tsx      ← Editor web
│   ├── tauri/
│   │   └── db-adapter.ts                 ← +Migration v3 integrada
│   └── App.tsx                           ← +Rutas y sidebar actualizados
├── reservation-api/                       ← Cloudflare Worker
│   ├── src/index.ts                       ← API reservas + contacto
│   └── wrangler.toml
└── docs/
    ├── VERTICAL_GUIDE.md                  ← Cómo crear nuevas verticales
    ├── WEB_DEPLOY.md                      ← Deploy en Cloudflare Pages
    └── QA_AND_USAGE.md                    ← Este archivo
```

---

## Supuestos tomados

1. **nanoid** ya está instalado (o añadir a `package.json`)
2. La app usa **React Router v6** (ya presente en v2.3.0)
3. **Tailwind CSS** configurado (ya presente)
4. El sidebar existente se reemplaza por el nuevo con soporte de verticales
5. La migración v3 se aplica automáticamente al arrancar la app (el migration runner ya existe)
6. Las imágenes de galería se referencian por URL (no se sube a Cloudflare R2 en esta fase)
7. El drag & drop del calendario es básico (mouse events); se puede mejorar con `@dnd-kit` en fases futuras

---

*Contigo v2.4.0 — Vertical Peluquería*
