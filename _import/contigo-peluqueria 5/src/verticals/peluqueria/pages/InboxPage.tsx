/**
 * InboxPage.tsx — Vertical: Peluquería  v2.4.2
 *
 * Cambios v2.4.2:
 * - Botón "Sincronizar" con estado visual (idle / syncing / done / error)
 * - Barra de estado: X no leídos · última sync · indicador de nueva entrada
 * - ConvertToAppointmentPanel pre-rellena fecha/hora desde message.preferredDatetime
 * - Notas del mensaje copiadas al campo de notas de la cita
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Inbox, MessageSquare, Phone, Mail, Calendar, CheckCircle,
  Archive, Plus, X, Clock, Scissors, RefreshCw, Settings,
  AlertCircle, WifiOff, User,
} from 'lucide-react';
import type { InboxMessage, InboxMessageStatus, HairService, Professional } from '../models';
import {
  getInboxMessages, markAsRead, updateInboxStatus,
  convertToAppointment, createInboxMessage, deleteInboxMessage,
} from '../services/inbox-service';
import { getHairServices, getProfessionals } from '../services/professional-service';
import { createAppointment } from '../services/appointment-service';
import {
  syncInbox, getSyncConfig, formatLastSync,
  type SyncConfig, type SyncResult,
} from '../services/sync-service';

// ─── Config visual por tipo ────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  'reservation-request': { label: 'Solicitud de cita', icon: <Calendar size={14} />,       color: 'text-indigo-600 bg-indigo-50' },
  'contact-form':        { label: 'Formulario',         icon: <Mail size={14} />,           color: 'text-blue-600 bg-blue-50' },
  'whatsapp':            { label: 'WhatsApp',            icon: <MessageSquare size={14} />, color: 'text-green-600 bg-green-50' },
  'cancellation':        { label: 'Cancelación',         icon: <X size={14} />,             color: 'text-red-600 bg-red-50' },
  'other':               { label: 'Otro',                icon: <Inbox size={14} />,         color: 'text-gray-600 bg-gray-100' },
};

const SOURCE_LABELS: Record<string, string> = {
  web: 'Web', whatsapp: 'WhatsApp', manual: 'Manual', other: 'Otro', worker: 'Web',
};

const STATUS_FILTERS: { value: InboxMessageStatus | 'all'; label: string }[] = [
  { value: 'all',      label: 'Todos' },
  { value: 'unread',   label: 'No leídos' },
  { value: 'pending',  label: 'Pendientes' },
  { value: 'archived', label: 'Archivados' },
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'Ahora';
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}

// ─── AddWhatsAppModal ──────────────────────────────────────────────────────────

function AddWhatsAppModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createInboxMessage({ type: 'whatsapp', senderName: name, senderPhone: phone, body, source: 'whatsapp' });
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquare size={16} className="text-green-600" />
            Registrar mensaje WhatsApp
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Nombre del cliente *" required
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="Teléfono"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <textarea value={body} onChange={e => setBody(e.target.value)}
            placeholder="Mensaje recibido / detalles de la solicitud *" required rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !name.trim() || !body.trim()}
              className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
              <MessageSquare size={14} />
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SyncStatusBar ─────────────────────────────────────────────────────────────

type SyncState = 'idle' | 'syncing' | 'done' | 'error' | 'not-configured';

interface SyncBarProps {
  syncState: SyncState;
  lastResult: SyncResult | null;
  lastSyncAt: number;
  hasConfig: boolean;
  onSync: () => void;
  onConfigure: () => void;
}

function SyncStatusBar({ syncState, lastResult, lastSyncAt, hasConfig, onSync, onConfigure }: SyncBarProps) {
  const isSyncing = syncState === 'syncing';

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs">
      {/* Estado / último resultado */}
      <div className="flex-1 min-w-0">
        {syncState === 'syncing' && (
          <span className="text-indigo-600 flex items-center gap-1.5">
            <RefreshCw size={11} className="animate-spin" />
            Sincronizando…
          </span>
        )}
        {syncState === 'done' && lastResult && (
          <span className={lastResult.newItems > 0 ? 'text-green-700' : 'text-gray-500'}>
            {lastResult.newItems > 0
              ? `✓ ${lastResult.newItems} nueva${lastResult.newItems > 1 ? 's' : ''} — ${formatLastSync(lastResult.syncedAt)}`
              : `Sin novedades — ${formatLastSync(lastResult.syncedAt)}`
            }
          </span>
        )}
        {syncState === 'error' && lastResult?.error && (
          <span className="text-red-600 flex items-center gap-1 truncate">
            <AlertCircle size={11} />
            <span className="truncate">{lastResult.error}</span>
          </span>
        )}
        {syncState === 'idle' && lastSyncAt > 0 && (
          <span className="text-gray-400">Última sync: {formatLastSync(lastSyncAt)}</span>
        )}
        {syncState === 'idle' && !lastSyncAt && (
          <span className="text-gray-400">Sin sincronizar</span>
        )}
        {syncState === 'not-configured' && (
          <span className="text-amber-600 flex items-center gap-1">
            <WifiOff size={11} />
            Worker no configurado
          </span>
        )}
      </div>

      {/* Botones */}
      <div className="flex items-center gap-1.5 shrink-0">
        {!hasConfig ? (
          <button
            onClick={onConfigure}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium"
          >
            <Settings size={11} />
            Configurar
          </button>
        ) : (
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── SyncConfigModal ───────────────────────────────────────────────────────────

import { saveSyncConfig } from '../services/sync-service';

function SyncConfigModal({ config, onClose, onSaved }: {
  config: SyncConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [workerUrl, setWorkerUrl] = useState(config.workerUrl);
  const [syncToken, setSyncToken] = useState(config.syncToken);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);

  async function handleSave() {
    setSaving(true);
    try {
      await saveSyncConfig({
        workerUrl: workerUrl.trim().replace(/\/$/, ''),
        syncToken: syncToken.trim(),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTestResult(null);
    const url = workerUrl.trim().replace(/\/$/, '');
    if (!url) { setTestResult({ ok: false, msg: 'Introduce la URL del Worker.' }); return; }

    try {
      const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8_000) });
      if (resp.ok) {
        const data = await resp.json() as { version?: string };
        setTestResult({ ok: true, msg: `✓ Conectado (v${data.version ?? '?'})` });
      } else {
        setTestResult({ ok: false, msg: `Error ${resp.status}: ${resp.statusText}` });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: `No se pudo conectar: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Settings size={16} className="text-indigo-600" />
            Configuración de sincronización
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              URL del Worker de Cloudflare
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={workerUrl}
                onChange={e => setWorkerUrl(e.target.value)}
                placeholder="https://contigo-api.TU-CUENTA.workers.dev"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={handleTest}
                className="px-3 py-2 text-xs bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 shrink-0"
              >
                Test
              </button>
            </div>
            {testResult && (
              <p className={`text-xs mt-1.5 ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                {testResult.msg}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Token de sincronización (API_SECRET del Worker)
            </label>
            <input
              type="password"
              value={syncToken}
              onChange={e => setSyncToken(e.target.value)}
              placeholder="••••••••••••••••••••••••••••••••"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              El valor que configuraste con <code>wrangler secret put API_SECRET</code>.
            </p>
          </div>

          <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-700 space-y-1">
            <p className="font-medium">¿Dónde encontrar estos valores?</p>
            <p>URL del Worker: en tu Dashboard de Cloudflare → Workers & Pages → tu worker.</p>
            <p>Token: el que generaste con <code>openssl rand -hex 32</code> al configurar el Worker.</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !workerUrl.trim() || !syncToken.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ConvertToAppointmentPanel ─────────────────────────────────────────────────

function ConvertToAppointmentPanel({ message, services, professionals, onConverted, onCancel }: {
  message: InboxMessage;
  services: HairService[];
  professionals: Professional[];
  onConverted: () => void;
  onCancel: () => void;
}) {
  // Pre-rellenar fecha/hora desde preferredDatetime si existe
  function getDefaultDateTime(): { date: string; time: string } {
    if (message.preferredDatetime) {
      const d = new Date(message.preferredDatetime);
      // Validar que la fecha sea futura
      if (d > new Date()) {
        return {
          date: d.toISOString().slice(0, 10),
          time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
        };
      }
    }
    // Fallback: próximo hueco de 30 min
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
    return {
      date: now.toISOString().slice(0, 10),
      time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
    };
  }

  const { date: defaultDate, time: defaultTime } = getDefaultDateTime();

  const [clientName,  setClientName]  = useState(message.senderName);
  const [clientPhone, setClientPhone] = useState(message.senderPhone ?? '');
  const [serviceId,   setServiceId]   = useState(
    // Si el mensaje menciona un servicio, buscar por nombre en el catálogo
    services.find(s => s.name === message.preferredServiceName)?.id
    ?? message.preferredServiceId
    ?? services[0]?.id
    ?? ''
  );
  const [profId,   setProfId]   = useState(message.preferredProfessionalId ?? professionals[0]?.id ?? '');
  const [dateStr,  setDateStr]  = useState(defaultDate);
  const [timeStr,  setTimeStr]  = useState(defaultTime);
  const [notes,    setNotes]    = useState(message.body ?? '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const selectedService = services.find(s => s.id === serviceId);

  async function handleConvert() {
    if (!clientName.trim()) { setError('El nombre del cliente es obligatorio.'); return; }
    setSaving(true);
    setError(null);
    try {
      const startDatetime = new Date(`${dateStr}T${timeStr}:00`).getTime();
      if (isNaN(startDatetime)) { setError('Fecha u hora no válidas.'); setSaving(false); return; }

      const prof = professionals.find(p => p.id === profId);

      const { appointment } = await createAppointment({
        clientName:       clientName.trim(),
        clientPhone:      clientPhone || undefined,
        serviceId,
        serviceName:      selectedService?.name ?? '',
        professionalId:   profId  || undefined,
        professionalName: prof?.name,
        startDatetime,
        durationMinutes:  selectedService?.durationMinutes ?? 30,
        bufferMinutes:    selectedService?.bufferMinutes   ?? 0,
        status:           'confirmed',
        origin:           'inbox',
        notes:            notes || undefined,
        inboxMessageId:   message.id,
      });

      await convertToAppointment(message.id, appointment.id);
      onConverted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la cita.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-4 space-y-3 mt-4">
      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Calendar size={14} className="text-indigo-600" />
        Crear cita desde este mensaje
      </h4>

      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
          placeholder="Nombre *"
          className="col-span-2 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />

        <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
          placeholder="Teléfono"
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />

        <select value={serviceId} onChange={e => setServiceId(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
          {services.length === 0
            ? <option value="">Sin servicios</option>
            : services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
          }
        </select>

        <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />

        <input type="time" value={timeStr} onChange={e => setTimeStr(e.target.value)}
          step="1800"
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />

        {professionals.length > 0 && (
          <select value={profId} onChange={e => setProfId(e.target.value)}
            className="col-span-2 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">Sin profesional asignado</option>
            {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Notas (pre-rellenado desde el mensaje)"
          rows={2}
          className="col-span-2 px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>

      {selectedService && (
        <p className="text-xs text-gray-400">
          Duración estimada: {selectedService.durationMinutes} min · {selectedService.price.toFixed(0)} €
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
        <button onClick={handleConvert} disabled={saving || !clientName.trim()}
          className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
          <CheckCircle size={14} />
          {saving ? 'Creando…' : 'Crear cita'}
        </button>
      </div>
    </div>
  );
}

// ─── Main InboxPage ────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [messages,       setMessages]       = useState<InboxMessage[]>([]);
  const [selected,       setSelected]       = useState<InboxMessage | null>(null);
  const [filterStatus,   setFilterStatus]   = useState<InboxMessageStatus | 'all'>('all');
  const [services,       setServices]       = useState<HairService[]>([]);
  const [professionals,  setProfessionals]  = useState<Professional[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [showAddWhatsApp, setShowAddWhatsApp] = useState(false);
  const [showConvertPanel, setShowConvertPanel] = useState(false);
  const [showSyncConfig,  setShowSyncConfig]  = useState(false);

  // Sync state
  const [syncState,  setSyncState]  = useState<SyncState>('idle');
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const syncingRef = useRef(false);

  const load = useCallback(async () => {
    const [msgs, svcs, profs] = await Promise.all([
      getInboxMessages({ status: filterStatus }),
      getHairServices(),
      getProfessionals(),
    ]);
    setMessages(msgs);
    setServices(svcs);
    setProfessionals(profs);
    setLoading(false);
  }, [filterStatus]);

  // Cargar sync config al montar
  const loadSyncConfig = useCallback(async () => {
    const cfg = await getSyncConfig();
    setSyncConfig(cfg);
    if (!cfg.workerUrl || !cfg.syncToken) {
      setSyncState('not-configured');
    } else {
      setSyncState(cfg.lastSyncAt > 0 ? 'idle' : 'idle');
    }
  }, []);

  useEffect(() => {
    load();
    loadSyncConfig();
  }, [load, loadSyncConfig]);

  async function handleSync() {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncState('syncing');

    try {
      const result = await syncInbox();
      setLastResult(result);
      setSyncState(result.success ? 'done' : 'error');
      if (result.newItems > 0) {
        await load(); // recargar mensajes si hay nuevos
      }
    } catch (err) {
      setLastResult({
        success: false, newItems: 0, skippedItems: 0,
        nextCursor: 0, hasMore: false,
        error: err instanceof Error ? err.message : 'Error desconocido',
        syncedAt: Date.now(),
      });
      setSyncState('error');
    } finally {
      syncingRef.current = false;
    }
  }

  async function handleSyncConfigSaved() {
    await loadSyncConfig();
  }

  async function handleSelect(msg: InboxMessage) {
    setSelected(msg);
    setShowConvertPanel(false);
    if (msg.status === 'unread') {
      await markAsRead(msg.id);
      await load();
    }
  }

  async function handleArchive(msgId: string) {
    await updateInboxStatus(msgId, 'archived');
    setSelected(null);
    await load();
  }

  async function handleDelete(msgId: string) {
    await deleteInboxMessage(msgId);
    setSelected(null);
    await load();
  }

  const unreadCount = messages.filter(m => m.status === 'unread').length;
  const hasConfig = Boolean(syncConfig?.workerUrl && syncConfig?.syncToken);

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden">

      {/* ── Sidebar: message list ──────────────────────────────────────────── */}
      <div className="w-80 shrink-0 bg-white border-r border-gray-200 flex flex-col">

        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">Buzón</h2>
              {unreadCount > 0 && (
                <span className="text-xs font-bold bg-indigo-600 text-white rounded-full px-2 py-0.5">
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowAddWhatsApp(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium"
            >
              <Plus size={13} />
              WhatsApp
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setFilterStatus(f.value)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterStatus === f.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sync status bar */}
        <SyncStatusBar
          syncState={syncState}
          lastResult={lastResult}
          lastSyncAt={syncConfig?.lastSyncAt ?? 0}
          hasConfig={hasConfig}
          onSync={handleSync}
          onConfigure={() => setShowSyncConfig(true)}
        />

        {/* Message list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {loading ? (
            <div className="p-4 text-center text-gray-400 text-sm">Cargando…</div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center">
              <Inbox size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No hay mensajes</p>
              {hasConfig && (
                <button onClick={handleSync}
                  className="mt-3 text-xs text-indigo-500 hover:underline flex items-center gap-1 mx-auto">
                  <RefreshCw size={11} />
                  Sincronizar ahora
                </button>
              )}
            </div>
          ) : messages.map(msg => {
            const tc = TYPE_CONFIG[msg.type] ?? TYPE_CONFIG['other'];
            const isSelected = selected?.id === msg.id;
            return (
              <button key={msg.id} onClick={() => handleSelect(msg)}
                className={`w-full text-left px-4 py-3 transition-colors flex gap-3 items-start ${
                  isSelected ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'hover:bg-gray-50'
                }`}>
                <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${tc.color}`}>
                  {tc.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <span className={`text-sm font-medium truncate ${
                      msg.status === 'unread' ? 'text-gray-900' : 'text-gray-600'
                    }`}>
                      {msg.senderName}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">{timeAgo(msg.createdAt)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{msg.body}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {msg.status === 'unread' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${tc.color}`}>
                      {SOURCE_LABELS[msg.source as string] ?? msg.source}
                    </span>
                    {msg.status === 'converted' && (
                      <span className="text-xs text-green-600 font-medium">✓ Cita</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Detail panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Inbox size={48} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">Selecciona un mensaje</p>
              {hasConfig && syncState !== 'syncing' && (
                <button onClick={handleSync}
                  className="text-sm text-indigo-500 hover:underline flex items-center gap-1.5 mx-auto mt-1">
                  <RefreshCw size={13} />
                  Sincronizar con la web
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">

              {/* Message header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {TYPE_CONFIG[selected.type]?.icon}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_CONFIG[selected.type]?.color}`}>
                      {TYPE_CONFIG[selected.type]?.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      vía {SOURCE_LABELS[selected.source as string] ?? selected.source}
                    </span>
                    {(selected as any).syncedFrom === 'worker' && (
                      <span className="text-xs text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                        Desde web
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{selected.senderName}</h3>
                  <div className="flex gap-3 mt-1 flex-wrap">
                    {selected.senderPhone && (
                      <a href={`tel:${selected.senderPhone}`}
                        className="text-sm text-indigo-600 flex items-center gap-1 hover:underline">
                        <Phone size={13} /> {selected.senderPhone}
                      </a>
                    )}
                    {selected.senderEmail && (
                      <a href={`mailto:${selected.senderEmail}`}
                        className="text-sm text-indigo-600 flex items-center gap-1 hover:underline">
                        <Mail size={13} /> {selected.senderEmail}
                      </a>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(selected.createdAt).toLocaleString('es-ES')}
                </span>
              </div>

              {selected.subject && (
                <p className="text-sm font-medium text-gray-700 mb-2">{selected.subject}</p>
              )}
              <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-4">
                {selected.body}
              </p>

              {/* Preferred slot info */}
              {(selected.preferredDatetime || selected.preferredServiceName) && (
                <div className="mt-4 p-3 bg-indigo-50 rounded-xl">
                  <p className="text-xs font-medium text-indigo-700 mb-1.5">Solicita:</p>
                  <div className="flex gap-3 flex-wrap text-xs text-indigo-600">
                    {selected.preferredDatetime && (
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(selected.preferredDatetime).toLocaleString('es-ES', {
                          dateStyle: 'short', timeStyle: 'short'
                        })}
                      </span>
                    )}
                    {selected.preferredServiceName && (
                      <span className="flex items-center gap-1">
                        <Scissors size={12} />
                        {selected.preferredServiceName}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Converted badge */}
              {selected.status === 'converted' && (
                <div className="mt-4 p-3 bg-green-50 rounded-xl flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-sm text-green-700 font-medium">Convertido a cita</span>
                  {selected.appointmentId && (
                    <span className="text-xs text-green-500 ml-auto">ID: {selected.appointmentId.slice(0, 8)}…</span>
                  )}
                </div>
              )}

              {/* Convert panel */}
              {showConvertPanel && selected.status !== 'converted' && (
                <ConvertToAppointmentPanel
                  message={selected}
                  services={services}
                  professionals={professionals}
                  onConverted={async () => {
                    await load();
                    // Recargar el mensaje seleccionado con el estado actualizado
                    const updated = await getInboxMessages({ status: 'all' });
                    const refreshed = updated.find(m => m.id === selected.id) ?? null;
                    setSelected(refreshed);
                    setShowConvertPanel(false);
                  }}
                  onCancel={() => setShowConvertPanel(false)}
                />
              )}

              {/* Action buttons */}
              {!showConvertPanel && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  {selected.status !== 'converted' && (
                    <button onClick={() => setShowConvertPanel(true)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
                      <Calendar size={14} />
                      Crear cita
                    </button>
                  )}
                  <button onClick={() => handleArchive(selected.id)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200">
                    <Archive size={14} />
                    Archivar
                  </button>
                  {selected.senderPhone && (
                    <a href={`https://wa.me/${selected.senderPhone.replace(/\D/g, '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-xl text-sm hover:bg-green-100">
                      <MessageSquare size={14} />
                      Responder WA
                    </a>
                  )}
                  <button onClick={() => handleDelete(selected.id)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-xl text-sm hover:bg-red-100 ml-auto">
                    <X size={14} />
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modales ───────────────────────────────────────────────────────── */}
      {showAddWhatsApp && (
        <AddWhatsAppModal
          onClose={() => setShowAddWhatsApp(false)}
          onSave={() => load()}
        />
      )}

      {showSyncConfig && syncConfig && (
        <SyncConfigModal
          config={syncConfig}
          onClose={() => setShowSyncConfig(false)}
          onSaved={handleSyncConfigSaved}
        />
      )}
    </div>
  );
}
