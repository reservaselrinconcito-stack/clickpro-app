import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { inboxApi } from '@/core/adapter-api';
import { EmailTemplateEditor } from '../components/EmailTemplateEditor';
import { Button, Card, notify } from '../../components/UI';
import { Layout, ChevronLeft, AlertOctagon } from 'lucide-react';
import { EmailTemplate } from '../../types';

export const EmailTemplateEditorPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [template, setTemplate] = useState<EmailTemplate | null | undefined>(undefined);

    useEffect(() => {
        if (!id) { setTemplate(null); return; }
        inboxApi.emailTemplates.get(id).then(t => setTemplate(t ?? null));
    }, [id]);

    if (template === undefined) return null; // Loading

    if (!template) {
        return (
            <div className="p-12 flex flex-col items-center justify-center min-h-[60vh]">
                <Card className="p-8 max-w-md w-full text-center border-red-100 bg-red-50/10">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertOctagon size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2">Plantilla No Encontrada</h2>
                    <p className="text-sm text-gray-500 mb-6">
                        Lo sentimos, la plantilla que intentas editar no existe o ha sido eliminada.
                    </p>
                    <Button onClick={() => navigate('/settings/email-templates')} variant="ghost">
                        <ChevronLeft size={18} className="mr-2" /> Volver a la lista
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="px-8 py-4 border-b border-gray-100 flex justify-between items-center bg-white z-10">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => navigate('/settings/email-templates')}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold flex items-center">
                            <Layout size={18} className="mr-2 text-blue-600" />
                            {template.name}
                        </h1>
                        <p className="text-xs text-gray-400">Editor de Bloques Profesionales</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <EmailTemplateEditor
                    template={template}
                    onClose={() => navigate('/settings/email-templates')}
                    onSave={async (data) => {
                        try {
                            await inboxApi.emailTemplates.update(template.id, data);
                            notify('Plantilla guardada correctamente', 'success');
                            navigate('/settings/email-templates');
                        } catch {
                            notify('Error al guardar la plantilla', 'error');
                        }
                    }}
                />
            </div>
        </div>
    );
};

export default EmailTemplateEditorPage;
