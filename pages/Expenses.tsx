
import React, { useState, useEffect } from 'react';
import { useQuery } from '@/core/db-adapter/useQuery';
import { expensesApi, contactsApi } from '@/core/adapter-api';
import { Expense } from '../types';
import { Button, Input, Modal, Card, Badge, Select, notify } from '../components/UI';
import { Search, Plus, Trash2, Edit3, CreditCard, Download, Paperclip, FileText, Calendar, User, Filter, Check, XCircle, CheckCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export const ExpensesPage = () => {
    // Queries
    const suppliers = useQuery(() => contactsApi.byType('supplier'), [], ['contacts']) || [];
    const allExpenses = useQuery(() => expensesApi.all(), [], ['expenses']) || [];

    // Filters State
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [supplierFilter, setSupplierFilter] = useState('ALL');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

    // Derived Data
    const uniqueCategories = Array.from(new Set(allExpenses.map(e => e.category).filter(Boolean)));
    
    const filteredExpenses = allExpenses.filter(e => {
        const matchesDate = (!dateRange.start || e.date >= dateRange.start) && 
                            (!dateRange.end || e.date <= dateRange.end);
        const matchesSupplier = supplierFilter === 'ALL' || e.supplierId === supplierFilter;
        const matchesCategory = categoryFilter === 'ALL' || e.category === categoryFilter;
        const matchesSearch = e.concept.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (suppliers.find(s => s.id === e.supplierId)?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        return matchesDate && matchesSupplier && matchesCategory && matchesSearch;
    });

    const totalBase = filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);
    const totalVat = filteredExpenses.reduce((acc, curr) => acc + curr.vatAmount, 0);
    const totalAmount = filteredExpenses.reduce((acc, curr) => acc + curr.total, 0);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        
        const amount = parseFloat(formData.get('amount') as string);
        const vatPct = parseFloat(formData.get('vatPct') as string);
        const vatAmount = amount * (vatPct / 100);
        
        // Handle file attachment
        const attachmentFile = (formData.get('attachment') as File);
        let attachmentBase64 = editingExpense?.attachment;

        if (attachmentFile && attachmentFile.size > 0) {
            if (attachmentFile.size > 5 * 1024 * 1024) return notify('El archivo es demasiado grande (Máx 5MB)', 'error');
            attachmentBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(attachmentFile);
            });
        }
        
        const data: Partial<Expense> = {
            date: formData.get('date') as string,
            supplierId: formData.get('supplierId') as string,
            category: formData.get('category') as string,
            concept: formData.get('concept') as string,
            amount: amount,
            vatPct: vatPct,
            vatAmount: vatAmount,
            total: amount + vatAmount,
            paymentMethod: formData.get('paymentMethod') as string,
            attachment: attachmentBase64,
            paid: formData.get('paid') === 'on',
            deductible: true,
            updatedAt: Date.now()
        };

        try {
            if (editingExpense) {
                await expensesApi.update(editingExpense.id, data);
                notify('Gasto actualizado', 'success');
            } else {
                await expensesApi.add({
                    id: uuidv4(),
                    createdAt: Date.now(),
                    ...data
                } as Expense);
                notify('Gasto registrado', 'success');
            }
            setIsModalOpen(false);
        } catch(e) {
            notify('Error al guardar', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if(confirm('¿Eliminar este gasto?')) {
            await expensesApi.delete(id);
            notify('Gasto eliminado', 'success');
        }
    };

    const handleExport = () => {
        const header = ['Fecha', 'Proveedor', 'Concepto', 'Categoría', 'Método', 'Estado', 'Base', 'IVA', 'Total'];
        const rows = filteredExpenses.map(e => [
            e.date,
            suppliers.find(s => s.id === e.supplierId)?.name || 'Varios',
            `"${e.concept.replace(/"/g, '""')}"`,
            e.category,
            e.paymentMethod || '-',
            e.paid ? 'Pagado' : 'Pendiente',
            e.amount.toFixed(2),
            e.vatAmount.toFixed(2),
            e.total.toFixed(2)
        ]);

        const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `gastos_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const openModal = (exp?: Expense) => {
        setEditingExpense(exp || null);
        setIsModalOpen(true);
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Gastos</h1>
                    <p className="text-gray-500">Registro de compras y facturas recibidas</p>
                </div>
                <div className="flex space-x-2">
                     <Button variant="secondary" onClick={handleExport} disabled={filteredExpenses.length === 0}><Download size={18} className="mr-2"/> Exportar CSV</Button>
                     <Button onClick={() => openModal()}><Plus size={18}/> Registrar Gasto</Button>
                </div>
            </div>

            {/* Filters Bar */}
            <Card className="p-4 flex flex-wrap gap-4 items-end bg-white border border-gray-200">
                 <div className="flex-1 min-w-[200px]">
                     <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Búsqueda</label>
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input className="w-full pl-9 pr-3 py-2 border rounded-md text-sm outline-none focus:border-[var(--accent-blue)]" placeholder="Concepto o proveedor..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                     </div>
                 </div>
                 <div>
                     <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Desde</label>
                     <input type="date" className="px-3 py-2 border rounded-md text-sm outline-none focus:border-[var(--accent-blue)]" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
                 </div>
                 <div>
                     <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Hasta</label>
                     <input type="date" className="px-3 py-2 border rounded-md text-sm outline-none focus:border-[var(--accent-blue)]" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
                 </div>
                 <div className="min-w-[150px]">
                     <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Proveedor</label>
                     <select className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[var(--accent-blue)]" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
                         <option value="ALL">Todos</option>
                         {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                     </select>
                 </div>
                 <div className="min-w-[150px]">
                     <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Categoría</label>
                     <select className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-[var(--accent-blue)]" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                         <option value="ALL">Todas</option>
                         {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                 </div>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-5 border-l-4 border-gray-400">
                    <div className="text-xs uppercase font-bold text-gray-400">Base Imponible</div>
                    <div className="text-xl font-bold text-gray-700 mt-1">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(totalBase)}</div>
                </Card>
                <Card className="p-5 border-l-4 border-gray-400">
                    <div className="text-xs uppercase font-bold text-gray-400">IVA Soportado</div>
                    <div className="text-xl font-bold text-gray-700 mt-1">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(totalVat)}</div>
                </Card>
                <Card className="p-5 border-l-4 border-red-500 bg-red-50/30">
                    <div className="text-xs uppercase font-bold text-red-400">Total Gastos</div>
                    <div className="text-2xl font-bold text-red-700 mt-1">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(totalAmount)}</div>
                </Card>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="text-xs font-bold text-gray-500 uppercase bg-gray-50 border-b">
                        <tr>
                            <th className="px-6 py-3">Fecha</th>
                            <th className="px-6 py-3">Proveedor / Concepto</th>
                            <th className="px-6 py-3">Categoría</th>
                            <th className="px-6 py-3 text-center">Estado</th>
                            <th className="px-6 py-3 text-right">Base</th>
                            <th className="px-6 py-3 text-right">Total</th>
                            <th className="px-6 py-3 text-center">Adjunto</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredExpenses.map(exp => {
                            const supplier = suppliers.find(s => s.id === exp.supplierId);
                            return (
                                <tr key={exp.id} className="hover:bg-gray-50 group">
                                    <td className="px-6 py-3 text-sm text-gray-500">
                                        <div>{new Date(exp.date).toLocaleDateString()}</div>
                                        <div className="text-xs text-gray-400">{exp.paymentMethod}</div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="font-bold text-gray-900">{supplier?.name || 'Varios'}</div>
                                        <div className="text-sm text-gray-600">{exp.concept}</div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <Badge color="gray">{exp.category}</Badge>
                                    </td>
                                    <td className="px-6 py-3 text-center">
                                        <Badge color={exp.paid ? 'green' : 'red'}>
                                            {exp.paid ? 'Pagado' : 'Pendiente'}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono text-gray-600">{exp.amount.toFixed(2)}</td>
                                    <td className="px-6 py-3 text-right font-bold font-mono text-gray-800">{exp.total.toFixed(2)} €</td>
                                    <td className="px-6 py-3 text-center">
                                        {exp.attachment ? (
                                            <a href={exp.attachment} download={`recibo_${exp.date}.png`} className="text-[var(--accent-blue)] hover:text-blue-800 flex justify-center" title="Descargar Recibo"><Paperclip size={16}/></a>
                                        ) : <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                         <button onClick={() => openModal(exp)} className="text-[var(--accent-blue)] hover:text-blue-800 mr-2"><Edit3 size={16}/></button>
                                         <button onClick={() => handleDelete(exp.id)} className="text-gray-300 hover:text-red-600"><Trash2 size={16}/></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                 {filteredExpenses.length === 0 && <div className="p-8 text-center text-gray-400">No hay gastos registrados con estos filtros.</div>}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingExpense ? 'Editar Gasto' : 'Registrar Gasto'}>
                <form key={editingExpense ? editingExpense.id : 'new'} onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="date" label="Fecha" type="date" defaultValue={editingExpense?.date || new Date().toISOString().split('T')[0]} required />
                        <Select name="supplierId" label="Proveedor" defaultValue={editingExpense?.supplierId || ''}>
                            <option value="">-- Varios / Sin asignar --</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                    </div>

                    <Input name="concept" label="Concepto / Descripción" defaultValue={editingExpense?.concept} required />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="category" label="Categoría" defaultValue={editingExpense?.category || 'General'} list="categories" />
                        <datalist id="categories">
                            <option value="Servicios"/>
                            <option value="Suministros"/>
                            <option value="Alquiler"/>
                            <option value="Nóminas"/>
                            <option value="Impuestos"/>
                            <option value="Software"/>
                            <option value="Oficina"/>
                            <option value="Viajes"/>
                        </datalist>
                        <Select name="paymentMethod" label="Método Pago" defaultValue={editingExpense?.paymentMethod || 'transfer'}>
                            <option value="transfer">Transferencia</option>
                            <option value="card">Tarjeta</option>
                            <option value="cash">Efectivo</option>
                            <option value="domiciliation">Domiciliación</option>
                            <option value="paypal">PayPal</option>
                        </Select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded border border-gray-200">
                        <Input name="amount" label="Base Imponible" type="number" step="0.01" defaultValue={editingExpense?.amount} required />
                        <Input name="vatPct" label="IVA %" type="number" defaultValue={editingExpense?.vatPct || 21} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex-1 mr-4">
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1">Adjunto (Recibo)</label>
                            <input type="file" name="attachment" accept="image/*,.pdf" className="text-sm w-full border border-gray-300 rounded p-1 text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"/>
                            {editingExpense?.attachment && <div className="text-xs text-green-600 mt-1 flex items-center"><Check size={12} className="mr-1"/> Archivo existente</div>}
                        </div>
                        <div className="flex items-center pt-4">
                            <label className="flex items-center space-x-2 cursor-pointer select-none">
                                <input type="checkbox" name="paid" defaultChecked={editingExpense?.paid ?? true} className="w-5 h-5 text-[var(--accent-blue)] rounded focus:ring-[var(--accent-blue)] border-gray-300"/>
                                <span className="font-bold text-gray-700 text-sm">Pagado</span>
                            </label>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end space-x-2 border-t mt-2">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button type="submit">Guardar Gasto</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
