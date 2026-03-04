import React, { useMemo } from 'react';
import { useQuery } from '@/core/db-adapter/useQuery';
import { invoicesApi, quotesApi, contactsApi, itemsApi, expensesApi } from '@/core/adapter-api';
import { FileText, Users, ShoppingCart, TrendingUp, Settings, Upload, Package, ArrowUpRight, ArrowDownRight, Euro, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/UI';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart } from 'recharts';

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const StatCard = ({ label, value, icon: Icon, color, sub, trend, onClick }: any) => (
    <Card onClick={onClick} className={`p-5 flex items-center gap-4 ${onClick ? 'cursor-pointer' : ''}`}>
        <div className={`p-3 rounded-xl ${color} flex-shrink-0`}>
            <Icon size={22} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium">{label}</p>
            <h3 className="text-xl font-bold text-gray-800 truncate">{value}</h3>
            {sub && <p className={`text-xs mt-0.5 ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>{sub}</p>}
        </div>
    </Card>
);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-gray-100 rounded-xl shadow-lg p-3 text-sm">
                <p className="font-bold text-gray-700 mb-1">{label}</p>
                {payload.map((p: any) => (
                    <p key={p.name} style={{ color: p.color }}>{p.name === 'ingresos' ? 'Ingresos: ' : 'Gastos: '}{fmt(p.value)}</p>
                ))}
            </div>
        );
    }
    return null;
};

const Dashboard: React.FC = () => {
    const navigate = useNavigate();

    const invoiceCount = useQuery(() => invoicesApi.count(), [], ['invoices']) ?? 0;
    const quoteCount = useQuery(() => quotesApi.count(), [], ['quotes']) ?? 0;
    const contactCount = useQuery(() => contactsApi.count(), [], ['contacts']) ?? 0;
    const itemCount = useQuery(() => itemsApi.count(), [], ['items']) ?? 0;

    const allInvoices = useQuery(() => invoicesApi.all(), [], ['invoices']);
    const allExpenses = useQuery(() => expensesApi.all(), [], ['expenses']);
    const allQuotes = useQuery(() => quotesApi.all(), [], ['quotes']);

    const stats = useMemo(() => {
        if (!allInvoices || !allExpenses || !allQuotes) return null;
        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
        const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

        const isMonth = (ts: number, m: number, y: number) => {
            const d = new Date(ts);
            return d.getMonth() === m && d.getFullYear() === y;
        };

        const paidInvoices = allInvoices.filter(i => i.status === 'paid');
        const pendingInvoices = allInvoices.filter(i => ['sent', 'overdue'].includes(i.status));
        const overdueInvoices = allInvoices.filter(i => i.status === 'overdue');

        const thisMonthRevenue = paidInvoices
            .filter(i => isMonth(i.date || i.createdAt || 0, thisMonth, thisYear))
            .reduce((a, i) => a + (i.grandTotal || 0), 0);
        const lastMonthRevenue = paidInvoices
            .filter(i => isMonth(i.date || i.createdAt || 0, lastMonth, lastMonthYear))
            .reduce((a, i) => a + (i.grandTotal || 0), 0);

        const totalRevenue = paidInvoices.reduce((a, i) => a + (i.grandTotal || 0), 0);
        const pendingAmount = pendingInvoices.reduce((a, i) => a + (i.grandTotal || 0), 0);
        const thisMonthExpenses = allExpenses
            .filter(e => isMonth(e.date || 0, thisMonth, thisYear))
            .reduce((a, e) => a + (e.total || 0), 0);

        // Conversion rate: accepted + invoiced quotes / total quotes
        const convertedQuotes = allQuotes.filter(q => ['accepted', 'invoiced'].includes(q.status)).length;
        const convRate = allQuotes.length > 0 ? Math.round((convertedQuotes / allQuotes.length) * 100) : 0;

        // Last 6 months chart data
        const chartData = Array.from({ length: 6 }, (_, i) => {
            const monthIdx = (thisMonth - 5 + i + 12) % 12;
            const yearIdx = thisMonth - 5 + i < 0 ? thisYear - 1 : thisYear;
            const monthName = new Date(yearIdx, monthIdx, 1).toLocaleDateString('es-ES', { month: 'short' });
            const ingresos = paidInvoices
                .filter(inv => isMonth(inv.date || inv.createdAt || 0, monthIdx, yearIdx))
                .reduce((a, inv) => a + (inv.grandTotal || 0), 0);
            const gastos = allExpenses
                .filter(exp => isMonth(exp.date || 0, monthIdx, yearIdx))
                .reduce((a, exp) => a + (exp.total || 0), 0);
            return { mes: monthName.charAt(0).toUpperCase() + monthName.slice(1), ingresos, gastos };
        });

        const revTrend = lastMonthRevenue === 0 ? null : ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(0);

        return { thisMonthRevenue, lastMonthRevenue, totalRevenue, pendingAmount, overdueInvoices, pendingInvoices, thisMonthExpenses, convRate, chartData, revTrend };
    }, [allInvoices, allExpenses, allQuotes]);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Panel de Control</h1>
                <p className="text-gray-500 text-sm">Resumen general de tu actividad.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Facturas" value={invoiceCount} icon={FileText} color="bg-blue-500" onClick={() => navigate('/invoices')} />
                <StatCard label="Presupuestos" value={quoteCount} icon={TrendingUp} color="bg-orange-500"
                    sub={stats ? `${stats.convRate}% conversión` : ''} onClick={() => navigate('/quotes')} />
                <StatCard label="Contactos" value={contactCount} icon={Users} color="bg-purple-500" onClick={() => navigate('/contacts')} />
                <StatCard label="Catálogo" value={itemCount} icon={Package} color="bg-emerald-500" onClick={() => navigate('/items')} />
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle size={16} className="text-emerald-500" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Ingresos cobrados (mes)</span>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{stats ? fmt(stats.thisMonthRevenue) : '—'}</p>
                    {stats?.revTrend && (
                        <p className={`text-xs mt-1 flex items-center gap-1 ${Number(stats.revTrend) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {Number(stats.revTrend) >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {Math.abs(Number(stats.revTrend))}% vs mes anterior
                        </p>
                    )}
                </Card>
                <Card className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock size={16} className="text-orange-500" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pendiente de cobro</span>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{stats ? fmt(stats.pendingAmount) : '—'}</p>
                    {stats && <p className="text-xs text-gray-400 mt-1">{stats.pendingInvoices.length} facturas</p>}
                </Card>
                <Card className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={16} className="text-red-500" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Vencidas</span>
                    </div>
                    <p className="text-xl font-bold text-red-600">{stats ? stats.overdueInvoices.length : '—'}</p>
                    {stats && stats.overdueInvoices.length > 0 && (
                        <p className="text-xs text-red-400 mt-1">{fmt(stats.overdueInvoices.reduce((a, i) => a + (i.grandTotal || 0), 0))}</p>
                    )}
                </Card>
                <Card className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <Euro size={16} className="text-slate-500" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Gastos (mes)</span>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{stats ? fmt(stats.thisMonthExpenses) : '—'}</p>
                    {stats && <p className="text-xs text-gray-400 mt-1">vs {fmt(stats.thisMonthRevenue)} ingresos</p>}
                </Card>
            </div>

            {/* Chart + Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 p-6">
                    <h2 className="text-base font-bold text-gray-800 mb-4">Ingresos vs Gastos — últimos 6 meses</h2>
                    {stats && stats.chartData.some(d => d.ingresos > 0 || d.gastos > 0) ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={stats.chartData} barGap={4} barSize={22}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                                <Bar dataKey="ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="gastos" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm flex-col gap-2">
                            <TrendingUp size={36} className="text-gray-200" />
                            <p>Los datos aparecerán cuando haya facturas y gastos registrados.</p>
                        </div>
                    )}
                    <div className="flex gap-4 mt-3">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />Ingresos cobrados</span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" />Gastos</span>
                    </div>
                </Card>

                <Card className="p-6">
                    <h2 className="text-base font-bold text-gray-800 mb-4">Accesos Rápidos</h2>
                    <div className="space-y-2">
                        {[
                            { path: '/invoices', icon: FileText, label: 'Nueva Factura', color: 'text-blue-600 hover:bg-blue-50' },
                            { path: '/quotes', icon: ShoppingCart, label: 'Nuevo Presupuesto', color: 'text-orange-600 hover:bg-orange-50' },
                            { path: '/contacts', icon: Users, label: 'Clientes', color: 'text-purple-600 hover:bg-purple-50' },
                            { path: '/expenses', icon: TrendingUp, label: 'Registrar Gasto', color: 'text-red-600 hover:bg-red-50' },
                            { path: '/settings', icon: Settings, label: 'Configuración', color: 'text-gray-600 hover:bg-gray-50' },
                            { path: '/import', icon: Upload, label: 'Importar Datos', color: 'text-gray-600 hover:bg-gray-50' },
                        ].map(({ path, icon: Icon, label, color }) => (
                            <button key={path} onClick={() => navigate(path)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${color}`}>
                                <Icon size={16} /> {label}
                            </button>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Recent overdue invoices */}
            {stats && stats.overdueInvoices.length > 0 && (
                <Card className="p-6">
                    <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-500" /> Facturas vencidas
                    </h2>
                    <div className="space-y-2">
                        {stats.overdueInvoices.slice(0, 5).map((inv: any) => (
                            <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">{inv.number || inv.id.slice(0, 8)}</p>
                                    <p className="text-xs text-gray-400">{inv.contactName || '—'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-red-600">{fmt(inv.grandTotal || 0)}</p>
                                    <button onClick={() => navigate('/invoices')} className="text-xs text-blue-500 hover:underline">Ver</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default Dashboard;
