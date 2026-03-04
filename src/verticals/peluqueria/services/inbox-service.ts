/**
 * inbox-service.ts — Vertical: Peluquería
 *
 * Business logic for the notification inbox (buzón):
 * reservation requests from web, WhatsApp logs, contact forms.
 */

import { getAdapter as getDbAdapter } from '@/core/db-adapter';
import type { InboxMessage, InboxMessageStatus, InboxMessageType } from '../models';
import { nanoid } from 'nanoid';

// ─── Helper ───────────────────────────────────────────────────────────────────

function rowToMessage(r: Record<string, unknown>): InboxMessage {
  return {
    id: r.id as string,
    type: r.type as InboxMessageType,
    status: r.status as InboxMessageStatus,
    senderName: r.sender_name as string,
    senderPhone: r.sender_phone as string | undefined,
    senderEmail: r.sender_email as string | undefined,
    subject: r.subject as string | undefined,
    body: r.body as string,
    preferredDatetime: r.preferred_datetime as number | undefined,
    preferredServiceId: r.preferred_service_id as string | undefined,
    preferredServiceName: r.preferred_service_name as string | undefined,
    preferredProfessionalId: r.preferred_professional_id as string | undefined,
    appointmentId: r.appointment_id as string | undefined,
    source: r.source as InboxMessage['source'],
    readAt: r.read_at as number | undefined,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateInboxMessageInput {
  type?: InboxMessageType;
  senderName: string;
  senderPhone?: string;
  senderEmail?: string;
  subject?: string;
  body: string;
  preferredDatetime?: number;
  preferredServiceId?: string;
  preferredServiceName?: string;
  preferredProfessionalId?: string;
  source?: InboxMessage['source'];
}

export async function createInboxMessage(
  input: CreateInboxMessageInput
): Promise<InboxMessage> {
  const db = getDbAdapter();
  const now = Date.now();
  const id = nanoid();

  await db.execute(
    `INSERT INTO inbox_messages (
      id, type, status, sender_name, sender_phone, sender_email,
      subject, body, preferred_datetime, preferred_service_id, preferred_service_name,
      preferred_professional_id, source,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      input.type ?? 'reservation-request',
      'unread',
      input.senderName,
      input.senderPhone ?? null,
      input.senderEmail ?? null,
      input.subject ?? null,
      input.body,
      input.preferredDatetime ?? null,
      input.preferredServiceId ?? null,
      input.preferredServiceName ?? null,
      input.preferredProfessionalId ?? null,
      input.source ?? 'manual',
      now,
      now,
    ]
  );

  return {
    id,
    type: input.type ?? 'reservation-request',
    status: 'unread',
    senderName: input.senderName,
    senderPhone: input.senderPhone,
    senderEmail: input.senderEmail,
    subject: input.subject,
    body: input.body,
    preferredDatetime: input.preferredDatetime,
    preferredServiceId: input.preferredServiceId,
    preferredServiceName: input.preferredServiceName,
    preferredProfessionalId: input.preferredProfessionalId,
    source: input.source ?? 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

export interface GetInboxOptions {
  status?: InboxMessageStatus | 'all';
  limit?: number;
  offset?: number;
}

export async function getInboxMessages(
  opts: GetInboxOptions = {}
): Promise<InboxMessage[]> {
  const db = getDbAdapter();
  const { status = 'all', limit = 100, offset = 0 } = opts;

  // Seleccionar synced_from si existe (añadida en migración v4)
  let sql = 'SELECT *, synced_from FROM inbox_messages';
  const args: unknown[] = [];

  if (status !== 'all') {
    sql += ' WHERE status = ?';
    args.push(status);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  args.push(limit, offset);

  const rows = await db.select<Record<string, unknown>>(sql, args);
  return rows.map(row => ({
    ...rowToMessage(row),
    syncedFrom: row.synced_from as string | undefined,
  })) as Array<InboxMessage & { syncedFrom?: string }>;
}

export async function getInboxMessage(id: string): Promise<InboxMessage | null> {
  const db = getDbAdapter();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM inbox_messages WHERE id=?', [id]
  );
  return rows.length ? rowToMessage(rows[0]) : null;
}

export async function markAsRead(id: string): Promise<void> {
  const db = getDbAdapter();
  const now = Date.now();
  await db.execute(
    `UPDATE inbox_messages
     SET status = CASE WHEN status = 'unread' THEN 'read' ELSE status END,
         read_at = CASE WHEN read_at IS NULL THEN ? ELSE read_at END,
         updated_at = ?
     WHERE id = ?`,
    [now, now, id]
  );
}

export async function updateInboxStatus(
  id: string,
  status: InboxMessageStatus
): Promise<void> {
  const db = getDbAdapter();
  const now = Date.now();
  const readAt = status !== 'unread' ? now : null;
  await db.execute(
    'UPDATE inbox_messages SET status=?, read_at=COALESCE(read_at,?), updated_at=? WHERE id=?',
    [status, readAt, now, id]
  );
}

/** Mark inbox message as converted to appointment */
export async function convertToAppointment(
  messageId: string,
  appointmentId: string
): Promise<void> {
  const db = getDbAdapter();
  await db.execute(
    `UPDATE inbox_messages
     SET status='converted', appointment_id=?, read_at=COALESCE(read_at,?), updated_at=?
     WHERE id=?`,
    [appointmentId, Date.now(), Date.now(), messageId]
  );
}

export async function deleteInboxMessage(id: string): Promise<void> {
  const db = getDbAdapter();
  await db.execute('DELETE FROM inbox_messages WHERE id=?', [id]);
}

// ─── Unread Count ─────────────────────────────────────────────────────────────

export async function getUnreadCount(): Promise<number> {
  const db = getDbAdapter();
  try {
    const rows = await db.select<{ count: number }>(
      `SELECT COUNT(*) as count FROM inbox_messages WHERE status IN ('unread', 'pending')`
    );
    return rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}
