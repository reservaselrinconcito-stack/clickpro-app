import React, { useState } from 'react';
import { useQuery } from '@/core/db-adapter/useQuery';
import { inboxApi } from '@/core/adapter-api';
import { Mail, Plus, Trash2, Edit3, Copy } from 'lucide-react';
import { Button, Card, notify } from '../../components/UI';
import { EmailTemplate } from '../../types';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

export const EmailTemplatesSettings = () => {
    const templates = useQuery(() => inboxApi.emailTemplates.all(), [], ['email_templates']) || [];
    const navigate = useNavigate();

    const handleCreateNew = async () => {
        const newTemplate: Partial<EmailTemplate> = {
            id: uuidv4(),
            name: 'Nueva Plantilla',
            subject: 'Sin asunto',
            bodyHtml: '',
            bodyText: '',
            blocks: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        try {
            await inboxApi.emailTemplates.add(newTemplate as EmailTemplate);
            notify('Plantilla creada. Redirigiendo al editor...', 'success');
            navigate(`/settings/email-templates/${newTemplate.id}`);
        } catch (error) {
            notify('Error al crear la plantilla', 'error');
        }
    };

    const handleEdit = (id: string) => navigate(`/settings/email-templates/${id}`);

    const handleDuplicate = async (tpl: EmailTemplate) => {
        try {
            await inboxApi.emailTemplates.add({
                ...tpl, id: uuidv4(), name: `${tpl.name} (Copia)`,
            });
            notify('Plantilla duplicada', 'success');
        } catch (error) {
            notify('Error al duplicar', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('¿Eliminar esta plantilla?')) {
            await inboxApi.emailTemplates.delete(id);
            notify('Plantilla eliminada', 'success');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Plantillas de Email</h1>
                    <p className="text-sm text-gray-500">Crea y gestiona tus diseños profesionales para comunicaciones.</p>
                </div>
                <Button onClick={handleCreateNew}><Plus size={18} className="mr-2" /> Nueva Plantilla</Button>
            </div>

            <Card className="overflow-hidden border-gray-100">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Nombre</th>
                                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {templates.map((tpl) => (
                                <tr key={tpl.id} className="hover:bg-gray-50/50 group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg mr-4"><Mail size={18} /></div>
                                            <div>
                                                <div className="font-bold text-gray-800">{tpl.name}</div>
                                                <div className="text-xs text-gray-400 italic">{tpl.subject}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button onClick={() => handleEdit(tpl.id)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Editar"><Edit3 size={16} /></button>
                                            <button onClick={() => handleDuplicate(tpl)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Duplicar"><Copy size={16} /></button>
                                            <button onClick={() => handleDelete(tpl.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {templates.length === 0 && (
                    <div className="py-20 text-center">
                        <Mail size={32} className="mx-auto text-gray-300 mb-4" />
                        <h3 className="font-bold text-gray-800 mb-1">Sin plantillas</h3>
                        <Button variant="ghost" className="text-blue-600 mt-4" onClick={handleCreateNew}>Crear mi primera plantilla</Button>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default EmailTemplatesSettings;
