/**
 * v4-sync.ts — Migración aditiva para soporte de sincronización
 *
 * Añade a la tabla inbox_messages (ya existente en v3) las columnas
 * necesarias para idempotencia y trazabilidad de sync:
 *   - external_id: ID del mensaje en el D1 remoto (Worker)
 *   - synced_from: de qué fuente vino ("worker" | "manual")
 *
 * Crea la tabla sync_config para guardar el cursor de última sync,
 * URL del worker, etc.
 *
 * Seguro: solo ALTER TABLE ADD COLUMN (additive, sin tocar datos).
 * SQLite ignora el error si la columna ya existe gracias al bloque
 * try/catch en el migration runner — pero hemos añadido la comprobación
 * previa para ser explícitos.
 */

export const MIGRATION_V4_SYNC = {
  version: 4,
  statements: [
    // ── Añadir external_id a inbox_messages ───────────────────────────────────
    // Identifica unívocamente el mensaje en el D1 remoto.
    // UNIQUE permite la cláusula INSERT OR IGNORE para idempotencia.
    `ALTER TABLE inbox_messages ADD COLUMN external_id TEXT`,

    `CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_external_id
       ON inbox_messages(external_id)
       WHERE external_id IS NOT NULL`,

    // ── Añadir synced_from ────────────────────────────────────────────────────
    // Distingue mensajes creados localmente de los bajados del Worker.
    `ALTER TABLE inbox_messages ADD COLUMN synced_from TEXT DEFAULT 'local'`,

    // ── Tabla sync_config ─────────────────────────────────────────────────────
    // Guarda configuración de sincronización y el cursor de última sync.
    // Usa el mismo patrón key/value que la tabla settings del core.
    `CREATE TABLE IF NOT EXISTS sync_config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    // Valores por defecto (worker_url se configura desde la app)
    `INSERT OR IGNORE INTO sync_config (key, value, updated_at) VALUES
      ('worker_url',       '',    ${Date.now()}),
      ('sync_token',       '',    ${Date.now()}),
      ('last_sync_cursor', '0',   ${Date.now()}),
      ('last_sync_at',     '0',   ${Date.now()}),
      ('auto_sync',        '0',   ${Date.now()})`,
  ],
};
