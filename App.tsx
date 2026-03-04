/**
 * App.tsx — Root component with DB boot gate
 *
 * BOOT SEQUENCE:
 *   index.tsx → initAdapter() → ReactDOM.render(<App />)
 *     └─ useDbReady() subscribes to db-state
 *        ├─ IS_TAURI && !dbReady  → <DataFolderSetup>  (lazy — desktop only)
 *        ├─ !dbReady              → <AppLoadingScreen>  (web: transitional)
 *        └─ dbReady               → <AppRoutes>         (all pages mount)
 *
 * Phase 3: DataFolderSetup is React.lazy() — only loaded in Tauri builds.
 * When IS_TAURI=false (web), the lazy() call is dead-code eliminated and
 * DataFolderSetup + its @tauri-apps/* imports never enter the web bundle.
 */

import React, { Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer as Toaster } from './components/UI';
import Layout from './components/Layout';
// Phase 1: IS_TAURI from centralized environment
import { IS_TAURI } from '@/core/environment';
import { useDbReady } from '@/core/db-state';
import { Loader2 } from 'lucide-react';

// Phase 3: Desktop-only component — lazy so it never enters the web bundle.
// IS_TAURI is a build-time constant: when false, esbuild DCE's this
// React.lazy() call entirely, meaning DataFolderSetup is not bundled at all.
const DataFolderSetup = IS_TAURI
  ? React.lazy(() => import('@/components/DataFolderSetup').then(m => ({ default: m.DataFolderSetup })))
  : null;

// ── Page imports ── static because they contain no Tauri code ─────────────────
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Settings from '@/pages/Settings';
import InboxPage from './pages/InboxPage';
import ImportWizard from '@/pages/ImportWizard';
import EmailTemplatesSettings from '@/pages/EmailTemplatesSettings';
import EmailTemplateEditorPage from '@/pages/EmailTemplateEditorPage';
import { ContactsPage } from './pages/Contacts';
import { ExpensesPage } from './pages/Expenses';
import { TemplatesPage } from './pages/Templates';
import { ItemsPage } from './pages/Items';
import ErrorBoundary from './components/ErrorBoundary';

import { extendRoutes } from '@/core/vertical-engine';
// ─── Loading screen ───────────────────────────────────────────────────────────

const AppLoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center space-y-4">
      <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-lg">
        <span className="text-white text-2xl font-bold">CP</span>
      </div>
      <div className="flex items-center gap-2 text-gray-500 justify-center">
        <Loader2 size={16} className="animate-spin text-blue-500" />
        <span className="text-sm font-medium">Iniciando ClickPro…</span>
      </div>
    </div>
  </div>
);

// ─── App routes ───────────────────────────────────────────────────────────────

const AppRoutes: React.FC = () => {
  const extraRoutes = extendRoutes();
  return (
    <Router>
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <ErrorBoundary>
        <Routes>

          {extraRoutes
            .filter(r => (r as any).wrapInLayout === false)
            .map((r: any) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}

          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/invoices" element={<Documents />} />
            <Route path="/quotes" element={<Documents />} />
            <Route path="/contacts" element={<ContactsPage type="client" />} />
            <Route path="/suppliers" element={<ContactsPage type="supplier" />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/email-templates" element={<EmailTemplatesSettings />} />
            <Route path="/settings/email-templates/:id" element={<EmailTemplateEditorPage />} />
            <Route path="/import" element={<ImportWizard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ErrorBoundary>
      <Toaster />
    </div>
  </Router>
  );
};


// ─── Root component ───────────────────────────────────────────────────────────

const App: React.FC = () => {
  const dbReady = useDbReady();

  // Tauri: show setup screen until SQLite is verified and ready
  if (IS_TAURI && !dbReady && DataFolderSetup) {
    return (
      <Suspense fallback={<AppLoadingScreen />}>
        <DataFolderSetup onReady={() => { /* setDbReady called inside component */ }} />
      </Suspense>
    );
  }

  // Brief loading gate — web mode resolves in <10ms, Tauri right after verify()
  if (!dbReady) {
    return <AppLoadingScreen />;
  }

  return <AppRoutes />;
};

export default App;
