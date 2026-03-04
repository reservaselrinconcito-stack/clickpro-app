
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Outlet } from 'react-router-dom';
import { Menu, User, Info } from 'lucide-react';
import { IS_DEMO } from '@/core/environment';

const Layout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-gray-50 flex-col">
            {IS_DEMO && (
                <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between text-xs font-medium z-50">
                    <div className="flex items-center gap-2">
                        <Info size={14} />
                        <span>ESTÁS EN MODO DEMO — Los datos son de ejemplo y no se guardarán permanentemente.</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <a href="https://github.com/reservaselrinconcito-stack/clickpro-app/releases/latest" className="underline hover:text-blue-100">Descargar App Escritorio</a>
                    </div>
                </div>
            )}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Sidebar Component */}
                <Sidebar
                    isOpen={sidebarOpen}
                    toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                />

                {/* Mobile Header (Only visible on small screens) */}
                <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 flex items-center px-4 md:hidden z-30">
                    <button onClick={() => setSidebarOpen(true)} className="p-2 text-gray-600">
                        <Menu size={24} />
                    </button>
                    <span className="ml-4 font-bold text-lg text-[var(--accent-blue)]">TotalGest Pro</span>
                </div>

                {/* Main Content Area */}
                <main className="flex-1 overflow-y-auto overflow-x-hidden md:ml-64 pt-16 md:pt-0">
                    <div className="container mx-auto px-4 py-8 md:px-8">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Layout;
