
import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Info } from 'lucide-react';

// --- TOAST SYSTEM ---
type ToastType = 'success' | 'error' | 'info';
type ToastEvent = { message: string; type: ToastType; id: number };
const listeners: ((toast: ToastEvent) => void)[] = [];

export const notify = (message: string, type: ToastType = 'success') => {
  const event = { message, type, id: Date.now() };
  listeners.forEach(l => l(event));
};

export const ToastContainer = () => {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    const handler = (t: ToastEvent) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      }, 3000);
    };
    listeners.push(handler);
    return () => {
      const idx = listeners.indexOf(handler);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center space-x-2 animate-in slide-in-from-right fade-in duration-300 ${t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-[var(--accent-blue)]'}`}>
          {t.type === 'success' && <Check size={16} />}
          {t.type === 'error' && <AlertCircle size={16} />}
          {t.type === 'info' && <Info size={16} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
};

// --- COMPONENTS ---

export const Button = ({ children, onClick, variant = 'primary', size = 'md', className = '', type = 'button', disabled = false, ...props }: any) => {
  const base = "font-medium transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border outline-none focus:ring-2 focus:ring-offset-1";

  const sizes = {
    sm: "px-2 py-1 text-xs rounded-md",
    md: "px-4 py-2 text-sm rounded-lg",
    lg: "px-6 py-3 text-base rounded-xl"
  };

  const variants = {
    primary: "bg-[var(--accent-blue)] text-white border-[var(--accent-blue)] hover:opacity-90 focus:ring-[var(--accent-blue-glow)] shadow-sm",
    secondary: "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 focus:ring-gray-200 shadow-sm",
    danger: "bg-white text-red-600 border-red-200 hover:bg-red-50 focus:ring-red-200",
    ghost: "text-gray-500 hover:bg-gray-100 border-transparent hover:text-gray-900 focus:ring-gray-200",
    success: "bg-green-600 text-white border-green-600 hover:bg-green-700 focus:ring-green-500 shadow-sm"
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size as keyof typeof sizes]} ${variants[variant as keyof typeof variants]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const Input = ({ label, className = "", error, ...props }: any) => (
  <div className={`flex flex-col space-y-1.5 w-full ${className}`}>
    {label && <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">{label}</label>}
    <input
      className={`px-3 py-2 border ${error ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 hover:border-gray-400 focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue-soft)]'} bg-white text-gray-900 placeholder-gray-400 rounded-md outline-none transition-all text-sm shadow-sm disabled:bg-gray-50 disabled:text-gray-500`}
      {...props}
    />
    {error && <span className="text-xs text-red-500 flex items-center mt-1"><AlertCircle size={12} className="mr-1" />{error}</span>}
  </div>
);

export const Select = ({ label, className = "", error, children, ...props }: any) => (
  <div className={`flex flex-col space-y-1.5 w-full ${className}`}>
    {label && <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">{label}</label>}
    <div className="relative">
      <select
        className={`w-full px-3 py-2 border ${error ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 hover:border-gray-400 focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue-soft)]'} bg-white text-gray-900 rounded-md outline-none transition-all text-sm shadow-sm appearance-none disabled:bg-gray-50 disabled:text-gray-500 cursor-pointer`}
        {...props}
      >
        {children}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
        <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
      </div>
    </div>
    {error && <span className="text-xs text-red-500 flex items-center mt-1"><AlertCircle size={12} className="mr-1" />{error}</span>}
  </div>
);

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} relative z-10 flex flex-col max-h-[90vh] border border-gray-100`}>
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export const Badge = ({ color = 'gray', children }: any) => {
  const colors = {
    gray: 'bg-gray-100 text-gray-700 border border-gray-200',
    green: 'bg-green-50 text-green-700 border border-green-200',
    red: 'bg-red-50 text-red-700 border border-red-200',
    blue: 'bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] border border-opacity-20',
    yellow: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    orange: 'bg-orange-50 text-orange-700 border border-orange-200',
    purple: 'bg-purple-50 text-purple-700 border border-purple-200'
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${colors[color as keyof typeof colors] || colors.gray}`}>
      {children}
    </span>
  );
}

export const Card = ({ children, className = '', noHover = false, variant = 'default', ...props }: any) => {
  const variants = {
    default: "shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)]",
    blue: "shadow-[0_12px_30px_-18px_rgba(59,130,246,0.60)]",
    green: "shadow-[0_12px_30px_-18px_rgba(16,185,129,0.55)]",
    red: "shadow-[0_12px_30px_-18px_rgba(239,68,68,0.55)]",
    orange: "shadow-[0_12px_30px_-18px_rgba(249,115,22,0.55)]",
  };

  const shadowClass = variants[variant as keyof typeof variants] || variants.default;

  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 ${shadowClass} ${!noHover ? 'hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:-translate-y-0.5' : ''} transition-all duration-300 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
