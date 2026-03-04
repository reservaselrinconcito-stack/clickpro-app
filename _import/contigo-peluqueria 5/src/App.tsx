/**
 * App.tsx — v2.4.0 — Contigo
 *
 * Boot sequence (unchanged):
 * 1. Load data folder path
 * 2. If not set → SetupWizard
 * 3. Open SQLite DB
 * 4. Check license
 * 5. Route to app
 *
 * New in v2.4.0:
 * - Peluquería vertical: /calendar, /inbox, /web-editor
 * - Sidebar with unread badge on Buzón
 * - Feature flags via app-config
 */

import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import {
  BrowserRouter as Router, Routes, Route, Navigate,
  NavLink, useNavigate, useLocation
} from 'react-router-dom';
import { LicenseProvider, useLicense } from './contexts/LicenseContext';
import { SetupWizard } from './components/SetupWizard';
import { LoginScreen } from './components/LoginScreen';
import { LicenseExpiredScreen } from './components/LicenseExpiredScreen';
import { getDataFolderPath, setDataFolderPath } from './tauri/app-store';
import { isTauri } from './tauri/tauri-utils';
import { getFeature, getBranding } from './core/config/app-config';
import { getUnreadCount } from './verticals/peluqueria/services/inbox-service';
import {
  LayoutDashboard, FileText, FileCheck, Users, Package,
  BarChart3, Settings, Calendar, Inbox, Globe, Scissors,
  ChevronLeft
} from 'lucide-react';

// ─── Lazy loaded pages ─────────────────────────────────────────────────────────

const Dashboard     = lazy(() => import('./pages/Dashboard'));
const Invoices      = lazy(() => import('./pages/Invoices'));
const Quotes        = lazy(() => import('./pages/Quotes'));
const Contacts      = lazy(() => import('./pages/Contacts'));
const Items         = lazy(() => import('./pages/Items'));
const Accounting    = lazy(() => import('./pages/Accounting'));
const SettingsPage  = lazy(() => import('./pages/Settings'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail'));
const QuoteDetail   = lazy(() => import('./pages/QuoteDetail'));

// Peluquería vertical
const CalendarPage  = lazy(() => import('./verticals/peluqueria/pages/CalendarPage'));
const InboxPage     = lazy(() => import('./verticals/peluqueria/pages/InboxPage'));
const WebEditorPage = lazy(() => import('./verticals/peluqueria/pages/WebEditorPage'));

// ─── Sidebar ───────────────────────────────────────────────────────────────────

const navCoreItems = [
  { to: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/invoices',   label: 'Facturas',     icon: FileText },
  { to: '/quotes',     label: 'Presupuestos', icon: FileCheck },
  { to: '/contacts',   label: 'Clientes',     icon: Users },
  { to: '/items',      label: 'Artículos',    icon: Package },
  { to: '/accounting', label: 'Contabilidad', icon: BarChart3 },
];

const navPeluqueriaItems = [
  { to: '/calendar',   label: 'Calendario',  icon: Calendar },
  { to: '/inbox',      label: 'Buzón',       icon: Inbox,   badge: true },
  { to: '/web-editor', label: 'Mi Web',      icon: Globe },
];

function Sidebar({ unreadCount }: { unreadCount: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const branding = getBranding();
  const hasPeluqueria = getFeature('peluqueria');

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-sm font-medium group ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <aside className={`h-screen shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all ${
      collapsed ? 'w-16' : 'w-56'
    }`}>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Scissors size={14} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-base">{branding.appName}</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
        >
          <ChevronLeft size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">

        {/* Core */}
        {!collapsed && (
          <p className="text-xs font-semibold text-gray-400 px-2 mb-1 mt-2 uppercase tracking-wide">
            Gestión
          </p>
        )}
        {navCoreItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass} title={label}>
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}

        {/* Peluquería vertical */}
        {hasPeluqueria && (
          <>
            {!collapsed && (
              <p className="text-xs font-semibold text-gray-400 px-2 mb-1 mt-4 uppercase tracking-wide">
                Peluquería
              </p>
            )}
            {navPeluqueriaItems.map(({ to, label, icon: Icon, badge }) => (
              <NavLink key={to} to={to} className={linkClass} title={label}>
                <div className="relative">
                  <Icon size={18} className="shrink-0" />
                  {badge && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white
                      text-xs rounded-full flex items-center justify-center font-bold leading-none">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <span className="flex-1">{label}</span>
                )}
                {!collapsed && badge && unreadCount > 0 && (
                  <span className="ml-auto text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                    {unreadCount}
                  </span>
                )}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Settings at bottom */}
      <div className="px-2 py-3 border-t border-gray-100">
        <NavLink to="/settings" className={linkClass} title="Configuración">
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Configuración</span>}
        </NavLink>
      </div>
    </aside>
  );
}

// ─── App Router ────────────────────────────────────────────────────────────────

function AppRouter({ viewOnly }: { viewOnly: boolean }) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll inbox unread count every 30s
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const count = await getUnreadCount();
        if (mounted) setUnreadCount(count);
      } catch { /* ignore if table not ready */ }
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const hasPeluqueria = getFeature('peluqueria');

  return (
    <Router>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar unreadCount={unreadCount} />

        <main className="flex-1 overflow-hidden flex flex-col">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="text-gray-400 text-sm">Cargando…</div>
            </div>
          }>
            <Routes>
              <Route path="/"             element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"    element={<Dashboard />} />
              <Route path="/invoices"     element={<Invoices viewOnly={viewOnly} />} />
              <Route path="/invoices/:id" element={<InvoiceDetail viewOnly={viewOnly} />} />
              <Route path="/quotes"       element={<Quotes viewOnly={viewOnly} />} />
              <Route path="/quotes/:id"   element={<QuoteDetail viewOnly={viewOnly} />} />
              <Route path="/contacts"     element={<Contacts viewOnly={viewOnly} />} />
              <Route path="/items"        element={<Items viewOnly={viewOnly} />} />
              <Route path="/accounting"   element={<Accounting />} />
              <Route path="/settings"     element={<SettingsPage />} />

              {/* Peluquería vertical */}
              {hasPeluqueria && <>
                <Route path="/calendar"    element={<CalendarPage />} />
                <Route path="/inbox"       element={<InboxPage />} />
                <Route path="/web-editor"  element={<WebEditorPage />} />
              </>}

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </Router>
  );
}

// ─── Licensed App ──────────────────────────────────────────────────────────────

function LicensedApp() {
  const { status } = useLicense();
  const [viewOnly, setViewOnly] = useState(false);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Verificando licencia…</p>
        </div>
      </div>
    );
  }

  if (status === 'unlicensed') return <LoginScreen />;

  if ((status === 'expired' || status === 'blocked') && !viewOnly) {
    return <LicenseExpiredScreen onContinueViewOnly={() => setViewOnly(true)} />;
  }

  return <AppRouter viewOnly={viewOnly || status === 'expired' || status === 'blocked'} />;
}

// ─── Main App ──────────────────────────────────────────────────────────────────

type BootState = 'loading' | 'needs-setup' | 'db-opening' | 'ready';

export default function App() {
  const [bootState, setBootState] = useState<BootState>('loading');

  useEffect(() => {
    (async () => {
      try {
        const path = await getDataFolderPath();
        if (!path && isTauri()) { setBootState('needs-setup'); return; }
        if (!path && !isTauri()) await setDataFolderPath('/web-mode');

        setBootState('db-opening');

        if (isTauri() && path) {
          const { initializeDatabase } = await import('./tauri/db-adapter');
          await initializeDatabase(`${path}/contigo.sqlite`);
        }

        setBootState('ready');
      } catch (err) {
        console.error('Boot error:', err);
        setBootState('ready');
      }
    })();
  }, []);

  async function handleSetupComplete(folderPath: string) {
    setBootState('db-opening');
    try {
      if (isTauri()) {
        const { initializeDatabase } = await import('./tauri/db-adapter');
        await initializeDatabase(`${folderPath}/contigo.sqlite`);
      }
      setBootState('ready');
    } catch (err) {
      console.error('DB init error:', err);
      setBootState('ready');
    }
  }

  const branding = getBranding();

  if (bootState === 'loading' || bootState === 'db-opening') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">
            {bootState === 'loading' ? `Iniciando ${branding.appName}…` : 'Abriendo base de datos…'}
          </p>
        </div>
      </div>
    );
  }

  if (bootState === 'needs-setup') {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <LicenseProvider>
      <LicensedApp />
    </LicenseProvider>
  );
}
