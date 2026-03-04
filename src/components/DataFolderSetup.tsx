/**
 * DataFolderSetup — First-launch and re-launch initialization screen.
 *
 * INIT SEQUENCE (enforced):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. checkSavedPath()                                         │
 * │    Read appConfigDir/data_path.txt                          │
 * │    ├─ found  → initWithPath(savedPath)  [auto, no UI]       │
 * │    └─ empty  → setPhase('selecting')    [show picker UI]    │
 * │                                                             │
 * │ 2. initWithPath(basePath)                                   │
 * │    a. invoke('init_data_folder')                            │
 * │       • Rust opens/creates ContikProData/contikpro.sqlite   │
 * │       • Returns DataPathInfo { path, db_path, initialized } │
 * │    b. getSQLiteAdapter().verify()                           │
 * │       • Runs db_count('settings') — confirms DB responds    │
 * │       • Throws if Rust side is not responding               │
 * │    c. adapter.markReady()  — SQLiteAdapter unlocks ops      │
 * │    d. setDbReady(true)     — global signal, React gate open │
 * │    e. savePathToConfig()   — persist for next launch        │
 * │    f. onReady()            — App.tsx notified               │
 * └─────────────────────────────────────────────────────────────┘
 *
 * NOTE: Rust `setup()` also reads data_path.txt and auto-opens the DB
 * before the JS layer starts. Calling invoke('init_data_folder') again
 * is safe — Rust handles re-initialization gracefully.
 */

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { appConfigDir, appDataDir, documentDir, join } from '@tauri-apps/api/path';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import {
  FolderOpen, Database, CheckCircle, AlertCircle,
  HardDrive, Loader2,
} from 'lucide-react';
import { getSQLiteAdapter } from '@/core/db-adapter';
import { setDbReady } from '@/core/db-state';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataFolderSetupProps {
  onReady: () => void;
}

interface DataPathInfo {
  path: string;
  db_path: string;
  initialized: boolean;
  recovered: boolean;          // Phase 2: true if auto-recovery ran
  recovery_source: string | null;    // Phase 2: backup used for recovery
}

type Phase = 'checking' | 'selecting' | 'opening' | 'verifying' | 'ready' | 'error';

const CONFIG_FILENAME = 'data_path.txt';

// ─── Component ────────────────────────────────────────────────────────────────

export const DataFolderSetup: React.FC<DataFolderSetupProps> = ({ onReady }) => {
  const [phase, setPhase] = useState<Phase>('checking');
  const [dbPath, setDbPath] = useState<string>('');
  const [recovered, setRecovered] = useState<boolean>(false);
  const [recoverySource, setRecoverySource] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>('');
  const [errorDetail, setErrorDetail] = useState<string>('');

  useEffect(() => {
    checkSavedPath();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Config file helpers ────────────────────────────────────────────────

  const getConfigPath = async (): Promise<string> => {
    const configDir = await appConfigDir();
    return await join(configDir, CONFIG_FILENAME);
  };

  const savePathToConfig = async (basePath: string): Promise<void> => {
    try {
      const cfgPath = await getConfigPath();
      await writeTextFile(cfgPath, basePath);
    } catch (e) {
      // Non-fatal — path was used once, next launch shows picker again
      console.warn('[DataFolderSetup] Could not persist path:', e);
    }
  };

  // ─── Main init flow ─────────────────────────────────────────────────────

  const checkSavedPath = async (): Promise<void> => {
    try {
      const cfgPath = await getConfigPath();
      const savedPath = await readTextFile(cfgPath).catch(() => '');
      if (savedPath.trim()) {
        await initWithPath(savedPath.trim());
      } else {
        setPhase('selecting');
      }
    } catch {
      setPhase('selecting');
    }
  };

  // ─── Scope guard ──────────────────────────────────────────────────────────
  // Tauri fs plugin scope: $HOME/**, $APPCONFIG/**, /Volumes/**
  // Rust commands (invoke) are NOT restricted by this scope — they run natively.
  // This guard is informational: catches obviously-out-of-scope paths early
  // so the user gets a clear message instead of a cryptic "permission denied".
  const isPathInScope = (p: string): boolean => {
    // Normalize — remove trailing slash
    const norm = p.replace(/\/+$/, '');
    // $HOME → macOS/Linux home dir heuristic (starts with /Users/ or /home/)
    const homeOk = /^\/(Users|home)\/[^/]/.test(norm);
    // /Volumes/* — external drives
    const volumesOk = /^\/Volumes\//.test(norm);
    // Windows (future): allow all drive letters
    const windowsOk = /^[A-Za-z]:[/\\]/.test(norm);
    return homeOk || volumesOk || windowsOk;
  };

  const initWithPath = async (basePath: string): Promise<void> => {
    // Pre-flight scope check — fast fail with clear message
    if (!isPathInScope(basePath)) {
      setPhase('error');
      setErrorTitle('Carpeta no permitida');
      setErrorDetail(
        `La carpeta seleccionada está fuera de las rutas permitidas:\n\n` +
        `  ✅  Tu carpeta de usuario (Documentos, Escritorio, Dropbox…)\n` +
        `  ✅  Discos externos (/Volumes/…)\n\n` +
        `Ruta seleccionada: ${basePath}\n\n` +
        `Selecciona una carpeta dentro de tu carpeta de usuario o en un disco externo.`
      );
      return;
    }

    setPhase('opening');
    clearError();

    try {
      // ── Step 1: Rust opens / creates the SQLite file ──────────────────
      const info = await invoke<DataPathInfo>('init_data_folder', {
        path: basePath,
      });
      setDbPath(info.db_path);
      setRecovered(info.recovered ?? false);
      setRecoverySource(info.recovery_source ?? null);

      // ── Step 2: Verify the connection ─────────────────────────────────
      setPhase('verifying');
      const adapter = getSQLiteAdapter();
      if (!adapter) {
        throw new Error(
          'SQLiteAdapter not found. ' +
          'initAdapter() must be called before DataFolderSetup mounts.'
        );
      }

      await adapter.verify();

      // ── Step 3: Unlock adapter and global state ───────────────────────
      adapter.markReady();
      setDbReady(true);        // Fires useDbReady() listeners → App re-renders

      // ── Step 4: Persist path ──────────────────────────────────────────
      await savePathToConfig(basePath);

      // ── Step 5: Brief success flash, then hand off ────────────────────
      setPhase('ready');
      setTimeout(() => onReady(), 500);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[DataFolderSetup] init failed:', msg);
      setPhase('error');
      // Distinguish permission errors from other failures for better UX copy
      const isPermission = /permission|access denied|not allowed|scope/i.test(msg);
      const isNotFound   = /not found|no such file|enoent/i.test(msg);
      setErrorTitle(
        isPermission ? 'Sin permisos para acceder a la carpeta' :
        isNotFound   ? 'No se encontró la base de datos' :
                       'No se pudo abrir la base de datos'
      );
      setErrorDetail(
        isPermission
          ? `La carpeta seleccionada no es accesible. Elige una carpeta dentro de tu carpeta de usuario (Documentos, Escritorio, Dropbox…).\n\nDetalle técnico: ${msg}`
          : msg
      );
    }
  };

  // ─── User actions ───────────────────────────────────────────────────────

  const handleSelectFolder = async (): Promise<void> => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Selecciona la carpeta de datos de ContikPro',
      });
      if (selected && typeof selected === 'string') {
        await initWithPath(selected);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPhase('error');
      setErrorTitle('Error al seleccionar carpeta');
      setErrorDetail(
        /cancel/i.test(msg) ? 'No se seleccionó ninguna carpeta.' :
        `No se pudo acceder a la carpeta seleccionada.\n\nElige una carpeta dentro de tu carpeta de usuario.\n\nDetalle: ${msg}`
      );
    }
  };

  const handleDefaultLocation = async (): Promise<void> => {
    try {
      const docs = await documentDir();
      await initWithPath(docs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPhase('error');
      setErrorTitle('Error al usar carpeta Documentos');
      setErrorDetail(`No se pudo acceder a la carpeta Documentos del sistema.\n\nUsa "Elegir carpeta" para seleccionar una ubicación manualmente.\n\nDetalle: ${msg}`);
    }
  };

  const handleRetry = (): void => {
    clearError();
    setPhase('selecting');
  };

  const clearError = (): void => {
    setErrorTitle('');
    setErrorDetail('');
  };

  // ─── Phase labels ───────────────────────────────────────────────────────

  const phaseLabel: Partial<Record<Phase, string>> = {
    checking: 'Buscando base de datos…',
    opening: 'Abriendo base de datos…',
    verifying: 'Verificando conexión…',
    ready: '¡Base de datos lista!',
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  // Progress phases (no user interaction)
  if (phase === 'checking' || phase === 'opening' || phase === 'verifying') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Logo />
          <div className="flex items-center gap-2.5 text-gray-600 justify-center">
            <Loader2 size={18} className="animate-spin text-blue-500" />
            <span className="font-medium text-sm">{phaseLabel[phase]}</span>
          </div>
          {phase === 'verifying' && dbPath && (
            <p className="text-xs text-gray-400 font-mono max-w-sm truncate">{dbPath}</p>
          )}
        </div>
      </div>
    );
  }

  // Success flash
  if (phase === 'ready') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm px-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <p className="font-bold text-gray-800">Base de datos lista</p>
          <p className="text-xs text-gray-400 font-mono truncate">{dbPath}</p>
          {recovered && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-left">
              <p className="font-bold mb-1">⚠️ Recuperación automática</p>
              <p>Se detectó corrupción en la base de datos y se restauró automáticamente desde el backup más reciente.</p>
              {recoverySource && (
                <p className="font-mono text-amber-600 mt-1 text-xs break-all">{recoverySource}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error screen
  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-red-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <h2 className="font-bold text-gray-800 text-xl mb-2">{errorTitle}</h2>
          {errorDetail && (
            <pre className="text-red-600 text-xs bg-red-50 rounded-lg px-4 py-3 mb-4 font-mono text-left break-all whitespace-pre-wrap max-h-40 overflow-y-auto">
              {errorDetail}
            </pre>
          )}
          <p className="text-xs text-gray-500 mb-6">
            Carpetas válidas: <span className="font-semibold">Documentos, Escritorio, Dropbox, iCloud Drive</span> o cualquier subcarpeta de tu carpeta de usuario.
          </p>
          <button
            onClick={handleRetry}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Elegir otra carpeta
          </button>
        </div>
      </div>
    );
  }

  // Folder picker (phase === 'selecting')
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-10 max-w-lg w-full">

        <div className="text-center mb-8">
          <Logo large />
          <h1 className="text-2xl font-bold text-gray-800 mt-4">ContikPro Core</h1>
          <p className="text-gray-500 text-sm mt-1">Configuración inicial — elige dónde guardar tus datos</p>
        </div>

        <div className="bg-blue-50 rounded-2xl p-5 mb-6 border border-blue-100">
          <div className="flex items-start gap-3">
            <Database size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800 text-sm">Datos locales, sin internet</p>
              <p className="text-blue-700 text-xs mt-1 leading-relaxed">
                ContikPro crea{' '}
                <span className="font-mono font-bold">ContikProData/contikpro.sqlite</span>
                {' '}en la carpeta que elijas. Muévela a Dropbox o iCloud para copias automáticas.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleSelectFolder}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-all text-left group"
          >
            <div className="p-2.5 bg-blue-600 rounded-xl flex-shrink-0 group-hover:bg-blue-700 transition-colors">
              <FolderOpen size={20} className="text-white" />
            </div>
            <div>
              <div className="font-bold text-gray-800 text-sm">Elegir carpeta</div>
              <div className="text-xs text-gray-500">Selecciona dónde guardar los datos</div>
            </div>
          </button>

          <button
            onClick={handleDefaultLocation}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all text-left group"
          >
            <div className="p-2.5 bg-gray-200 rounded-xl flex-shrink-0 group-hover:bg-gray-300 transition-colors">
              <HardDrive size={20} className="text-gray-600" />
            </div>
            <div>
              <div className="font-bold text-gray-800 text-sm">Usar carpeta Documentos</div>
              <div className="text-xs text-gray-500">Ubicación estándar del sistema</div>
            </div>
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          ContikPro Core · datos locales · sin servidores · sin internet
        </p>
      </div>
    </div>
  );
};

// ─── Shared logo component ────────────────────────────────────────────────────

const Logo: React.FC<{ large?: boolean }> = ({ large }) => (
  <div className={`
    ${large ? 'w-20 h-20 text-3xl' : 'w-14 h-14 text-2xl'}
    bg-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-lg
  `}>
    <span className="text-white font-bold">CP</span>
  </div>
);
