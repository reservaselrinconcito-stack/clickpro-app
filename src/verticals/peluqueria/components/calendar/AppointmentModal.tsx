/**
 * AppointmentModal.tsx — Create / Edit appointment
 *
 * Rich form with:
 * - Client name + phone (with optional contact lookup)
 * - Service selector (auto-fills duration)
 * - Professional selector
 * - Date + time picker
 * - Duration override
 * - Status selector (edit mode)
 * - Notes
 * - Origin badge
 * - Conflict warning
 */

import React, { useState, useEffect } from 'react';
import {
  X, User, Phone, Scissors, Calendar, Clock,
  AlertTriangle, Trash2, CheckCircle, ChevronDown
} from 'lucide-react';
import type {
  Appointment, AppointmentStatus, Professional, HairService
} from '../../models';
import type { CreateAppointmentInput } from '../../services/appointment-service';
import { checkOverlap } from '../../services/appointment-service';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AppointmentModalProps {
  appointment: Appointment | null;
  prefilledStart: number | null;
  professionals: Professional[];
  services: HairService[];
  onSave: (data: CreateAppointmentInput) => Promise<void>;
  onClose: () => void;
  onStatusChange?: (status: AppointmentStatus) => void;
  onDelete?: () => Promise<void>;
}

// ─── Status options ───────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: AppointmentStatus; label: string; color: string }[] = [
  { value: 'pending',   label: 'Pendiente',   color: 'text-amber-600 bg-amber-50' },
  { value: 'confirmed', label: 'Confirmada',  color: 'text-blue-600 bg-blue-50' },
  { value: 'completed', label: 'Completada',  color: 'text-green-600 bg-green-50' },
  { value: 'cancelled', label: 'Cancelada',   color: 'text-gray-500 bg-gray-100' },
  { value: 'no-show',   label: 'No presentó', color: 'text-red-600 bg-red-50' },
];

const ORIGIN_LABELS: Record<string, string> = {
  manual: 'Manual', web: 'Web', whatsapp: 'WhatsApp', phone: 'Teléfono', inbox: 'Buzón'
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tsToDateLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function tsToTimeLocal(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function dateTimeToTs(dateStr: string, timeStr: string): number {
  return new Date(`${dateStr}T${timeStr}:00`).getTime();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AppointmentModal({
  appointment, prefilledStart, professionals, services,
  onSave, onClose, onStatusChange, onDelete
}: AppointmentModalProps) {
  const isEdit = Boolean(appointment);
  const defaultTs = appointment?.startDatetime ?? prefilledStart ?? Date.now();

  const [clientName, setClientName] = useState(appointment?.clientName ?? '');
  const [clientPhone, setClientPhone] = useState(appointment?.clientPhone ?? '');
  const [clientEmail, setClientEmail] = useState(appointment?.clientEmail ?? '');
  const [serviceId, setServiceId] = useState(appointment?.serviceId ?? services[0]?.id ?? '');
  const [profId, setProfId] = useState(appointment?.professionalId ?? professionals[0]?.id ?? '');
  const [dateStr, setDateStr] = useState(tsToDateLocal(defaultTs));
  const [timeStr, setTimeStr] = useState(tsToTimeLocal(defaultTs));
  const [duration, setDuration] = useState(appointment?.durationMinutes ?? services[0]?.durationMinutes ?? 30);
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [status, setStatus] = useState<AppointmentStatus>(appointment?.status ?? 'pending');
  const [origin, setOrigin] = useState(appointment?.origin ?? 'manual');

  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<Appointment[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const selectedService = services.find(s => s.id === serviceId);
  const selectedProf = professionals.find(p => p.id === profId);

  // Auto-fill duration when service changes
  useEffect(() => {
    if (selectedService) {
      setDuration(selectedService.durationMinutes);
    }
  }, [serviceId]);

  // Overlap check on time/prof change
  useEffect(() => {
    const startTs = dateTimeToTs(dateStr, timeStr);
    const endTs = startTs + duration * 60_000;
    checkOverlap({
      professionalId: profId || undefined,
      startDatetime: startTs,
      endDatetime: endTs,
      excludeAppointmentId: appointment?.id,
    }).then(setConflicts).catch(() => setConflicts([]));
  }, [dateStr, timeStr, duration, profId, appointment?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return;

    setSaving(true);
    try {
      const startDatetime = dateTimeToTs(dateStr, timeStr);
      const service = services.find(s => s.id === serviceId);
      const prof = professionals.find(p => p.id === profId);

      await onSave({
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim() || undefined,
        clientEmail: clientEmail.trim() || undefined,
        serviceId,
        serviceName: service?.name ?? '',
        professionalId: profId || undefined,
        professionalName: prof?.name,
        startDatetime,
        durationMinutes: duration,
        bufferMinutes: service?.bufferMinutes ?? 0,
        status,
        origin: origin as Appointment['origin'],
        notes: notes.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">
              {isEdit ? 'Editar cita' : 'Nueva cita'}
            </h2>
            {isEdit && appointment && (
              <span className="text-xs text-gray-400">
                {ORIGIN_LABELS[appointment.origin]} · #{appointment.id.slice(0, 6)}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Conflict warning */}
        {conflicts.length > 0 && (
          <div className="mx-5 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700">
              <strong>Conflicto de horario:</strong>{' '}
              {conflicts[0].clientName} tiene cita a las {
                new Date(conflicts[0].startDatetime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
              }
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Status (edit only) */}
          {isEdit && (
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setStatus(opt.value); onStatusChange?.(opt.value); }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    status === opt.value
                      ? opt.color + ' ring-1 ring-current'
                      : 'text-gray-400 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Client */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Cliente
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Nombre del cliente *"
                  required
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>
              <div className="relative flex-1">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  placeholder="Teléfono"
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Service */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Servicio
            </label>
            <div className="relative">
              <Scissors size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={serviceId}
                onChange={e => setServiceId(e.target.value)}
                className="w-full pl-8 pr-8 py-2 border border-gray-200 rounded-xl text-sm
                  appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.durationMinutes}min · {s.price.toFixed(0)}€
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Professional */}
          {professionals.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Profesional
              </label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setProfId('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    !profId ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Cualquiera
                </button>
                {professionals.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProfId(p.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      profId === p.id ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    style={profId === p.id ? { backgroundColor: p.colorHex } : undefined}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: p.colorHex }}
                    />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date / time / duration */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Fecha y hora
            </label>
            <div className="flex gap-2">
              <div className="relative flex-[2]">
                <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={dateStr}
                  onChange={e => setDateStr(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="relative flex-1">
                <Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="time"
                  value={timeStr}
                  onChange={e => setTimeStr(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  min={5} step={5}
                  value={duration}
                  onChange={e => setDuration(parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-center
                    focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">min</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Notas
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Preferencias, observaciones…"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none
                focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Origin (create only) */}
          {!isEdit && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Canal de entrada
              </label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(ORIGIN_LABELS).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setOrigin(val)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      origin === val ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          {isEdit && onDelete && (
            <>
              {showDeleteConfirm ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-red-600">¿Eliminar cita?</span>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium"
                  >
                    Sí, eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </>
          )}

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="appointment-form"
              disabled={saving || !clientName.trim()}
              onClick={handleSubmit as unknown as React.MouseEventHandler}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium
                hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                flex items-center gap-2"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <CheckCircle size={15} />
              )}
              {isEdit ? 'Guardar cambios' : 'Crear cita'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
