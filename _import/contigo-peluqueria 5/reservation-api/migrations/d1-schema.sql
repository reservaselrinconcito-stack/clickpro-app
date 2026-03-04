-- ============================================================
-- Contigo — D1 Schema para reservation-api (Cloudflare D1)
-- ============================================================
-- Este archivo crea las tablas en la base de datos D1 del Worker.
-- NO es el SQLite local de la app de escritorio.
-- Las dos bases de datos tienen la misma estructura de inbox_messages
-- para facilitar la sincronización futura (Fase 2B).
--
-- Deploy:
--   npx wrangler d1 execute contigo-peluqueria-data --file=migrations/d1-schema.sql --remote
-- ============================================================

-- ── inbox_messages ────────────────────────────────────────────────────────────
-- Tabla central: recibe reservas y contactos desde la web pública.
-- La app de escritorio leerá de aquí para sincronizar el Buzón local.
-- external_id garantiza idempotencia (no duplicar si el Worker reintenta).

CREATE TABLE IF NOT EXISTS inbox_messages (
  id                       TEXT PRIMARY KEY,
  -- Idempotencia: hash del payload o UUID del cliente para evitar duplicados
  external_id              TEXT UNIQUE,
  type                     TEXT NOT NULL DEFAULT 'reservation-request',
  -- Valores: reservation-request | contact-form | whatsapp | cancellation | other
  status                   TEXT NOT NULL DEFAULT 'unread',
  -- Valores: unread | read | pending | converted | archived
  -- Estado de sincronización con la app local
  sync_status              TEXT NOT NULL DEFAULT 'pending',
  -- Valores: pending | synced | failed
  synced_at                INTEGER,

  -- Datos del remitente
  sender_name              TEXT NOT NULL,
  sender_phone             TEXT,
  sender_email             TEXT,

  -- Contenido
  subject                  TEXT,
  body                     TEXT NOT NULL,

  -- Solicitud de reserva (campos opcionales)
  preferred_datetime       INTEGER,               -- Unix ms
  preferred_service_id     TEXT,
  preferred_service_name   TEXT,
  preferred_professional_id TEXT,

  -- Resultado (si ya se procesó en la app local)
  appointment_id           TEXT,

  -- Trazabilidad
  source                   TEXT NOT NULL DEFAULT 'web',
  -- Valores: web | whatsapp | manual | other
  ip_hash                  TEXT,                  -- Hash de la IP (sin almacenar IP real, privacidad)
  user_agent_hint          TEXT,                  -- Solo el tipo de dispositivo, no el UA completo

  read_at                  INTEGER,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_inbox_status      ON inbox_messages(status);
CREATE INDEX IF NOT EXISTS idx_inbox_sync_status ON inbox_messages(sync_status);
CREATE INDEX IF NOT EXISTS idx_inbox_created     ON inbox_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_external    ON inbox_messages(external_id);
CREATE INDEX IF NOT EXISTS idx_inbox_type        ON inbox_messages(type);
CREATE INDEX IF NOT EXISTS idx_inbox_synced_at    ON inbox_messages(synced_at);

-- ── web_reservations ──────────────────────────────────────────────────────────
-- Tabla de reservas con todos los campos del formulario web (más detalle
-- que inbox_messages). Se crea en paralelo con inbox_messages para tener
-- el dato completo del formulario sin perder información.
-- La app de escritorio puede leer de aquí para pre-rellenar el modal de cita.

CREATE TABLE IF NOT EXISTS web_reservations (
  id                    TEXT PRIMARY KEY,
  -- FK hacia inbox_messages (el registro "base" para el buzón)
  inbox_message_id      TEXT NOT NULL,
  external_id           TEXT UNIQUE,

  -- Datos del cliente
  client_name           TEXT NOT NULL,
  client_phone          TEXT,
  client_email          TEXT,

  -- Servicio solicitado
  service_name          TEXT,
  preferred_date        TEXT,                     -- "YYYY-MM-DD"
  preferred_time        TEXT,                     -- "HH:MM"
  preferred_datetime    INTEGER,                  -- Unix ms (calculado)

  -- Notas adicionales del formulario
  notes                 TEXT,

  -- Estado del proceso
  status                TEXT NOT NULL DEFAULT 'new',
  -- Valores: new | contacted | confirmed | rejected | converted
  sync_status           TEXT NOT NULL DEFAULT 'pending',
  synced_at             INTEGER,

  -- Metadatos
  source_url            TEXT,                     -- URL de la página web desde donde vino
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,

  FOREIGN KEY (inbox_message_id) REFERENCES inbox_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_web_res_inbox    ON web_reservations(inbox_message_id);
CREATE INDEX IF NOT EXISTS idx_web_res_status   ON web_reservations(status);
CREATE INDEX IF NOT EXISTS idx_web_res_created  ON web_reservations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_res_sync     ON web_reservations(sync_status);

-- ── web_contacts ──────────────────────────────────────────────────────────────
-- Formularios de contacto recibidos desde la web.
-- También se crean en inbox_messages para el buzón, pero aquí
-- guardamos los campos completos del formulario de contacto.

CREATE TABLE IF NOT EXISTS web_contacts (
  id               TEXT PRIMARY KEY,
  inbox_message_id TEXT NOT NULL,
  external_id      TEXT UNIQUE,

  sender_name      TEXT NOT NULL,
  sender_phone     TEXT,
  sender_email     TEXT,
  subject          TEXT,
  message          TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'new',
  sync_status      TEXT NOT NULL DEFAULT 'pending',
  synced_at        INTEGER,

  source_url       TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,

  FOREIGN KEY (inbox_message_id) REFERENCES inbox_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_web_contacts_inbox  ON web_contacts(inbox_message_id);
CREATE INDEX IF NOT EXISTS idx_web_contacts_sync   ON web_contacts(sync_status);
CREATE INDEX IF NOT EXISTS idx_web_contacts_created ON web_contacts(created_at DESC);

-- ── business_public_config ────────────────────────────────────────────────────
-- Config pública del negocio que el Worker puede servir vía GET /services
-- y GET /config. Se populará desde la app local (Fase 2B) o manualmente.
-- En Fase 2A se usa como mock/seed configurable.

CREATE TABLE IF NOT EXISTS business_public_config (
  key              TEXT PRIMARY KEY,
  value            TEXT NOT NULL,
  updated_at       INTEGER NOT NULL
);

-- Seed inicial con datos de ejemplo (el negocio los actualiza desde la app)
INSERT OR IGNORE INTO business_public_config (key, value, updated_at) VALUES
  ('business_name',    'Mi Peluquería',                              strftime('%s','now') * 1000),
  ('services',         '[{"name":"Corte caballero","price":15,"durationMinutes":30},{"name":"Corte señora","price":25,"durationMinutes":45},{"name":"Tinte","price":55,"durationMinutes":90},{"name":"Mechas","price":80,"durationMinutes":120}]', strftime('%s','now') * 1000),
  ('hours_text',       'Lun–Vie 9:00–20:00 · Sáb 9:00–14:00',      strftime('%s','now') * 1000),
  ('availability_mode','open_slots',                                  strftime('%s','now') * 1000),
  ('slot_interval_minutes', '30',                                     strftime('%s','now') * 1000);
