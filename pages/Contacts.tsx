import React, { useState } from 'react';
import { Contact, InboxThread } from '../types';
import { Button, Input, Modal, Card, Badge, notify } from '../components/UI';
import { Search, Plus, Mail, Phone, MapPin, Trash2, Edit3, User, Copy, Briefcase, MessageSquare } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@/core/db-adapter/useQuery';
import { contactsApi, inboxApi } from '@/core/adapter-api';

interface ContactsPageProps {
    type: 'client' | 'supplier';
}

export const ContactsPage = ({ type }: ContactsPageProps) => {
    const contacts = useQuery(() => contactsApi.byType(type), [type], ['contacts']) ?? [];
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const navigate = useNavigate();

    const handleSendMessage = async (contact: Contact) => {
        try {
            let thread = await inboxApi.threads.getByParty(contact.id);
            if (!thread) {
                const newThread: InboxThread = {
                    id: uuidv4(),
                    partyId: contact.id,
                    partyType: contact.type,
                    title: contact.name,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                await inboxApi.threads.upsert(newThread);
                thread = newThread;
            }
            navigate(`/communications?threadId=${thread.id}`);
        } catch {
            notify('Error al iniciar conversación', 'error');
        }
    };

    const isClient = type === 'client';
    const labelSingular = isClient ? 'Cliente' : 'Proveedor';
    const labelPlural = isClient ? 'Clientes' : 'Proveedores';

    const filtered = contacts.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(search.toLowerCase())
    );

    const handleEdit = (contact: Contact) => { setEditingContact(contact); setIsModalOpen(true); };
    const handleNew = () => { setEditingContact(null); setIsModalOpen(true); };

    const handleDuplicate = async (contact: Contact) => {
        await contactsApi.add({ ...contact, id: uuidv4(), name: `${contact.name} (Copia)`, createdAt: Date.now(), updatedAt: Date.now() });
        notify(`${labelSingular} duplicado con éxito`, 'success');
    };

    const handleDelete = async (id: string) => {
        if (confirm(`¿Eliminar este ${labelSingular.toLowerCase()}?`)) {
            await contactsApi.delete(id);
            notify(`${labelSingular} eliminado`, 'success');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const data: Partial<Contact> = {
            name: formData.get('name') as string,
            nif: formData.get('nif') as string,
            email: formData.get('email') as string,
            phone: formData.get('phone') as string,
            address: formData.get('address') as string,
            city: formData.get('city') as string,
            zip: formData.get('zip') as string,
            province: formData.get('province') as string,
            country: formData.get('country') as string,
            type,
            notes: formData.get('notes') as string,
            updatedAt: Date.now()
        };
        try {
            if (editingContact) {
                await contactsApi.update(editingContact.id, data);
                notify(`${labelSingular} actualizado`, 'success');
            } else {
                await contactsApi.add({ id: uuidv4(), createdAt: Date.now(), ...data } as Contact);
                notify(`${labelSingular} creado`, 'success');
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
                    <h1 className="text-2xl font-bold text-gray-800">{labelPlural}</h1>
                    <p className="text-gray-500">Gestiona tus {labelPlural.toLowerCase()}</p>
                </div>
                <Button onClick={handleNew}><Plus size={18} /> Nuevo {labelSingular}</Button>
            </div>

            <div className="flex space-x-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                        placeholder="Buscar por nombre, email..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map(contact => (
                    <Card key={contact.id} className="p-5 hover:shadow-md transition-shadow group relative border border-gray-200">
                        <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleSendMessage(contact)} className="text-green-600 hover:bg-green-50 p-1.5 rounded" title="Enviar Mensaje"><MessageSquare size={16} /></button>
                            <button onClick={() => handleDuplicate(contact)} className="text-gray-500 hover:text-blue-600 hover:bg-gray-50 p-1.5 rounded" title="Duplicar"><Copy size={16} /></button>
                            <button onClick={() => handleEdit(contact)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Editar"><Edit3 size={16} /></button>
                            <button onClick={() => handleDelete(contact.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Eliminar"><Trash2 size={16} /></button>
                        </div>
                        <div className="flex items-center mb-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mr-3 ${isClient ? 'bg-blue-500' : 'bg-orange-500'}`}>
                                {contact.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 truncate pr-6">{contact.name}</h3>
                                <Badge color={isClient ? 'blue' : 'orange'}>{labelSingular}</Badge>
                            </div>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600">
                            {contact.email && <div className="flex items-center"><Mail size={14} className="mr-2 text-gray-400" /> {contact.email}</div>}
                            {contact.phone && <div className="flex items-center"><Phone size={14} className="mr-2 text-gray-400" /> {contact.phone}</div>}
                            {contact.address && <div className="flex items-center"><MapPin size={14} className="mr-2 text-gray-400" /> {contact.address}, {contact.city}</div>}
                            <div className="flex items-center"><span className="font-mono text-xs bg-gray-100 px-1 rounded text-gray-500 ml-6">{contact.nif || 'Sin NIF'}</span></div>
                        </div>
                    </Card>
                ))}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    {isClient ? <User size={48} className="mx-auto mb-4 opacity-20" /> : <Briefcase size={48} className="mx-auto mb-4 opacity-20" />}
                    <p>No se encontraron {labelPlural.toLowerCase()}.</p>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingContact ? `Editar ${labelSingular}` : `Nuevo ${labelSingular}`}>
                <form key={editingContact ? editingContact.id : 'new'} onSubmit={handleSave} className="space-y-4">
                    <input type="hidden" name="type" value={type} />
                    <Input name="name" label="Nombre / Razón Social" defaultValue={editingContact?.name} required />
                    <Input name="nif" label="NIF / CIF" defaultValue={editingContact?.nif} />
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="email" label="Email" type="email" defaultValue={editingContact?.email} />
                        <Input name="phone" label="Teléfono" defaultValue={editingContact?.phone} />
                    </div>
                    <Input name="address" label="Dirección" defaultValue={editingContact?.address} />
                    <div className="grid grid-cols-3 gap-4">
                        <Input name="zip" label="Código Postal" defaultValue={editingContact?.zip} />
                        <div className="col-span-2"><Input name="city" label="Ciudad" defaultValue={editingContact?.city} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input name="province" label="Provincia" defaultValue={editingContact?.province} />
                        <Input name="country" label="País" defaultValue={editingContact?.country || 'España'} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Notas Internas</label>
                        <textarea name="notes" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mt-1 h-20 outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900" defaultValue={editingContact?.notes}></textarea>
                    </div>
                    <div className="pt-4 flex justify-end space-x-2">
                        <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button type="submit">{editingContact ? 'Guardar Cambios' : `Crear ${labelSingular}`}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
