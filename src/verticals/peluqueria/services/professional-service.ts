/**
 * professional-service.ts — CRUD for professionals (empleados)
 * service-catalog.ts    — CRUD for hair services
 */

import { getAdapter as getDbAdapter } from '@/core/db-adapter';
import type { Professional, HairService } from '../models';
import { nanoid } from 'nanoid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToProfessional(r: Record<string, unknown>): Professional {
  return {
    id: r.id as string,
    name: r.name as string,
    role: r.role as string | undefined,
    phone: r.phone as string | undefined,
    email: r.email as string | undefined,
    colorHex: r.color_hex as string,
    active: Boolean(r.active),
    workDays: JSON.parse(r.work_days as string) as number[],
    workStart: r.work_start as string,
    workEnd: r.work_end as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function rowToService(r: Record<string, unknown>): HairService {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | undefined,
    durationMinutes: r.duration_minutes as number,
    bufferMinutes: r.buffer_minutes as number,
    price: r.price as number,
    colorHex: r.color_hex as string | undefined,
    category: r.category as string | undefined,
    active: Boolean(r.active),
    sortOrder: r.sort_order as number,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

// ─── Professional CRUD ────────────────────────────────────────────────────────

export async function getProfessionals(activeOnly = true): Promise<Professional[]> {
  const db = getDbAdapter();
  const sql = activeOnly
    ? 'SELECT * FROM professionals WHERE active=1 ORDER BY name ASC'
    : 'SELECT * FROM professionals ORDER BY name ASC';
  const rows = await db.select<Record<string, unknown>>(sql);
  return rows.map(rowToProfessional);
}

export async function getProfessional(id: string): Promise<Professional | null> {
  const db = getDbAdapter();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM professionals WHERE id=?', [id]
  );
  return rows.length ? rowToProfessional(rows[0]) : null;
}

export async function createProfessional(
  input: Omit<Professional, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Professional> {
  const db = getDbAdapter();
  const now = Date.now();
  const id = nanoid();

  await db.execute(
    `INSERT INTO professionals
      (id, name, role, phone, email, color_hex, active, work_days, work_start, work_end, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, input.name, input.role ?? null, input.phone ?? null, input.email ?? null,
      input.colorHex, input.active ? 1 : 0,
      JSON.stringify(input.workDays), input.workStart, input.workEnd,
      now, now,
    ]
  );

  return { ...input, id, createdAt: now, updatedAt: now };
}

export async function updateProfessional(
  id: string,
  input: Partial<Omit<Professional, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const db = getDbAdapter();
  const existing = await getProfessional(id);
  if (!existing) throw new Error(`Professional ${id} not found`);

  const merged = { ...existing, ...input };
  await db.execute(
    `UPDATE professionals SET
      name=?, role=?, phone=?, email=?, color_hex=?, active=?,
      work_days=?, work_start=?, work_end=?, updated_at=?
     WHERE id=?`,
    [
      merged.name, merged.role ?? null, merged.phone ?? null, merged.email ?? null,
      merged.colorHex, merged.active ? 1 : 0,
      JSON.stringify(merged.workDays), merged.workStart, merged.workEnd,
      Date.now(), id,
    ]
  );
}

export async function deleteProfessional(id: string): Promise<void> {
  const db = getDbAdapter();
  // Soft delete: mark inactive
  await db.execute(
    'UPDATE professionals SET active=0, updated_at=? WHERE id=?',
    [Date.now(), id]
  );
}

// ─── PROFESSIONAL COLORS ──────────────────────────────────────────────────────

export const PROFESSIONAL_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
];

// ─── Hair Services CRUD ───────────────────────────────────────────────────────

export async function getHairServices(activeOnly = true): Promise<HairService[]> {
  const db = getDbAdapter();
  const sql = activeOnly
    ? 'SELECT * FROM hair_services WHERE active=1 ORDER BY sort_order ASC, name ASC'
    : 'SELECT * FROM hair_services ORDER BY sort_order ASC, name ASC';
  const rows = await db.select<Record<string, unknown>>(sql);
  return rows.map(rowToService);
}

export async function getHairService(id: string): Promise<HairService | null> {
  const db = getDbAdapter();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM hair_services WHERE id=?', [id]
  );
  return rows.length ? rowToService(rows[0]) : null;
}

export async function createHairService(
  input: Omit<HairService, 'id' | 'createdAt' | 'updatedAt'>
): Promise<HairService> {
  const db = getDbAdapter();
  const now = Date.now();
  const id = nanoid();

  await db.execute(
    `INSERT INTO hair_services
      (id, name, description, duration_minutes, buffer_minutes, price, color_hex, category, active, sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, input.name, input.description ?? null,
      input.durationMinutes, input.bufferMinutes, input.price,
      input.colorHex ?? null, input.category ?? null,
      input.active ? 1 : 0, input.sortOrder,
      now, now,
    ]
  );

  return { ...input, id, createdAt: now, updatedAt: now };
}

export async function updateHairService(
  id: string,
  input: Partial<Omit<HairService, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const db = getDbAdapter();
  const existing = await getHairService(id);
  if (!existing) throw new Error(`Service ${id} not found`);

  const m = { ...existing, ...input };
  await db.execute(
    `UPDATE hair_services SET
      name=?, description=?, duration_minutes=?, buffer_minutes=?, price=?,
      color_hex=?, category=?, active=?, sort_order=?, updated_at=?
     WHERE id=?`,
    [
      m.name, m.description ?? null, m.durationMinutes, m.bufferMinutes, m.price,
      m.colorHex ?? null, m.category ?? null, m.active ? 1 : 0, m.sortOrder,
      Date.now(), id,
    ]
  );
}

// ─── Default Services Seed ────────────────────────────────────────────────────

export async function seedDefaultServices(): Promise<void> {
  const existing = await getHairServices(false);
  if (existing.length > 0) return;

  const defaults: Omit<HairService, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Corte caballero', durationMinutes: 30, bufferMinutes: 5, price: 15, colorHex: '#6366f1', active: true, sortOrder: 0 },
    { name: 'Corte señora', durationMinutes: 45, bufferMinutes: 5, price: 25, colorHex: '#ec4899', active: true, sortOrder: 1 },
    { name: 'Corte y barba', durationMinutes: 45, bufferMinutes: 5, price: 22, colorHex: '#8b5cf6', active: true, sortOrder: 2 },
    { name: 'Tinte', durationMinutes: 90, bufferMinutes: 10, price: 55, colorHex: '#f59e0b', category: 'Color', active: true, sortOrder: 3 },
    { name: 'Mechas', durationMinutes: 120, bufferMinutes: 10, price: 80, colorHex: '#f97316', category: 'Color', active: true, sortOrder: 4 },
    { name: 'Balayage', durationMinutes: 150, bufferMinutes: 15, price: 100, colorHex: '#ef4444', category: 'Color', active: true, sortOrder: 5 },
    { name: 'Permanente', durationMinutes: 120, bufferMinutes: 10, price: 65, colorHex: '#10b981', category: 'Tratamiento', active: true, sortOrder: 6 },
    { name: 'Tratamiento hidratante', durationMinutes: 60, bufferMinutes: 5, price: 35, colorHex: '#06b6d4', category: 'Tratamiento', active: true, sortOrder: 7 },
  ];

  for (const svc of defaults) {
    await createHairService(svc);
  }
}

// ─── Calendar Config ──────────────────────────────────────────────────────────

export async function getCalendarConfig(): Promise<{
  slotIntervalMinutes: 15 | 30 | 60;
  defaultView: 'day' | 'week';
  showWeekends: boolean;
}> {
  const db = getDbAdapter();
  try {
    const rows = await db.select<{ key: string; value: string }>(
      'SELECT key, value FROM calendar_config'
    );
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value; });

    return {
      slotIntervalMinutes: (parseInt(map['slot_interval_minutes'] ?? '30') as 15 | 30 | 60),
      defaultView: (map['default_view'] ?? 'week') as 'day' | 'week',
      showWeekends: map['show_weekends'] === '1',
    };
  } catch {
    return { slotIntervalMinutes: 30, defaultView: 'week', showWeekends: false };
  }
}

export async function setCalendarConfig(
  key: string,
  value: string
): Promise<void> {
  const db = getDbAdapter();
  await db.execute(
    'INSERT OR REPLACE INTO calendar_config (key, value) VALUES (?, ?)',
    [key, value]
  );
}
