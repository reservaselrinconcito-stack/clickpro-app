/**
 * sync-service.ts — Vertical: Peluquería
 *
 * Sincronización incremental: Worker D1 → SQLite local.
 *
 * Flujo:
 *   1. Leer workerUrl + syncToken + lastCursor desde sync_config local
 *   2. GET {workerUrl}/inbox/pull?since={cursor}&limit=100
 *      con Authorization: Bearer {token}
 *   3. Por cada item recibido:
 *      - INSERT OR IGNORE por external_id (idempotencia)
 *      - si ya existe: no hacer nada (no sobrescribir estado local)
 *   4. Actualizar cursor con nextCursor de la respuesta
 *   5. Guardar last_sync_at
 *   6. Si hasMore=true → repetir hasta que hasMore=false
 *
 * Idempotencia:
 *   La columna external_id tiene índice UNIQUE. Usamos
 *   INSERT OR IGNORE para nunca duplicar, aunque se llame varias veces.
 *   Si el usuario ya marcó un mensaje como leído / convertido, ese estado
 *   local se preserva (no se sobreescribe con el estado remoto).
 *
 * Configuración:
 *   Se lee/escribe en sync_config (tabla SQLite local).
 *   La URL del Worker y el token se configuran desde Settings.
 */

import { getDbAdapter } from '../../../tauri/db-adapter';
import { nanoid } from 'nanoid';
import type { InboxMessageType } from '../models';

// ─── Tipos internos ────────────────────────────────────────────────────────────

export interface SyncConfig {
  workerUrl: string;
  syncToken: string;
  lastSyncCursor: number;
  lastSyncAt: number;
  autoSync: boolean;
}

export interface SyncResult {
  success: boolean;
  newItems: number;
  skippedItems: number;
  nextCursor: number;
  hasMore: boolean;
  error?: string;
  syncedAt: number;
}

/** Item normalizado recibido del Worker */
interface RemoteInboxItem {
  externalId: string;
  type: string;
  status: string;
  senderName: string;
  senderPhone?: string;
  senderEmail?: string;
  subject?: string;
  body: string;
  preferredDatetime?: number;
  preferredServiceName?: string;
  preferredDate?: string;
  preferredTime?: string;
  notes?: string;
  source: string;
  createdAt: number;
  updatedAt: number;
}

interface WorkerPullResponse {
  items: RemoteInboxItem[];
  count: number;
  nextCursor: number;
  hasMore: boolean;
  syncedAt: number;
  error?: string;
}

// ─── Leer / escribir sync_config ───────────────────────────────────────────────

export async function getSyncConfig(): Promise<SyncConfig> {
  const db = getDbAdapter();
  try {
    const rows = await db.select<{ key: string; value: string }>(
      'SELECT key, value FROM sync_config'
    );
    const m: Record<string, string> = {};
    rows.forEach(r => { m[r.key] = r.value; });

    return {
      workerUrl:       m['worker_url']       ?? '',
      syncToken:       m['sync_token']       ?? '',
      lastSyncCursor:  parseInt(m['last_sync_cursor'] ?? '0') || 0,
      lastSyncAt:      parseInt(m['last_sync_at']     ?? '0') || 0,
      autoSync:        m['auto_sync'] === '1',
    };
  } catch {
    return { workerUrl: '', syncToken: '', lastSyncCursor: 0, lastSyncAt: 0, autoSync: false };
  }
}

export async function setSyncConfigValue(key: string, value: string): Promise<void> {
  const db = getDbAdapter();
  await db.execute(
    'INSERT OR REPLACE INTO sync_config (key, value, updated_at) VALUES (?,?,?)',
    [key, value, Date.now()]
  );
}

export async function saveSyncConfig(cfg: Partial<SyncConfig>): Promise<void> {
  if (cfg.workerUrl       !== undefined) await setSyncConfigValue('worker_url',       cfg.workerUrl);
  if (cfg.syncToken       !== undefined) await setSyncConfigValue('sync_token',       cfg.syncToken);
  if (cfg.lastSyncCursor  !== undefined) await setSyncConfigValue('last_sync_cursor', String(cfg.lastSyncCursor));
  if (cfg.lastSyncAt      !== undefined) await setSyncConfigValue('last_sync_at',     String(cfg.lastSyncAt));
  if (cfg.autoSync        !== undefined) await setSyncConfigValue('auto_sync',        cfg.autoSync ? '1' : '0');
}

// ─── Pull desde Worker ─────────────────────────────────────────────────────────

async function pullFromWorker(
  workerUrl: string,
  syncToken: string,
  since: number,
  limit = 100
): Promise<WorkerPullResponse> {
  const url = `${workerUrl.replace(/\/$/, '')}/inbox/pull?since=${since}&limit=${limit}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${syncToken}`,
      'Content-Type': 'application/json',
    },
    // Timeout de 15 segundos
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 401) {
    throw new Error('Token de sincronización inválido. Revisa la configuración.');
  }
  if (response.status === 403) {
    throw new Error('Sin permiso para sincronizar. Verifica el token.');
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Error del servidor (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json() as WorkerPullResponse;
  return data;
}

// ─── Insertar items en SQLite local ────────────────────────────────────────────

/**
 * Inserta un item remoto en inbox_messages local.
 * Estrategia: INSERT OR IGNORE por external_id.
 * Si ya existe (mismo external_id) → no hace nada (preserva estado local).
 * Retorna true si se insertó, false si ya existía (skip).
 */
async function insertRemoteItem(item: RemoteInboxItem): Promise<boolean> {
  const db = getDbAdapter();

  // Normalizar tipo a los valores del modelo local
  const validTypes: InboxMessageType[] = [
    'reservation-request', 'contact-form', 'whatsapp', 'cancellation', 'other'
  ];
  const type: InboxMessageType = validTypes.includes(item.type as InboxMessageType)
    ? item.type as InboxMessageType
    : 'reservation-request';

  // Calcular preferred_datetime si no viene del server pero sí la fecha/hora
  let preferredDatetime = item.preferredDatetime ?? null;
  if (!preferredDatetime && item.preferredDate && item.preferredTime) {
    try {
      preferredDatetime = new Date(`${item.preferredDate}T${item.preferredTime}:00`).getTime();
    } catch { /* ignore */ }
  }

  // Construir body completo con notas adicionales si las hay
  let body = item.body ?? '';
  if (item.notes && !body.includes(item.notes)) {
    body = body + (body ? '\n' : '') + `Notas: ${item.notes}`;
  }

  try {
    const result = await db.execute(
      `INSERT OR IGNORE INTO inbox_messages (
        id, external_id, type, status,
        sender_name, sender_phone, sender_email,
        subject, body,
        preferred_datetime, preferred_service_name,
        source, synced_from,
        created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        nanoid(),           // id local único
        item.externalId,    // external_id para idempotencia
        type,
        'unread',           // siempre unread al llegar
        item.senderName,
        item.senderPhone   ?? null,
        item.senderEmail   ?? null,
        item.subject       ?? null,
        body,
        preferredDatetime,
        item.preferredServiceName ?? null,
        'web',              // siempre web al venir del Worker
        'worker',           // synced_from
        item.createdAt,
        item.updatedAt,
      ]
    );

    // rowsAffected = 0 si el INSERT fue ignorado (ya existía)
    return result.rowsAffected > 0;

  } catch (err) {
    // Si falla por unique constraint u otro motivo, loguear y continuar
    console.warn(`[Sync] Skip item ${item.externalId}:`, err);
    return false;
  }
}

// ─── Sync principal ────────────────────────────────────────────────────────────

// ─── Confirmar sync al Worker (opcional, best-effort) ─────────────────────────

/**
 * Notifica al Worker que los mensajes con los external_ids indicados
 * han sido importados correctamente en local.
 * Si falla, no es crítico — los mensajes simplemente se re-sincronizarán
 * en la próxima sync y serán ignorados por el INSERT OR IGNORE.
 */
async function markSyncedInWorker(
  workerUrl: string,
  syncToken: string,
  externalIds: string[]
): Promise<void> {
  if (!externalIds.length) return;

  try {
    await fetch(`${workerUrl.replace(/\/$/, '')}/inbox/mark-synced`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${syncToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: externalIds }),
      signal: AbortSignal.timeout(10_000),
    });
    // No lanzar error si falla — es best-effort
  } catch {
    // Ignorar silenciosamente
  }
}


/**
 * Ejecuta una sincronización completa incremental.
 * Descarga todos los items desde el cursor guardado hasta el presente.
 *
 * @param onProgress  callback opcional para mostrar progreso en UI
 */
export async function syncInbox(
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const cfg = await getSyncConfig();

  if (!cfg.workerUrl) {
    return {
      success: false,
      newItems: 0,
      skippedItems: 0,
      nextCursor: cfg.lastSyncCursor,
      hasMore: false,
      error: 'URL del Worker no configurada. Ve a Configuración → Sincronización.',
      syncedAt: Date.now(),
    };
  }

  if (!cfg.syncToken) {
    return {
      success: false,
      newItems: 0,
      skippedItems: 0,
      nextCursor: cfg.lastSyncCursor,
      hasMore: false,
      error: 'Token de sincronización no configurado. Ve a Configuración → Sincronización.',
      syncedAt: Date.now(),
    };
  }

  let cursor = cfg.lastSyncCursor;
  let totalNew = 0;
  let totalSkipped = 0;
  let hasMore = true;
  let lastError: string | undefined;
  let rounds = 0;
  const MAX_ROUNDS = 20; // seguridad: max 20 páginas (= 2000 items) por sync

  try {
    while (hasMore && rounds < MAX_ROUNDS) {
      rounds++;
      onProgress?.(`Descargando entradas desde el servidor… (página ${rounds})`);

      const response = await pullFromWorker(cfg.workerUrl, cfg.syncToken, cursor, 100);

      if (!response.items || !Array.isArray(response.items)) {
        throw new Error('Respuesta inesperada del servidor.');
      }

      // Insertar items de esta página
      const insertedIds: string[] = [];
      for (const item of response.items) {
        const inserted = await insertRemoteItem(item);
        if (inserted) {
          totalNew++;
          insertedIds.push(item.externalId);
        } else {
          totalSkipped++;
        }
      }
      // Confirmar al Worker qué mensajes llegaron bien (best-effort)
      if (insertedIds.length > 0) {
        markSyncedInWorker(cfg.workerUrl, cfg.syncToken, insertedIds).catch(() => {});
      }

      cursor = response.nextCursor;
      hasMore = response.hasMore;

      // Si no hay nuevos items, parar aunque hasMore sea true
      if (response.items.length === 0) break;
    }

    // Guardar cursor actualizado
    const syncedAt = Date.now();
    await saveSyncConfig({ lastSyncCursor: cursor, lastSyncAt: syncedAt });

    // Confirmar sync al Worker (best-effort, no bloquea si falla)
    // Recogemos los external_ids de los items que sí se insertaron
    // (totalNew > 0 implica que insertedIds tiene elementos)

    onProgress?.(
      totalNew > 0
        ? `✓ Sync completada: ${totalNew} nuevas entradas.`
        : '✓ Sin entradas nuevas.'
    );

    return {
      success: true,
      newItems: totalNew,
      skippedItems: totalSkipped,
      nextCursor: cursor,
      hasMore: rounds >= MAX_ROUNDS && hasMore,
      syncedAt,
    };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Sync] Error:', errorMsg);

    return {
      success: false,
      newItems: totalNew,
      skippedItems: totalSkipped,
      nextCursor: cursor,
      hasMore: false,
      error: errorMsg,
      syncedAt: Date.now(),
    };
  }
}

// ─── Reset cursor (force full re-sync) ────────────────────────────────────────

export async function resetSyncCursor(): Promise<void> {
  await saveSyncConfig({ lastSyncCursor: 0 });
}

// ─── Formatear last_sync_at para UI ───────────────────────────────────────────

export function formatLastSync(lastSyncAt: number): string {
  if (!lastSyncAt) return 'Nunca sincronizado';

  const diff = Date.now() - lastSyncAt;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 1)   return 'Hace unos segundos';
  if (mins < 60)  return `Hace ${mins} min`;
  if (hours < 24) return `Hace ${hours}h`;
  return `Hace ${days}d`;
}
