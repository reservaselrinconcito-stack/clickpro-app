import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FileText, ShoppingCart, MessageSquare, Settings,
  Upload, Users, Truck, Receipt, FileCode, Package, X, Menu, Database
} from 'lucide-react';
import { IS_TAURI } from '@/core/environment';

const Sidebar = ({ isOpen, toggleSidebar }: { isOpen: boolean; toggleSidebar: () => void }) => {
  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/contacts', icon: Users, label: 'Clientes' },
    { path: '/suppliers', icon: Truck, label: 'Proveedores' },
    { path: '/invoices', icon: FileText, label: 'Facturas' },
    { path: '/quotes', icon: ShoppingCart, label: 'Presupuestos' },
    { path: '/expenses', icon: Receipt, label: 'Gastos' },
    { path: '/items', icon: Package, label: 'Catálogo' },
    { path: '/templates', icon: FileCode, label: 'Plantillas' },
    { path: '/inbox', icon: MessageSquare, label: 'Comunicaciones' },
    { path: '/import', icon: Upload, label: 'Importar' },
    { path: '/settings', icon: Settings, label: 'Configuración' },
  ];

  return (
    <>
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
        onClick={toggleSidebar}
      >
        <Menu size={24} />
      </button>

      <aside
        className={`fixed top-0 left-0 z-40 h-screen bg-white border-r border-gray-200 transition-transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 w-64 flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div>
            <span className="text-xl font-bold text-[var(--accent-blue)] whitespace-nowrap">
              ClickPro
            </span>
            {IS_TAURI && (
              <div className="flex items-center gap-1 mt-0.5">
                <Database size={10} className="text-green-500" />
                <span className="text-xs text-green-600 font-medium">SQLite local</span>
              </div>
            )}
          </div>
          <button
            className="md:hidden p-1 text-gray-400 hover:text-gray-600"
            onClick={toggleSidebar}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          <ul className="space-y-0.5">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-[var(--accent-blue)]'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                  onClick={() => window.innerWidth < 768 && toggleSidebar()}
                >
                  <item.icon size={17} className="flex-shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-400">
            v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.0.0'}
            {IS_TAURI ? ' · Desktop' : ' · Web'}
          </p>
        </div>
      </aside>

      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-gray-900 bg-opacity-50 md:hidden"
          onClick={toggleSidebar}
        />
      )}
    </>
  );
};

export default Sidebar;
