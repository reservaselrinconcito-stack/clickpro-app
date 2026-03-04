import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { Database, Download, Upload, Clock, CheckCircle, AlertCircle, FolderOpen } from 'lucide-react';
import { notify } from '../../components/UI';

const fmtBytes = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`;
const fmtDate = (path: string) => {
  const m = path.match(/(\d{8}_\d{6})/);
  if (!m) return path;
  const [date, time] = [m[1].slice(0, 8), m[1].slice(9)];
  return `${date.slice(6)}-${date.slice(4,6)}-${date.slice(0,4)} ${time.slice(0,2)}:${time.slice(2,4)}`;
};

interface DbStats {
  contacts?: number;
  invoices?: number;
  quotes?: number;
  expenses?: number;
  items?: number;
  db_size_bytes?: number;
}

export const DesktopBackup: React.FC = () => {
  const [stats, setStats] = useState<DbStats>({});
  const [backups, setBackups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
    loadBackups();
  }, []);

  const loadStats = async () => {
    try {
      const s = await invoke<DbStats>('db_stats');
      setStats(s);
    } catch {}
  };

  const loadBackups = async () => {
    try {
      const list = await invoke<string[]>('list_backups');
      setBackups(list);
    } catch {}
  };

  const handleCreateBackup = async () => {
    setLoading(true);
    try {
      const path = await invoke<string>('create_backup');
      setLastBackup(path);
      await loadBackups();
      notify('Copia de seguridad creada ✓', 'success');
    } catch (err: any) {
      notify(err.message || 'Error al crear backup', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = async (path?: string) => {
    const backupPath = path ?? await openDialog({
      multiple: false,
      filters: [{ name: 'SQLite Backup', extensions: ['sqlite', 'db'] }],
      title: 'Seleccionar copia de seguridad',
    });

    if (!backupPath || typeof backupPath !== 'string') return;

    const confirm = window.confirm(
      '⚠️ Esto reemplazará TODOS los datos actuales con la copia seleccionada.\n\n¿Continuar?'
    );
    if (!confirm) return;

    setLoading(true);
    try {
      await invoke<boolean>('restore_backup', { backupPath });
      await loadStats();
      notify('Datos restaurados correctamente ✓', 'success');
    } catch (err: any) {
      notify(err.message || 'Error al restaurar', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* DB Stats */}
      <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-blue-600" />
            <span className="font-bold text-gray-700">Estado de la base de datos</span>
          </div>
          {stats.db_size_bytes !== undefined && (
            <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
              {fmtBytes(stats.db_size_bytes)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Contactos', value: stats.contacts },
            { label: 'Facturas', value: stats.invoices },
            { label: 'Presupuestos', value: stats.quotes },
            { label: 'Gastos', value: stats.expenses },
            { label: 'Artículos', value: stats.items },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl p-3 border border-gray-100 text-center">
              <p className="text-xl font-bold text-gray-800">{value ?? '—'}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleCreateBackup}
          disabled={loading}
          className="flex items-center gap-3 px-5 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold transition-colors disabled:opacity-50"
        >
          <Download size={18} />
          <div className="text-left">
            <div className="text-sm font-bold">Crear copia ahora</div>
            <div className="text-xs opacity-75">Guarda en carpeta backups/</div>
          </div>
        </button>

        <button
          onClick={() => handleRestoreBackup()}
          disabled={loading}
          className="flex items-center gap-3 px-5 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-semibold transition-colors disabled:opacity-50"
        >
          <Upload size={18} />
          <div className="text-left">
            <div className="text-sm font-bold">Restaurar backup</div>
            <div className="text-xs opacity-75">Elegir archivo .sqlite</div>
          </div>
        </button>
      </div>

      {lastBackup && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2.5 rounded-xl">
          <CheckCircle size={15} />
          <span>Último backup: <span className="font-mono">{lastBackup}</span></span>
        </div>
      )}

      {/* Backup list */}
      {backups.length > 0 && (
        <div>
          <h4 className="font-bold text-gray-700 text-sm mb-3">Copias disponibles</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {backups.map((b) => (
              <div key={b} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 group">
                <div className="flex items-center gap-2.5">
                  <Clock size={14} className="text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">{fmtDate(b)}</p>
                    <p className="text-xs text-gray-400 font-mono truncate max-w-xs">{b}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRestoreBackup(b)}
                  className="text-xs px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <AlertCircle size={12} />
        Las copias se guardan en <span className="font-mono">ContikProData/backups/</span>
        dentro de tu carpeta de datos.
      </p>
    </div>
  );
};
