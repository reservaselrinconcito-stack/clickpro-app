import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle, AlertCircle, LogOut, Download, Upload } from 'lucide-react';
import {
  connectGoogle, disconnect, syncToCloud, restoreFromCloud,
  onSyncStateChange, getSyncState, isConfigured, checkCloudBackupExists,
  type SyncState
} from '../services/cloudSync';
import { notify } from '../../components/UI';

const fmtTime = (ts: number | null) => {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const CloudSyncButton: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const [state, setState] = useState<SyncState>(getSyncState());
  const [showMenu, setShowMenu] = useState(false);
  const [restoreModal, setRestoreModal] = useState<{ exists: boolean; timestamp?: number } | null>(null);

  useEffect(() => {
    return onSyncStateChange(setState);
  }, []);

  const handleConnect = async () => {
    setShowMenu(false);
    if (!isConfigured()) {
      notify('Google Client ID no configurado. Añade VITE_GOOGLE_CLIENT_ID al .env', 'error');
      return;
    }
    const ok = await connectGoogle();
    if (ok) {
      notify('Google Drive conectado', 'success');
      // Check if backup exists
      const info = await checkCloudBackupExists();
      if (info.exists) {
        setRestoreModal(info);
      } else {
        await syncToCloud();
        notify('Copia inicial creada en Drive', 'success');
      }
    }
  };

  const handleSync = async () => {
    setShowMenu(false);
    try {
      await syncToCloud();
      notify('Sincronizado con Google Drive ✓', 'success');
    } catch (err: any) {
      notify(err.message || 'Error al sincronizar', 'error');
    }
  };

  const handleRestore = async (merge: boolean) => {
    setRestoreModal(null);
    try {
      const result = await restoreFromCloud(merge);
      if (result.restored) {
        notify('Datos restaurados desde Google Drive ✓', 'success');
      }
    } catch (err: any) {
      notify(err.message || 'Error al restaurar', 'error');
    }
  };

  const handleDisconnect = () => {
    setShowMenu(false);
    disconnect();
    notify('Google Drive desconectado', 'info');
  };

  if (!isConfigured()) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 ${collapsed ? 'justify-center' : ''}`}>
        <Cloud size={15} className="opacity-40" />
        {!collapsed && <span className="text-xs">Drive no configurado</span>}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Main button */}
      <button
        onClick={() => state.connected ? setShowMenu(!showMenu) : handleConnect()}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
          ${state.connected
            ? state.syncing
              ? 'bg-blue-50 text-blue-600'
              : state.syncError
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          } ${collapsed ? 'justify-center' : ''}`}
        title={state.connected ? `Sincronizado${state.lastSync ? ': ' + fmtTime(state.lastSync) : ''}` : 'Conectar Google Drive'}
      >
        {state.syncing ? (
          <RefreshCw size={16} className="animate-spin text-blue-500" />
        ) : state.connected ? (
          state.syncError ? <AlertCircle size={16} /> : <CheckCircle size={16} />
        ) : (
          <Cloud size={16} />
        )}
        {!collapsed && (
          <div className="flex flex-col items-start leading-tight">
            <span className="font-semibold text-xs">
              {state.connected ? 'Drive conectado' : 'Conectar Drive'}
            </span>
            {state.connected && state.lastSync && (
              <span className="text-xs opacity-60">{fmtTime(state.lastSync)}</span>
            )}
            {state.connected && state.email && !state.lastSync && (
              <span className="text-xs opacity-60 truncate max-w-[130px]">{state.email}</span>
            )}
          </div>
        )}
      </button>

      {/* Dropdown menu */}
      {showMenu && state.connected && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="absolute bottom-full left-0 mb-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 z-40 py-1 overflow-hidden">
            {state.email && (
              <div className="px-4 py-2 border-b border-gray-50">
                <p className="text-xs text-gray-400 truncate">{state.email}</p>
              </div>
            )}
            <button onClick={handleSync}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors">
              <Upload size={15} /> Guardar ahora
            </button>
            <button onClick={async () => { setShowMenu(false); const info = await checkCloudBackupExists(); if (info.exists) setRestoreModal(info); else notify('No hay copia en Drive', 'info'); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors">
              <Download size={15} /> Restaurar desde Drive
            </button>
            <div className="border-t border-gray-50 mt-1 pt-1">
              <button onClick={handleDisconnect}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                <LogOut size={15} /> Desconectar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Restore modal */}
      {restoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-sm" onClick={() => setRestoreModal(null)} />
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 p-6 border border-gray-100">
            <div className="flex items-start gap-4 mb-5">
              <div className="p-3 bg-blue-50 rounded-xl flex-shrink-0">
                <Cloud size={24} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Copia encontrada en Drive</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Hay una copia guardada del {restoreModal.timestamp ? new Date(restoreModal.timestamp).toLocaleString('es-ES') : 'fecha desconocida'}.
                  ¿Qué quieres hacer?
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => handleRestore(false)}
                className="w-full text-left px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors">
                <div className="font-semibold text-blue-800 text-sm">Restaurar y reemplazar</div>
                <div className="text-xs text-blue-600 mt-0.5">Borra los datos actuales y carga la copia de Drive</div>
              </button>
              <button onClick={() => handleRestore(true)}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <div className="font-semibold text-gray-800 text-sm">Fusionar</div>
                <div className="text-xs text-gray-500 mt-0.5">Combina los datos de Drive con los actuales (sin borrar)</div>
              </button>
              <button onClick={() => { setRestoreModal(null); syncToCloud(); }}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <div className="font-semibold text-gray-800 text-sm">Ignorar y subir los míos</div>
                <div className="text-xs text-gray-500 mt-0.5">Mantiene los datos actuales y sobrescribe Drive</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudSyncButton;
