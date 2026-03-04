/**
 * cloudSync.ts — Google Drive sync para TotalGestPro
 *
 * Estrategia: guarda el backup completo en appDataFolder del Drive del usuario.
 * - appDataFolder es privado para la app (el usuario no lo ve en su Drive)
 * - No requiere ningún backend propio
 * - El usuario no necesita cuenta adicional (usa su Google Account)
 *
 * Setup: necesita VITE_GOOGLE_CLIENT_ID en .env (Google Cloud Console → OAuth 2.0 Client ID)
 * Scopes: https://www.googleapis.com/auth/drive.appdata
 */

import { createBackup, restoreBackup } from './backupService';

const CLIENT_ID = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID)
  || (window as any).__GOOGLE_CLIENT_ID__
  || '';

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_FILENAME = 'totalgestpro-sync.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

// ─── Token storage ────────────────────────────────────────────────────────────

export interface SyncState {
  connected: boolean;
  lastSync: number | null;
  syncError: string | null;
  syncing: boolean;
  email: string | null;
}

let _accessToken: string | null = null;
let _tokenExpiry: number = 0;
let _stateListeners: ((s: SyncState) => void)[] = [];
let _state: SyncState = { connected: false, lastSync: null, syncError: null, syncing: false, email: null };

function setState(update: Partial<SyncState>) {
  _state = { ..._state, ...update };
  _stateListeners.forEach(fn => fn({ ..._state }));
  // Persist minimal state
  try {
    localStorage.setItem('tgp-sync-state', JSON.stringify({
      connected: _state.connected,
      lastSync: _state.lastSync,
      email: _state.email,
    }));
  } catch {}
}

export function getSyncState(): SyncState { return { ..._state }; }
export function onSyncStateChange(fn: (s: SyncState) => void) {
  _stateListeners.push(fn);
  fn({ ..._state }); // immediate
  return () => { _stateListeners = _stateListeners.filter(l => l !== fn); };
}

// Restore persisted state on module load
try {
  const saved = JSON.parse(localStorage.getItem('tgp-sync-state') || '{}');
  if (saved.connected) {
    _state = { ..._state, connected: saved.connected, lastSync: saved.lastSync || null, email: saved.email || null };
  }
} catch {}

// ─── Google OAuth (popup-based) ───────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!CLIENT_ID;
}

export async function connectGoogle(): Promise<boolean> {
  if (!CLIENT_ID) {
    setState({ syncError: 'Google Client ID no configurado. Ver README.' });
    return false;
  }

  return new Promise((resolve) => {
    const client = (window as any).google?.accounts?.oauth2?.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp: any) => {
        if (resp.error) {
          setState({ syncError: resp.error_description || resp.error, connected: false });
          resolve(false);
          return;
        }
        _accessToken = resp.access_token;
        _tokenExpiry = Date.now() + (resp.expires_in * 1000) - 60000;
        setState({ connected: true, syncError: null });
        // Fetch user email
        fetchUserEmail().then(email => setState({ email }));
        resolve(true);
      },
    });

    if (!client) {
      setState({ syncError: 'Google Identity Services no cargado. Comprueba la conexión.' });
      resolve(false);
      return;
    }

    client.requestAccessToken();
  });
}

async function fetchUserEmail(): Promise<string | null> {
  try {
    const resp = await driveRequest('https://www.googleapis.com/oauth2/v2/userinfo');
    const data = await resp.json();
    return data.email || null;
  } catch { return null; }
}

export function disconnect() {
  _accessToken = null;
  _tokenExpiry = 0;
  setState({ connected: false, lastSync: null, syncError: null, email: null });
  try { localStorage.removeItem('tgp-sync-state'); } catch {}
}

// ─── Drive API helpers ────────────────────────────────────────────────────────

function hasValidToken(): boolean {
  return !!_accessToken && Date.now() < _tokenExpiry;
}

async function driveRequest(url: string, options: RequestInit = {}): Promise<Response> {
  if (!hasValidToken()) throw new Error('No hay sesión activa. Reconecta Google Drive.');
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${_accessToken}`,
      ...(options.headers || {}),
    },
  });
}

async function findBackupFile(): Promise<string | null> {
  const resp = await driveRequest(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name='${BACKUP_FILENAME}'&fields=files(id,name,modifiedTime)`
  );
  const data = await resp.json();
  return data.files?.[0]?.id || null;
}

// ─── Sync operations ──────────────────────────────────────────────────────────

export async function syncToCloud(): Promise<void> {
  if (!hasValidToken()) {
    setState({ syncError: 'Sesión expirada. Reconecta Google Drive.' });
    return;
  }
  setState({ syncing: true, syncError: null });
  try {
    const backup = await createBackup();
    const json = JSON.stringify(backup);
    const blob = new Blob([json], { type: 'application/json' });

    const existingId = await findBackupFile();

    if (existingId) {
      // Update existing file
      await driveRequest(
        `${UPLOAD_API}/files/${existingId}?uploadType=media`,
        { method: 'PATCH', body: blob, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      // Create new file in appDataFolder
      const metadata = JSON.stringify({ name: BACKUP_FILENAME, parents: ['appDataFolder'] });
      const form = new FormData();
      form.append('metadata', new Blob([metadata], { type: 'application/json' }));
      form.append('file', blob);
      await driveRequest(`${UPLOAD_API}/files?uploadType=multipart`, { method: 'POST', body: form });
    }

    setState({ lastSync: Date.now(), syncing: false, syncError: null });
  } catch (err: any) {
    setState({ syncing: false, syncError: err.message || 'Error al sincronizar' });
    throw err;
  }
}

export async function restoreFromCloud(merge = false): Promise<{ restored: boolean; summary?: any }> {
  if (!hasValidToken()) {
    setState({ syncError: 'Sesión expirada. Reconecta Google Drive.' });
    return { restored: false };
  }
  setState({ syncing: true, syncError: null });
  try {
    const fileId = await findBackupFile();
    if (!fileId) {
      setState({ syncing: false, syncError: null });
      return { restored: false };
    }

    const resp = await driveRequest(`${DRIVE_API}/files/${fileId}?alt=media`);
    const data = await resp.json();
    const result = await restoreBackup(data, !merge);

    setState({ lastSync: Date.now(), syncing: false });
    return { restored: true, summary: result };
  } catch (err: any) {
    setState({ syncing: false, syncError: err.message || 'Error al restaurar' });
    throw err;
  }
}

export async function checkCloudBackupExists(): Promise<{ exists: boolean; timestamp?: number }> {
  if (!hasValidToken()) return { exists: false };
  try {
    const resp = await driveRequest(
      `${DRIVE_API}/files?spaces=appDataFolder&q=name='${BACKUP_FILENAME}'&fields=files(id,modifiedTime)`
    );
    const data = await resp.json();
    const file = data.files?.[0];
    return file ? { exists: true, timestamp: new Date(file.modifiedTime).getTime() } : { exists: false };
  } catch { return { exists: false }; }
}

// ─── Auto-sync ────────────────────────────────────────────────────────────────

let _autoSyncTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutoSync(delayMs = 30000) {
  if (_autoSyncTimer) clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(() => {
    if (hasValidToken() && _state.connected) {
      syncToCloud().catch(() => {});
    }
  }, delayMs);
}

// Called by db.ts whenever data changes to queue a sync
export function queueSync() {
  if (_state.connected && hasValidToken()) {
    scheduleAutoSync(15000); // sync 15s after last change
  }
}
