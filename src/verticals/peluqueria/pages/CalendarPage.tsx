/**
 * CalendarPage.tsx — Vertical: Peluquería
 *
 * Full-featured visual appointment calendar.
 * - Week view with per-professional columns (or single column)
 * - Day view with time slots
 * - Click empty slot → create appointment
 * - Click appointment → edit
 * - Drag appointment → move (mouse/touch)
 * - Color-coded by status or professional
 * - Configurable slot intervals (15/30/60 min)
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo
} from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Calendar,
  Clock, User, Scissors, CheckCircle, XCircle,
  AlertCircle, Phone, MessageSquare, Inbox
} from 'lucide-react';
import type { Appointment, AppointmentStatus, Professional, HairService } from '../models';
import {
  getAppointmentsByRange,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  moveAppointment,
} from '../services/appointment-service';
import {
  getProfessionals, getHairServices, getCalendarConfig
} from '../services/professional-service';
import { AppointmentModal } from '../components/calendar/AppointmentModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 80; // px per hour in calendar grid
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 22;
const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; bg: string; border: string; text: string; dot: string }> = {
  pending:   { label: 'Pendiente',   bg: 'bg-amber-50',   border: 'border-amber-400',   text: 'text-amber-800',   dot: 'bg-amber-400' },
  confirmed: { label: 'Confirmada',  bg: 'bg-blue-50',    border: 'border-blue-500',    text: 'text-blue-800',    dot: 'bg-blue-500' },
  completed: { label: 'Completada',  bg: 'bg-green-50',   border: 'border-green-500',   text: 'text-green-800',   dot: 'bg-green-500' },
  cancelled: { label: 'Cancelada',   bg: 'bg-gray-100',   border: 'border-gray-400',    text: 'text-gray-500',    dot: 'bg-gray-400' },
  'no-show': { label: 'No presentó', bg: 'bg-red-50',     border: 'border-red-400',     text: 'text-red-700',     dot: 'bg-red-400' },
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── Appointment Block ────────────────────────────────────────────────────────

interface AppointmentBlockProps {
  appointment: Appointment;
  slotHeight: number;   // px per minute
  onClick: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}

function AppointmentBlock({ appointment, slotHeight, onClick, onDragStart }: AppointmentBlockProps) {
  const sc = STATUS_CONFIG[appointment.status];
  const startDate = new Date(appointment.startDatetime);
  const minutesFromStart = (startDate.getHours() - DAY_START_HOUR) * 60 + startDate.getMinutes();
  const top = minutesFromStart * slotHeight;
  const height = Math.max(appointment.durationMinutes * slotHeight, 28);

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded-lg border-l-4 overflow-hidden cursor-pointer
        select-none transition-shadow hover:shadow-md hover:z-20 z-10
        ${sc.bg} ${sc.border}`}
      style={{ top, height }}
      onClick={onClick}
      onMouseDown={onDragStart}
    >
      <div className={`px-2 py-1 h-full flex flex-col justify-start gap-0.5 ${sc.text}`}>
        <div className="font-semibold text-xs leading-tight truncate">
          {appointment.clientName}
        </div>
        {height > 44 && (
          <div className="text-xs opacity-75 truncate">{appointment.serviceName}</div>
        )}
        {height > 60 && (
          <div className="text-xs opacity-60">
            {formatTime(appointment.startDatetime)} · {appointment.durationMinutes}min
          </div>
        )}
        {height <= 32 && (
          <div className="text-xs opacity-60">{formatTime(appointment.startDatetime)}</div>
        )}
      </div>
    </div>
  );
}

// ─── Time Column ──────────────────────────────────────────────────────────────

function TimeColumn() {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i);
  return (
    <div className="w-12 shrink-0 text-right pr-2 relative select-none">
      {hours.map(h => (
        <div key={h} style={{ height: HOUR_HEIGHT }} className="flex items-start pt-0.5">
          <span className="text-xs text-gray-400">{String(h).padStart(2,'0')}h</span>
        </div>
      ))}
    </div>
  );
}

// ─── Day Column ───────────────────────────────────────────────────────────────

interface DayColumnProps {
  date: Date;
  appointments: Appointment[];
  slotInterval: number;
  onSlotClick: (startTs: number) => void;
  onAppointmentClick: (a: Appointment) => void;
  onDragStart: (a: Appointment, e: React.MouseEvent) => void;
  isToday: boolean;
}

function DayColumn({
  date, appointments, slotInterval, onSlotClick, onAppointmentClick, onDragStart, isToday
}: DayColumnProps) {
  const slotHeight = HOUR_HEIGHT / 60; // px per minute
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i);
  const slotsPerHour = 60 / slotInterval;

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutesFromStart = Math.floor(y / slotHeight / slotInterval) * slotInterval;
    const totalMinutes = DAY_START_HOUR * 60 + minutesFromStart;

    const start = new Date(date);
    start.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
    onSlotClick(start.getTime());
  };

  const now = new Date();
  const isCurrentDay = isSameDay(date, now);
  const currentMinutes = isCurrentDay
    ? (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes()
    : -1;

  return (
    <div
      className={`flex-1 relative border-r border-gray-100 cursor-crosshair min-w-[120px]
        ${isToday ? 'bg-indigo-50/30' : 'bg-white'}`}
      style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}
      onClick={handleColumnClick}
    >
      {/* Hour lines */}
      {hours.map(h => (
        <React.Fragment key={h}>
          <div
            className="absolute left-0 right-0 border-t border-gray-100"
            style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT }}
          />
          {/* Slot dividers */}
          {Array.from({ length: slotsPerHour - 1 }, (_, s) => (
            <div
              key={s}
              className="absolute left-0 right-0 border-t border-dashed border-gray-50"
              style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT + (s + 1) * (HOUR_HEIGHT / slotsPerHour) }}
            />
          ))}
        </React.Fragment>
      ))}

      {/* Current time indicator */}
      {currentMinutes >= 0 && (
        <div
          className="absolute left-0 right-0 z-30 flex items-center pointer-events-none"
          style={{ top: currentMinutes * slotHeight - 1 }}
        >
          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
          <div className="flex-1 h-px bg-red-500" />
        </div>
      )}

      {/* Appointments */}
      {appointments.map(appt => (
        <AppointmentBlock
          key={appt.id}
          appointment={appt}
          slotHeight={slotHeight}
          onClick={() => onAppointmentClick(appt)}
          onDragStart={(e) => { e.stopPropagation(); onDragStart(appt, e); }}
        />
      ))}
    </div>
  );
}

// ─── Main CalendarPage ────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<HairService[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<string | null>(null);
  const [slotInterval, setSlotInterval] = useState<15 | 30 | 60>(30);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [prefilledStart, setPrefilledStart] = useState<number | null>(null);

  // Drag state
  const draggingRef = useRef<{ appt: Appointment; startY: number; origTop: number } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // ── Load data ────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const [profs, svcs, calCfg] = await Promise.all([
      getProfessionals(),
      getHairServices(),
      getCalendarConfig(),
    ]);
    setProfessionals(profs);
    setServices(svcs);
    setSlotInterval(calCfg.slotIntervalMinutes);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const weekStart = useMemo(() => startOfWeek(currentDate), [currentDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const dayStart = useMemo(() => {
    const d = new Date(currentDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate]);

  const loadAppointments = useCallback(async () => {
    const from = viewMode === 'week' ? weekStart : dayStart;
    const to = viewMode === 'week'
      ? addDays(weekStart, 7)
      : addDays(dayStart, 1);
    const appts = await getAppointmentsByRange(
      from.getTime(), to.getTime(),
      selectedProfId ?? undefined
    );
    setAppointments(appts);
  }, [viewMode, weekStart, dayStart, selectedProfId]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);

  // ── Navigation ────────────────────────────────────────────────────────────────

  function navigate(dir: -1 | 1) {
    setCurrentDate(d => addDays(d, dir * (viewMode === 'week' ? 7 : 1)));
  }

  // ── Appointment actions ───────────────────────────────────────────────────────

  function openCreateModal(startTs: number) {
    setEditingAppt(null);
    setPrefilledStart(startTs);
    setModalOpen(true);
  }

  function openEditModal(appt: Appointment) {
    setEditingAppt(appt);
    setPrefilledStart(null);
    setModalOpen(true);
  }

  async function handleSave(data: Parameters<typeof createAppointment>[0]) {
    if (editingAppt) {
      await updateAppointment(editingAppt.id, data);
    } else {
      await createAppointment(data);
    }
    setModalOpen(false);
    await loadAppointments();
  }

  async function handleStatusChange(apptId: string, status: AppointmentStatus) {
    await updateAppointmentStatus(apptId, status);
    await loadAppointments();
  }

  // ── Drag to move ──────────────────────────────────────────────────────────────

  function handleDragStart(appt: Appointment, e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = { appt, startY: e.clientY, origTop: 0 };

    function onMouseMove(ev: MouseEvent) {
      if (!draggingRef.current) return;
      // visual feedback could go here
    }

    async function onMouseUp(ev: MouseEvent) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (!draggingRef.current || !calendarRef.current) return;
      const { appt: a, startY } = draggingRef.current;
      draggingRef.current = null;

      const slotHeight = HOUR_HEIGHT / 60; // px/min
      const deltaY = ev.clientY - startY;
      const deltaMinutes = Math.round(deltaY / slotHeight / slotInterval) * slotInterval;
      if (Math.abs(deltaMinutes) < slotInterval) return;

      const newStart = a.startDatetime + deltaMinutes * 60_000;
      await moveAppointment(a.id, newStart);
      await loadAppointments();
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ── Title / header ────────────────────────────────────────────────────────────

  const headerTitle = viewMode === 'week'
    ? `${MONTHS_ES[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekDays[0] ? '' : ''}${formatDate(currentDate)} ${currentDate.getFullYear()}`;

  // ── Group appointments by day ──────────────────────────────────────────────

  const apptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments.forEach(a => {
      const d = new Date(a.startDatetime);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [appointments]);

  function getApptKey(d: Date) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  // ── Status summary for today ───────────────────────────────────────────────

  const todayKey = getApptKey(new Date());
  const todayAppts = apptsByDay[todayKey] ?? [];
  const pendingCount = todayAppts.filter(a => a.status === 'pending').length;
  const confirmedCount = todayAppts.filter(a => a.status === 'confirmed').length;

  // ─── Render ────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-gray-400">Cargando calendario…</div>
    </div>
  );

  const displayDays = viewMode === 'week' ? weekDays : [currentDate];

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">

        {/* Navigation */}
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <button
          onClick={() => setCurrentDate(new Date())}
          className="text-sm font-semibold text-gray-800 min-w-[160px] text-center"
        >
          {headerTitle}
        </button>
        <button
          onClick={() => navigate(1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronRight size={20} className="text-gray-600" />
        </button>

        <button
          onClick={() => setCurrentDate(new Date())}
          className="ml-1 text-xs px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 font-medium hover:bg-indigo-200"
        >
          Hoy
        </button>

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['day', 'week'] as const).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                viewMode === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v === 'day' ? 'Día' : 'Semana'}
            </button>
          ))}
        </div>

        {/* Slot interval */}
        <select
          value={slotInterval}
          onChange={e => setSlotInterval(parseInt(e.target.value) as 15|30|60)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white"
        >
          <option value={15}>15 min</option>
          <option value={30}>30 min</option>
          <option value={60}>1 hora</option>
        </select>

        {/* Professional filter */}
        {professionals.length > 1 && (
          <select
            value={selectedProfId ?? ''}
            onChange={e => setSelectedProfId(e.target.value || null)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white"
          >
            <option value="">Todos</option>
            {professionals.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {/* New appointment */}
        <button
          onClick={() => {
            const d = new Date();
            d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
            openCreateModal(d.getTime());
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg
            text-sm font-medium hover:bg-indigo-700 transition-colors ml-1"
        >
          <Plus size={16} />
          Nueva cita
        </button>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      {viewMode === 'day' && (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-4 shrink-0">
          <span className="text-xs text-gray-500">Hoy: <strong>{todayAppts.length}</strong> citas</span>
          {pendingCount > 0 && (
            <span className="text-xs text-amber-600">• {pendingCount} pendientes</span>
          )}
          {confirmedCount > 0 && (
            <span className="text-xs text-blue-600">• {confirmedCount} confirmadas</span>
          )}
        </div>
      )}

      {/* ── Calendar grid ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto" ref={calendarRef}>
        <div className="flex flex-col min-h-full">

          {/* Day headers */}
          <div className="flex sticky top-0 bg-white border-b border-gray-200 z-20 shrink-0">
            <div className="w-12 shrink-0" />
            {displayDays.map(day => {
              const isToday = isSameDay(day, new Date());
              const dayAppts = apptsByDay[getApptKey(day)] ?? [];
              return (
                <div
                  key={day.toISOString()}
                  className={`flex-1 min-w-[120px] text-center py-2 border-r border-gray-100 last:border-r-0 ${
                    isToday ? 'bg-indigo-50' : ''
                  }`}
                >
                  <div className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-gray-400'}`}>
                    {DAYS_ES[day.getDay()]}
                  </div>
                  <div className={`text-lg font-bold leading-tight ${
                    isToday ? 'text-indigo-700' : 'text-gray-800'
                  }`}>
                    {day.getDate()}
                  </div>
                  {dayAppts.length > 0 && (
                    <div className="text-xs text-gray-400">{dayAppts.length} citas</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="flex flex-1">
            <TimeColumn />
            {displayDays.map(day => (
              <DayColumn
                key={day.toISOString()}
                date={day}
                appointments={apptsByDay[getApptKey(day)] ?? []}
                slotInterval={slotInterval}
                onSlotClick={openCreateModal}
                onAppointmentClick={openEditModal}
                onDragStart={handleDragStart}
                isToday={isSameDay(day, new Date())}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Status legend ────────────────────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-100 px-4 py-2 flex gap-4 shrink-0 overflow-x-auto">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-1.5 whitespace-nowrap">
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className="text-xs text-gray-500">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* ── Appointment Modal ────────────────────────────────────────────────── */}
      {modalOpen && (
        <AppointmentModal
          appointment={editingAppt}
          prefilledStart={prefilledStart}
          professionals={professionals}
          services={services}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          onStatusChange={editingAppt ? (s) => handleStatusChange(editingAppt.id, s) : undefined}
          onDelete={editingAppt ? async () => {
            const { deleteAppointment } = await import('../services/appointment-service');
            await deleteAppointment(editingAppt.id);
            setModalOpen(false);
            await loadAppointments();
          } : undefined}
        />
      )}
    </div>
  );
}
