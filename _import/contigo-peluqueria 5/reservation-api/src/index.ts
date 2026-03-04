/**
 * reservation-api/src/index.ts — Contigo v2.4.1
 *
 * Cloudflare Worker: API pública del negocio.
 *
 * RUTAS:
 *   POST /reservations  — Enviar solicitud de cita
 *   POST /contact       — Enviar formulario de contacto
 *   GET  /services      — Lista pública de servicios
 *   GET  /availability  — Huecos disponibles (orientativo, Fase 2A)
 *   GET  /health        — Estado del Worker
 *
 * ⚠️ Fase 2A: /availability es orientativo (horario configurado, sin citas reales).
 *    En Fase 2B se sincronizará con la app local.
 */

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  API_SECRET: string;
  WORKER_VERSION?: string;
}

interface ServiceItem {
  name: string;
  price: number;
  durationMinutes: number;
  category?: string;
}

// ─── CORS ──────────────────────────────────────────────────────────────────────

function getCorsHeaders(origin: string, env: Env): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
  const isAllowed = allowed.includes('*') || allowed.includes(origin) || origin.endsWith('.pages.dev');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : (allowed[0] ?? '*'),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(data: unknown, status = 200, origin = '*', env?: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(env ? getCorsHeaders(origin, env) : {}),
    },
  });
}

// ─── Rate limiting ─────────────────────────────────────────────────────────────

const buckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (b.count >= limit) return true;
  b.count++;
  return false;
}

// ─── Validación y sanitización ─────────────────────────────────────────────────

function sanitize(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength).replace(/<[^>]*>/g, '').replace(/[<>'"]/g, '').trim();
}

function sanitizeDate(value: unknown): string {
  const s = sanitize(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function sanitizeTime(value: unknown): string {
  const s = sanitize(value, 5);
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function isValidPhone(p: string): boolean {
  return /^[+\d\s\-().]{7,20}$/.test(p);
}

async function makeExternalId(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`contigo:${ip}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// ─── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(origin, env) });
    }

    try {
      if (path === '/reservations' && method === 'POST') return handleReservation(request, env, origin);
      if (path === '/contact'      && method === 'POST') return handleContact(request, env, origin);
      if (path === '/services'     && method === 'GET')  return handleGetServices(env, origin);
      if (path === '/availability' && method === 'GET')  return handleGetAvailability(url, env, origin);
      if (path === '/inbox/pull'        && method === 'GET')  return handleInboxPull(request, env, origin);
      if (path === '/inbox/mark-synced' && method === 'POST') return handleMarkSynced(request, env, origin);
      if (path === '/health'       && method === 'GET')  return json({ status: 'ok', version: env.WORKER_VERSION ?? '2.4.2', ts: new Date().toISOString() }, 200, origin, env);
      return json({ error: 'Ruta no encontrada' }, 404, origin, env);
    } catch (err) {
      console.error('[Worker] Error:', err);
      return json({ error: 'Error interno del servidor' }, 500, origin, env);
    }
  },
};

// ─── POST /reservations ────────────────────────────────────────────────────────
/**
 * Payload:
 * { name, phone?, email?, service?, preferredDate?, preferredTime?, notes? }
 * name y (phone o email) son obligatorios.
 */
async function handleReservation(request: Request, env: Env, origin: string): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(`res:${ip}`, 5, 60_000)) {
    return json({ error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.' }, 429, origin, env);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: 'El cuerpo debe ser JSON válido.' }, 400, origin, env); }

  const name          = sanitize(body.name, 100);
  const phone         = sanitize(body.phone, 30);
  const email         = sanitize(body.email, 200);
  const service       = sanitize(body.service, 100);
  const preferredDate = sanitizeDate(body.preferredDate);
  const preferredTime = sanitizeTime(body.preferredTime);
  const notes         = sanitize(body.notes, 500);

  const errors: string[] = [];
  if (!name || name.length < 2) errors.push('El nombre es obligatorio (mínimo 2 caracteres).');
  if (!phone && !email)         errors.push('Necesitamos un teléfono o un email para contactarte.');
  if (phone && !isValidPhone(phone)) errors.push('El teléfono no tiene un formato válido.');
  if (email && !isValidEmail(email)) errors.push('El email no tiene un formato válido.');
  if (errors.length) return json({ error: errors.join(' '), errors }, 422, origin, env);

  const now = Date.now();
  const id = crypto.randomUUID();
  const externalId = await makeExternalId(`res:${name}:${phone || email}:${preferredDate}:${preferredTime}:${Math.floor(now / 3_600_000)}`);
  const ipHash = await hashIp(ip);
  const preferredDatetime = preferredDate && preferredTime ? new Date(`${preferredDate}T${preferredTime}:00`).getTime() : null;

  const bodyText = [
    'Solicitud de cita recibida desde la web.',
    service       ? `Servicio: ${service}` : null,
    preferredDate ? `Fecha preferida: ${preferredDate}` : null,
    preferredTime ? `Hora preferida: ${preferredTime}` : null,
    notes         ? `Notas: ${notes}` : null,
  ].filter(Boolean).join('\n');

  try {
    await env.DB.prepare(`
      INSERT INTO inbox_messages
        (id, external_id, type, status, sync_status, sender_name, sender_phone, sender_email,
         body, preferred_datetime, preferred_service_name, source, ip_hash, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(external_id) DO NOTHING
    `).bind(id, externalId, 'reservation-request', 'unread', 'pending',
            name, phone || null, email || null,
            bodyText, preferredDatetime, service || null,
            'web', ipHash, now, now).run();

    await env.DB.prepare(`
      INSERT INTO web_reservations
        (id, inbox_message_id, external_id, client_name, client_phone, client_email,
         service_name, preferred_date, preferred_time, preferred_datetime,
         notes, status, sync_status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(external_id) DO NOTHING
    `).bind(crypto.randomUUID(), id, externalId,
            name, phone || null, email || null,
            service || null, preferredDate || null, preferredTime || null, preferredDatetime,
            notes || null, 'new', 'pending', now, now).run();

  } catch (dbErr) {
    console.error('[Worker] DB /reservations:', dbErr);
    return json({ error: 'No se pudo guardar la solicitud. Inténtalo más tarde.' }, 500, origin, env);
  }

  return json({ ok: true, id, message: '¡Solicitud recibida! Te contactaremos pronto para confirmar tu cita.' }, 201, origin, env);
}

// ─── POST /contact ─────────────────────────────────────────────────────────────
/**
 * Payload:
 * { name, phone?, email?, subject?, message }
 * name, message y (phone o email) son obligatorios.
 */
async function handleContact(request: Request, env: Env, origin: string): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(`con:${ip}`, 3, 60_000)) {
    return json({ error: 'Demasiadas solicitudes. Espera un momento.' }, 429, origin, env);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: 'El cuerpo debe ser JSON válido.' }, 400, origin, env); }

  const name    = sanitize(body.name, 100);
  const phone   = sanitize(body.phone, 30);
  const email   = sanitize(body.email, 200);
  const subject = sanitize(body.subject, 200);
  const message = sanitize(body.message, 2000);

  const errors: string[] = [];
  if (!name || name.length < 2) errors.push('El nombre es obligatorio.');
  if (!message || message.length < 5) errors.push('El mensaje es obligatorio (mínimo 5 caracteres).');
  if (!phone && !email) errors.push('Necesitamos un teléfono o un email para responderte.');
  if (phone && !isValidPhone(phone)) errors.push('El teléfono no tiene un formato válido.');
  if (email && !isValidEmail(email)) errors.push('El email no tiene un formato válido.');
  if (errors.length) return json({ error: errors.join(' '), errors }, 422, origin, env);

  const now = Date.now();
  const id = crypto.randomUUID();
  const externalId = await makeExternalId(`con:${name}:${phone || email}:${message.slice(0, 50)}:${Math.floor(now / 3_600_000)}`);
  const ipHash = await hashIp(ip);

  try {
    await env.DB.prepare(`
      INSERT INTO inbox_messages
        (id, external_id, type, status, sync_status, sender_name, sender_phone, sender_email,
         subject, body, source, ip_hash, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(external_id) DO NOTHING
    `).bind(id, externalId, 'contact-form', 'unread', 'pending',
            name, phone || null, email || null,
            subject || null, message, 'web', ipHash, now, now).run();

    await env.DB.prepare(`
      INSERT INTO web_contacts
        (id, inbox_message_id, external_id, sender_name, sender_phone, sender_email,
         subject, message, status, sync_status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(external_id) DO NOTHING
    `).bind(crypto.randomUUID(), id, externalId,
            name, phone || null, email || null,
            subject || null, message, 'new', 'pending', now, now).run();

  } catch (dbErr) {
    console.error('[Worker] DB /contact:', dbErr);
    return json({ error: 'No se pudo guardar el mensaje. Inténtalo más tarde.' }, 500, origin, env);
  }

  return json({ ok: true, id, message: 'Mensaje recibido. Te responderemos lo antes posible.' }, 201, origin, env);
}

// ─── GET /services ─────────────────────────────────────────────────────────────
/**
 * Devuelve la lista pública de servicios del negocio.
 * Lee de business_public_config (key='services') en D1.
 * En Fase 2A: seed manual con el schema SQL.
 * En Fase 2B: la app local actualizará este valor al hacer sync.
 */
async function handleGetServices(env: Env, origin: string): Promise<Response> {
  try {
    const row = await env.DB.prepare(
      "SELECT value FROM business_public_config WHERE key='services'"
    ).first<{ value: string }>();

    const services: ServiceItem[] = row?.value ? JSON.parse(row.value) : [];
    return json({ services }, 200, origin, env);
  } catch (err) {
    console.error('[Worker] /services:', err);
    return json({ services: [] }, 200, origin, env);
  }
}

// ─── GET /availability ─────────────────────────────────────────────────────────
/**
 * Devuelve huecos disponibles para una fecha.
 *
 * ⚠️ LIMITACIÓN FASE 2A: calculado desde horario configurado, SIN consultar
 * citas existentes. El frontend debe advertir al usuario que es orientativo.
 *
 * Query params: date=YYYY-MM-DD (requerido)
 */
async function handleGetAvailability(url: URL, env: Env, origin: string): Promise<Response> {
  const dateParam = sanitizeDate(url.searchParams.get('date'));
  if (!dateParam) {
    return json({ error: 'Parámetro "date" requerido (formato YYYY-MM-DD).' }, 400, origin, env);
  }

  const requestedDate = new Date(`${dateParam}T00:00:00`);
  if (isNaN(requestedDate.getTime())) {
    return json({ error: 'Fecha no válida.' }, 400, origin, env);
  }

  let intervalMinutes = 30;
  let openTime = '09:00';
  let closeTime = '20:00';

  try {
    const rows = await env.DB.prepare(
      "SELECT key, value FROM business_public_config WHERE key IN ('slot_interval_minutes')"
    ).all<{ key: string; value: string }>();
    const cfg: Record<string, string> = {};
    rows.results?.forEach(r => { cfg[r.key] = r.value; });
    if (cfg['slot_interval_minutes']) intervalMinutes = parseInt(cfg['slot_interval_minutes']) || 30;
  } catch { /* use defaults */ }

  const dayOfWeek = requestedDate.getDay();
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;

  if (isSunday) {
    return json({ date: dateParam, slots: [], isOpen: false, note: 'Cerrado los domingos.' }, 200, origin, env);
  }
  if (isSaturday) closeTime = '14:00';

  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;

  const now = new Date();
  const isToday = dateParam === now.toISOString().slice(0, 10);
  const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : -1;

  const slots = [];
  for (let m = openMin; m < closeMin; m += intervalMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push({
      time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
      available: m > nowMin,
    });
  }

  return json({
    date: dateParam,
    slots,
    isOpen: true,
    openTime,
    closeTime,
    intervalMinutes,
    note: '⚠️ Disponibilidad orientativa. Las citas están sujetas a confirmación por el negocio.',
  }, 200, origin, env);
}

// ─── GET /inbox/pull ───────────────────────────────────────────────────────────
/**
 * Endpoint de sincronización para la app de escritorio.
 *
 * Devuelve entradas nuevas desde un cursor (timestamp Unix ms).
 * La app local guarda el cursor y lo envía en cada llamada para
 * recibir solo los mensajes que no ha visto todavía.
 *
 * Autenticación: Bearer token en Authorization header.
 * El token se configura como secreto del Worker (API_SECRET)
 * y se almacena en sync_config de la app local (sync_token).
 *
 * Query params:
 *   since  — Unix ms timestamp (default: 0 = todo)
 *   limit  — máximo de registros (default: 100, max: 500)
 *   type   — filtrar por tipo: "reservation-request" | "contact-form" | todos (omitir)
 *
 * Respuesta 200:
 * {
 *   "items": [...],
 *   "count": 12,
 *   "nextCursor": 1734000000000,  // usar como "since" en la próxima llamada
 *   "hasMore": false
 * }
 *
 * Respuesta 401: token ausente o inválido
 * Respuesta 400: parámetros inválidos
 */

// Añadir la ruta al router principal — patch inline al export default
// (no se puede redeclarar, se registra como función externa y se llama desde el handler)
export async function handleInboxPull(request: Request, env: Env, origin: string): Promise<Response> {
  // ── Autenticación ──────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!env.API_SECRET || !token || token !== env.API_SECRET) {
    return json({ error: 'No autorizado. Token inválido o ausente.' }, 401, origin, env);
  }

  // ── Parámetros ────────────────────────────────────────────────────────────
  const url = new URL(request.url);
  const sinceRaw = parseInt(url.searchParams.get('since') ?? '0');
  const limitRaw = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500);
  const typeFilter = sanitize(url.searchParams.get('type') ?? '', 50);

  const since = isNaN(sinceRaw) || sinceRaw < 0 ? 0 : sinceRaw;
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 100 : limitRaw;

  try {
    // ── Consulta ──────────────────────────────────────────────────────────────
    let query = `
      SELECT
        m.id           AS external_id,
        m.type,
        m.status,
        m.sender_name,
        m.sender_phone,
        m.sender_email,
        m.subject,
        m.body,
        m.preferred_datetime,
        m.preferred_service_name,
        m.source,
        m.created_at,
        m.updated_at,
        -- Datos detallados de la reserva (si existe)
        r.preferred_date,
        r.preferred_time,
        r.notes         AS reservation_notes,
        r.service_name  AS reservation_service
      FROM inbox_messages m
      LEFT JOIN web_reservations r ON r.inbox_message_id = m.id
      WHERE m.created_at > ?
    `;
    const params: (string | number)[] = [since];

    if (typeFilter && ['reservation-request', 'contact-form', 'whatsapp', 'cancellation', 'other'].includes(typeFilter)) {
      query += ' AND m.type = ?';
      params.push(typeFilter);
    }

    // +1 para saber si hay más páginas
    query += ' ORDER BY m.created_at ASC LIMIT ?';
    params.push(limit + 1);

    const rows = await env.DB.prepare(query).bind(...params).all<Record<string, unknown>>();
    const allResults = rows.results ?? [];
    const hasMore = allResults.length > limit;
    const items = hasMore ? allResults.slice(0, limit) : allResults;

    // Cursor = created_at del último item devuelto
    const nextCursor = items.length > 0
      ? (items[items.length - 1].created_at as number)
      : since;

    // ── Normalizar payload ────────────────────────────────────────────────────
    const normalized = items.map(row => ({
      externalId:           row.external_id as string,
      type:                 row.type as string,
      status:               (row.status as string) === 'unread' ? 'unread' : 'unread', // siempre unread al sincronizar
      senderName:           row.sender_name as string,
      senderPhone:          (row.sender_phone as string | null) ?? undefined,
      senderEmail:          (row.sender_email as string | null) ?? undefined,
      subject:              (row.subject as string | null) ?? undefined,
      body:                 row.body as string,
      preferredDatetime:    (row.preferred_datetime as number | null) ?? undefined,
      preferredServiceName: (row.reservation_service as string | null)
                            ?? (row.preferred_service_name as string | null)
                            ?? undefined,
      preferredDate:        (row.preferred_date as string | null) ?? undefined,
      preferredTime:        (row.preferred_time as string | null) ?? undefined,
      notes:                (row.reservation_notes as string | null) ?? undefined,
      source:               (row.source as string) ?? 'web',
      createdAt:            row.created_at as number,
      updatedAt:            row.updated_at as number,
    }));

    return json({
      items: normalized,
      count: normalized.length,
      nextCursor,
      hasMore,
      syncedAt: Date.now(),
    }, 200, origin, env);

  } catch (err) {
    console.error('[Worker] Error en /inbox/pull:', err);
    return json({ error: 'Error al leer entradas.' }, 500, origin, env);
  }
}

// ─── POST /inbox/mark-synced ──────────────────────────────────────────────────
/**
 * La app local confirma que ha descargado y guardado una lista de mensajes.
 * El Worker actualiza sync_status a "synced" en esos registros.
 * Esto permite, en el futuro, limpiar mensajes viejos ya sincronizados.
 *
 * Autenticación: Bearer token (mismo API_SECRET).
 *
 * Payload: { "ids": ["external_id_1", "external_id_2", ...] }
 * Respuesta: { "ok": true, "updated": N }
 */
export async function handleMarkSynced(request: Request, env: Env, origin: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!env.API_SECRET || !token || token !== env.API_SECRET) {
    return json({ error: 'No autorizado.' }, 401, origin, env);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido.' }, 400, origin, env); }

  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return json({ error: 'ids debe ser un array no vacío.' }, 422, origin, env);
  }
  if (ids.length > 500) {
    return json({ error: 'Máximo 500 ids por llamada.' }, 422, origin, env);
  }

  // Sanitizar ids
  const cleanIds = (ids as unknown[])
    .filter(id => typeof id === 'string' && id.length <= 64)
    .map(id => id as string);

  if (cleanIds.length === 0) {
    return json({ ok: true, updated: 0 }, 200, origin, env);
  }

  const now = Date.now();
  try {
    // Actualizar en lotes de 100 (límite de parámetros D1)
    let updated = 0;
    for (let i = 0; i < cleanIds.length; i += 100) {
      const batch = cleanIds.slice(i, i + 100);
      const placeholders = batch.map(() => '?').join(',');
      const result = await env.DB.prepare(
        `UPDATE inbox_messages SET sync_status='synced', synced_at=? WHERE id IN (${placeholders})`
      ).bind(now, ...batch).run();
      updated += result.meta?.changes ?? 0;
    }

    return json({ ok: true, updated }, 200, origin, env);
  } catch (err) {
    console.error('[Worker] Error en /inbox/mark-synced:', err);
    return json({ error: 'Error al actualizar estado.' }, 500, origin, env);
  }
}
