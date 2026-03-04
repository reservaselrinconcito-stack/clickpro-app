import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Monitor } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let _deferredPrompt: BeforeInstallPromptEvent | null = null;

// Capture install prompt early (must be outside React lifecycle)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt = e as BeforeInstallPromptEvent;
});

export const InstallPromptBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Show banner if prompt available and not dismissed
    const dismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (!dismissed && _deferredPrompt) {
      // Wait a bit before showing
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }

    // Listen for future prompt event
    const handler = () => {
      const dismissed = sessionStorage.getItem('pwa-install-dismissed');
      if (!dismissed) setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!_deferredPrompt) return;
    await _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setShowBanner(false);
    _deferredPrompt = null;
  };

  const handleDismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem('pwa-install-dismissed', '1');
  };

  if (isInstalled || !showBanner) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 fade-in duration-400">
        <div className="p-2.5 bg-blue-50 rounded-xl flex-shrink-0">
          <Download size={20} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800 text-sm">Instalar TotalGestPro</p>
          <p className="text-xs text-gray-500 mt-0.5">Acceso directo desde tu pantalla de inicio, sin abrir el navegador</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5"
            >
              <Smartphone size={13} /> Instalar
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Ahora no
            </button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

// Compact install button for use in sidebar or header
export const InstallButton: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) { setIsInstalled(true); return; }
    if (_deferredPrompt) setCanInstall(true);
    const handler = () => setCanInstall(true);
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isInstalled) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-green-600 ${collapsed ? 'justify-center' : ''}`}>
        <Monitor size={15} />
        {!collapsed && <span>App instalada</span>}
      </div>
    );
  }

  if (!canInstall) return null;

  const handleInstall = async () => {
    if (!_deferredPrompt) return;
    await _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setCanInstall(false);
    _deferredPrompt = null;
  };

  return (
    <button
      onClick={handleInstall}
      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors ${collapsed ? 'justify-center' : ''}`}
      title="Instalar app"
    >
      <Download size={16} />
      {!collapsed && <span>Instalar app</span>}
    </button>
  );
};
