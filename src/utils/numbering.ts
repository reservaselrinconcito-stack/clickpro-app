import { getAdapter } from '@/core/db-adapter';
import type { Counter } from '../../types';

/**
 * Genera un número correlativo atómico para facturas/presupuestos.
 * Formato: [Prefijo][Año]-[Correlativo de 3 dígitos]
 * Ejemplo: F2026-001
 *
 * The counter record is stored with id = key (e.g. "invoice-2026").
 * Both Counter.key and Counter.id point to the same value for adapter compatibility.
 */
export async function generateDocumentNumber(type: 'invoice' | 'quote'): Promise<string> {
  const year = new Date().getFullYear();
  const key  = `${type}-${year}`;
  const adapter = getAdapter();

  // Counter records have id === key (adapter requires id field)
  type CounterRecord = Counter & { id: string };

  const existing = await adapter.get<CounterRecord>('counters', key);
  const nextValue = (existing?.value ?? 0) + 1;

  const record: CounterRecord = { id: key, key, value: nextValue };
  await adapter.put<CounterRecord>('counters', record);

  const prefix = type === 'invoice' ? 'F' : 'P';
  return `${prefix}${year}-${String(nextValue).padStart(3, '0')}`;
}
