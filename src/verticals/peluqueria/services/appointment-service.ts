/**
 * appointment-service.ts — Vertical: Peluquería
 *
 * All business logic for creating, reading, updating, moving and
 * cancelling appointments. Runs against the core SqliteAdapter.
 */

import { getAdapter as getDbAdapter } from '@/core/db-adapter';
import type {
  Appointment,
  AppointmentStatus,
  AppointmentOrigin,
} from '../models';
import { nanoid } from 'nanoid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToAppointment(r: Record<string, unknown>): Appointment {
  return {
    id: r.id as string,
    contactId: r.contact_id as string | undefined,
    clientName: r.client_name as string,
    clientPhone: r.client_phone as string | undefined,
    clientEmail: r.client_email as string | undefined,
    serviceId: r.service_id as string,
    serviceName: r.service_name as string,
    professionalId: r.professional_id as string | undefined,
    professionalName: r.professional_name as string | undefined,
    startDatetime: r.start_datetime as number,
    durationMinutes: r.duration_minutes as number,
    bufferMinutes: r.buffer_minutes as number,
    endDatetime: r.end_datetime as number,
    status: r.status as AppointmentStatus,
    origin: r.origin as AppointmentOrigin,
    notes: r.notes as string | undefined,
    inboxMessageId: r.inbox_message_id as string | undefined,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

// ─── Overlap Detection ────────────────────────────────────────────────────────

/**
 * Check if a proposed time slot overlaps with any existing appointment
 * for the same professional (or whole-salon if no professional set).
 *
 * Returns conflicting appointment ids, empty array = no conflicts.
 */
export async function checkOverlap(params: {
  professionalId?: string;
  startDatetime: number;
  endDatetime: number;
  excludeAppointmentId?: string;
}): Promise<Appointment[]> {
  const db = getDbAdapter();

  const { professionalId, startDatetime, endDatetime, excludeAppointmentId } = params;

  // An appointment overlaps if:
  // proposed.start < existing.end AND proposed.end > existing.start
  let sql = `
    SELECT * FROM appointments
    WHERE status NOT IN ('cancelled', 'no-show')
      AND start_datetime < ?
      AND end_datetime > ?
  `;
  const args: unknown[] = [endDatetime, startDatetime];

  if (professionalId) {
    sql += ` AND professional_id = ?`;
    args.push(professionalId);
  }

  if (excludeAppointmentId) {
    sql += ` AND id != ?`;
    args.push(excludeAppointmentId);
  }

  const rows = await db.select<Record<string, unknown>>(sql, args);
  return rows.map(rowToAppointment);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateAppointmentInput {
  contactId?: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  serviceId: string;
  serviceName: string;
  professionalId?: string;
  professionalName?: string;
  startDatetime: number;
  durationMinutes: number;
  bufferMinutes?: number;
  status?: AppointmentStatus;
  origin?: AppointmentOrigin;
  notes?: string;
  inboxMessageId?: string;
}

export async function createAppointment(
  input: CreateAppointmentInput,
  skipOverlapCheck = false
): Promise<{ appointment: Appointment; conflicts: Appointment[] }> {
  const db = getDbAdapter();
  const now = Date.now();
  const bufferMinutes = input.bufferMinutes ?? 0;
  const endDatetime =
    input.startDatetime + (input.durationMinutes + bufferMinutes) * 60_000;

  // Overlap check
  const conflicts = skipOverlapCheck
    ? []
    : await checkOverlap({
        professionalId: input.professionalId,
        startDatetime: input.startDatetime,
        endDatetime,
      });

  const id = nanoid();
  const appointment: Appointment = {
    id,
    contactId: input.contactId,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    clientEmail: input.clientEmail,
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    professionalId: input.professionalId,
    professionalName: input.professionalName,
    startDatetime: input.startDatetime,
    durationMinutes: input.durationMinutes,
    bufferMinutes,
    endDatetime,
    status: input.status ?? 'pending',
    origin: input.origin ?? 'manual',
    notes: input.notes,
    inboxMessageId: input.inboxMessageId,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(
    `INSERT INTO appointments (
      id, contact_id, client_name, client_phone, client_email,
      service_id, service_name, professional_id, professional_name,
      start_datetime, duration_minutes, buffer_minutes, end_datetime,
      status, origin, notes, inbox_message_id,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      appointment.id,
      appointment.contactId ?? null,
      appointment.clientName,
      appointment.clientPhone ?? null,
      appointment.clientEmail ?? null,
      appointment.serviceId,
      appointment.serviceName,
      appointment.professionalId ?? null,
      appointment.professionalName ?? null,
      appointment.startDatetime,
      appointment.durationMinutes,
      appointment.bufferMinutes,
      appointment.endDatetime,
      appointment.status,
      appointment.origin,
      appointment.notes ?? null,
      appointment.inboxMessageId ?? null,
      now,
      now,
    ]
  );

  return { appointment, conflicts };
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  const db = getDbAdapter();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM appointments WHERE id = ?',
    [id]
  );
  return rows.length ? rowToAppointment(rows[0]) : null;
}

export async function getAppointmentsByRange(
  from: number,
  to: number,
  professionalId?: string
): Promise<Appointment[]> {
  const db = getDbAdapter();
  let sql = `
    SELECT * FROM appointments
    WHERE start_datetime >= ? AND start_datetime < ?
  `;
  const args: unknown[] = [from, to];

  if (professionalId) {
    sql += ' AND professional_id = ?';
    args.push(professionalId);
  }

  sql += ' ORDER BY start_datetime ASC';

  const rows = await db.select<Record<string, unknown>>(sql, args);
  return rows.map(rowToAppointment);
}

export type UpdateAppointmentInput = Partial<
  Pick<
    Appointment,
    | 'clientName' | 'clientPhone' | 'clientEmail'
    | 'serviceId' | 'serviceName'
    | 'professionalId' | 'professionalName'
    | 'startDatetime' | 'durationMinutes' | 'bufferMinutes'
    | 'status' | 'notes'
  >
>;

export async function updateAppointment(
  id: string,
  input: UpdateAppointmentInput,
  skipOverlapCheck = false
): Promise<{ appointment: Appointment; conflicts: Appointment[] }> {
  const db = getDbAdapter();
  const existing = await getAppointment(id);
  if (!existing) throw new Error(`Appointment ${id} not found`);

  const merged = {
    ...existing,
    ...input,
  };

  const bufferMinutes = merged.bufferMinutes;
  const endDatetime =
    merged.startDatetime + (merged.durationMinutes + bufferMinutes) * 60_000;

  const conflicts = skipOverlapCheck
    ? []
    : await checkOverlap({
        professionalId: merged.professionalId,
        startDatetime: merged.startDatetime,
        endDatetime,
        excludeAppointmentId: id,
      });

  const now = Date.now();

  await db.execute(
    `UPDATE appointments SET
      client_name=?, client_phone=?, client_email=?,
      service_id=?, service_name=?,
      professional_id=?, professional_name=?,
      start_datetime=?, duration_minutes=?, buffer_minutes=?, end_datetime=?,
      status=?, notes=?,
      updated_at=?
    WHERE id=?`,
    [
      merged.clientName,
      merged.clientPhone ?? null,
      merged.clientEmail ?? null,
      merged.serviceId,
      merged.serviceName,
      merged.professionalId ?? null,
      merged.professionalName ?? null,
      merged.startDatetime,
      merged.durationMinutes,
      bufferMinutes,
      endDatetime,
      merged.status,
      merged.notes ?? null,
      now,
      id,
    ]
  );

  return {
    appointment: { ...merged, endDatetime, updatedAt: now },
    conflicts,
  };
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus
): Promise<void> {
  const db = getDbAdapter();
  await db.execute(
    'UPDATE appointments SET status=?, updated_at=? WHERE id=?',
    [status, Date.now(), id]
  );
}

/** Move appointment to a new start time (keeping same duration) */
export async function moveAppointment(
  id: string,
  newStartDatetime: number
): Promise<{ appointment: Appointment; conflicts: Appointment[] }> {
  const existing = await getAppointment(id);
  if (!existing) throw new Error(`Appointment ${id} not found`);

  return updateAppointment(id, { startDatetime: newStartDatetime });
}

export async function deleteAppointment(id: string): Promise<void> {
  const db = getDbAdapter();
  await db.execute('DELETE FROM appointments WHERE id=?', [id]);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getTodayStats(): Promise<{
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
}> {
  const db = getDbAdapter();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);

  const rows = await db.select<{ status: string; count: number }>(
    `SELECT status, COUNT(*) as count FROM appointments
     WHERE start_datetime BETWEEN ? AND ?
     GROUP BY status`,
    [dayStart.getTime(), dayEnd.getTime()]
  );

  const counts: Record<string, number> = {};
  rows.forEach(r => { counts[r.status] = r.count; });

  return {
    total: rows.reduce((s, r) => s + r.count, 0),
    pending: counts['pending'] ?? 0,
    confirmed: counts['confirmed'] ?? 0,
    completed: counts['completed'] ?? 0,
    cancelled: counts['cancelled'] ?? 0,
  };
}
