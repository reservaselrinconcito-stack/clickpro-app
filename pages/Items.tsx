import React, { useState } from 'react';
import { useQuery } from '@/core/db-adapter/useQuery';
import { itemsApi } from '@/core/adapter-api';
import { CatalogItem } from '../types';
import { Button, Input, Modal, Card, notify } from '../components/UI';
import { Search, Plus, Trash2, Edit3, Package, Tag, DollarSign } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const fmt = (n: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n ?? 0);

export const ItemsPage = () => {
    const items = useQuery(() => itemsApi.all(), [], ['items']) ?? [];
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

    const filtered = items.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.sku || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.category || '').toLowerCase().includes(search.toLowerCase())
    );

    const handleEdit = (item: CatalogItem) => { setEditingItem(item); setIsModalOpen(true); };
    const handleNew = () => { setEditingItem(null); setIsModalOpen(true); };

    const handleDelete = async (id: string) => {
        if (confirm('¿Eliminar este artículo del catálogo?')) {
            await itemsApi.delete(id);
            notify('Artículo eliminado', 'success');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const data: Partial<CatalogItem> = {
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            sku: formData.get('sku') as string,
            category: formData.get('category') as string,
            price: parseFloat(formData.get('price') as string) || 0,
            vatPct: parseFloat(formData.get('vatPct') as string) || 21,
            unit: formData.get('unit') as string,
            active: true,
        };
        try {
            if (editingItem) {
                await itemsApi.update(editingItem.id, data);
                notify('Artículo actualizado', 'success');
            } else {
                await itemsApi.add({ id: uuidv4(), ...data } as CatalogItem);
                notify('Artículo creado', 'success');
            }
            setIsModalOpen(false);
        } catch {
            notify('Error al guardar', 'error');
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Catálogo de Artículos</h1>
                    <p className="text-gray-500">{items.length} artículos en catálogo</p>
                </div>
                <Button onClick={handleNew}><Plus size={18} /> Nuevo Artículo</Button>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                    placeholder="Buscar por nombre, SKU, categoría..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(item => (
                    <Card key={item.id} className="p-5 hover:shadow-md transition-shadow group relative border border-gray-200">
                        <div className="absolute top-4 right-4 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEdit(item)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit3 size={15} /></button>
                            <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded"><Trash2 size={15} /></button>
                        </div>
                        <div className="flex items-start gap-3 mb-3">
                            <div className="p-2 bg-blue-50 rounded-lg"><Package size={18} className="text-blue-600" /></div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-900 truncate pr-10">{item.name}</h3>
                                {item.sku && <p className="text-xs text-gray-400 font-mono">{item.sku}</p>}
                            </div>
                        </div>
                        {item.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{item.description}</p>}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-2">
                                {item.category && (
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Tag size={10} />{item.category}
                                    </span>
                                )}
                                <span className="text-xs text-gray-400">IVA {item.vatPct ?? 21}%</span>
                            </div>
                            <span className="font-bold text-gray-800">{fmt(item.price)}</span>
                        </div>
                    </Card>
                ))}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    <Package size={48} className="mx-auto mb-4 opacity-20" />
                    <p>{search ? 'Sin resultados' : 'No hay artículos en el catálogo.'}</p>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Editar Artículo' : 'Nuevo Artículo'}>
                <form key={editingItem?.id ?? 'new'} onSubmit={handleSave} className="space-y-4 pt-2">
                    <Input name="name" label="Nombre" defaultValue={editingItem?.name} required />
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="sku" label="SKU / Referencia" defaultValue={editingItem?.sku} />
                        <Input name="category" label="Categoría" defaultValue={editingItem?.category} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Descripción</label>
                        <textarea name="description" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mt-1 h-20 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 resize-none" defaultValue={editingItem?.description}></textarea>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <Input name="price" label="Precio (€)" type="number" step="0.01" defaultValue={editingItem?.price?.toString()} required />
                        <Input name="vatPct" label="IVA (%)" type="number" defaultValue={(editingItem?.vatPct ?? 21).toString()} />
                        <Input name="unit" label="Unidad" defaultValue={editingItem?.unit || 'ud.'} />
                    </div>
                    <div className="pt-4 flex justify-end space-x-2">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button type="submit">{editingItem ? 'Guardar Cambios' : 'Crear Artículo'}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
