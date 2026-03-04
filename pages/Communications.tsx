import React, { useState, useMemo } from 'react';
import { useQuery } from '@/core/db-adapter/useQuery';
import { communicationsApi, contactsApi, settingsApi } from '@/core/adapter-api';
import { Communication, Contact } from '../types';
import {
  Mail, MessageSquare, Send, Plus, Trash2,
  Filter, Search, CheckCircle, Clock, AlertCircle,
  ExternalLink, Phone, User, ChevronDown, Inbox, Edit3
} from 'lucide-react';
import { Card, Button, Input, Modal, Badge, Select, notify } from '../components/UI';
import { v4 as uuidv4 } from 'uuid';

type FilterType = 'all' | 'email' | 'whatsapp';
type StatusFilter = 'all' | 'draft' | 'pending' | 'sent';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'gray' },
  pending: { label: 'Pendiente', color: 'yellow' },
  sent: { label: 'Enviado', color: 'green' },
};

const WHATSAPP_VARS: Record<string, (contact: Contact, settings: any) => string> = {
  '{{nombre}}': (c) => c.name || '',
  '{{empresa}}': (_, s) => s?.companyName || '',
};

function buildWhatsAppUrl(phone: string, message: string, target: 'web' | 'app' = 'web'): string {
  const clean = phone.replace(/\D/g, '');
  const encoded = encodeURIComponent(message);
  return target === 'web'
    ? `https://web.whatsapp.com/send?phone=${clean}&text=${encoded}`
    : `https://wa.me/${clean}?text=${encoded}`;
}

function buildMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const CommunicationsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingComm, setEditingComm] = useState<Partial<Communication> | null>(null);
  const [selectedContactId, setSelectedContactId] = useState('');

  const settings = useQuery(() => settingsApi.get(), [], ['settings']);
  const allContacts = useQuery(() => contactsApi.all(), [], ['contacts']);

  const communicationsList = useQuery(() => communicationsApi.all(), [], ['communications']);

  const filtered = useMemo(() => {
    if (!communicationsList) return [];
    return communicationsList.filter(c => {
      if (filterType !== 'all' && c.type !== filterType) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (searchTerm) {
        const contact = allContacts?.find(x => x.id === c.contactId);
        const search = searchTerm.toLowerCase();
        if (
          !contact?.name.toLowerCase().includes(search) &&
          !c.subject?.toLowerCase().includes(search) &&
          !c.content?.toLowerCase().includes(search)
        ) return false;
      }
      return true;
    });
  }, [communicationsList, filterType, filterStatus, searchTerm, allContacts]);

  const openNew = () => {
    setEditingComm({ type: 'email', subject: '', content: '', status: 'draft' });
    setSelectedContactId('');
    setIsModalOpen(true);
  };

  const openEdit = (comm: Communication) => {
    setEditingComm({ ...comm });
    setSelectedContactId(comm.contactId);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedContactId || !editingComm?.content) {
      notify('Selecciona un contacto y escribe el mensaje', 'error');
      return;
    }
    const contact = allContacts?.find(c => c.id === selectedContactId);
    if (editingComm?.id) {
      await communicationsApi.update(editingComm.id, { ...editingComm, contactId: selectedContactId });
      notify('Borrador actualizado', 'success');
    } else {
      await communicationsApi.add({
        ...editingComm,
        id: uuidv4(),
        contactId: selectedContactId,
        status: 'draft',
        date: Date.now(),
      } as any);
      notify('Borrador creado', 'success');
    }
    setIsModalOpen(false);
    setEditingComm(null);
  };

  const handleSend = (comm: Communication) => {
    const contact = allContacts?.find(c => c.id === comm.contactId);
    if (!contact) return;

    if (comm.type === 'email') {
      if (!contact.email) { notify('Este contacto no tiene email', 'error'); return; }
      window.location.href = buildMailtoUrl(
        contact.email,
        comm.subject || settings?.companyName || '',
        comm.content + (settings?.emailSignature ? '\n\n' + settings.emailSignature : '')
      );
    } else {
      const phone = contact.phone;
      if (!phone) { notify('Este contacto no tiene teléfono', 'error'); return; }
      let msg = comm.content;
      // Replace template vars
      Object.entries(WHATSAPP_VARS).forEach(([key, fn]) => {
        msg = msg.replace(key, fn(contact, settings));
      });
      const target = (settings as any)?.whatsappLinkTarget || 'web';
      window.open(buildWhatsAppUrl(phone, msg, target), '_blank');
    }
    communicationsApi.update(comm.id, { status: 'pending' });
    notify('Abre la app y confirma el envío', 'info');
  };

  const handleMarkSent = (id: string) => {
    communicationsApi.update(id, { status: 'sent' });
    notify('Marcado como enviado ✓', 'success');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    await communicationsApi.delete(id);
  };

  const getContactName = (id: string) => allContacts?.find(c => c.id === id)?.name || '—';
  const getContact = (id: string) => allContacts?.find(c => c.id === id);

  // Fill template from settings
  const applyDefaultTemplate = (type: 'email' | 'whatsapp') => {
    if (type === 'whatsapp' && (settings as any)?.whatsappInvoiceTemplate) {
      setEditingComm(prev => ({ ...prev, content: (settings as any).whatsappInvoiceTemplate }));
    }
    if (type === 'email' && (settings as any)?.emailSignature) {
      setEditingComm(prev => ({ ...prev, content: '\n\n' + (settings as any).emailSignature }));
    }
  };

  const counts = useMemo(() => ({
    total: communicationsList?.length || 0,
    draft: communicationsList?.filter(c => c.status === 'draft').length || 0,
    pending: communicationsList?.filter(c => c.status === 'pending').length || 0,
    sent: communicationsList?.filter(c => c.status === 'sent').length || 0,
  }), [communicationsList]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Buzón Unificado</h1>
          <p className="text-sm text-gray-500">Email y WhatsApp en un solo lugar</p>
        </div>
        <Button onClick={openNew}>
          <Plus size={16} className="mr-1.5" /> Nueva Comunicación
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Borradores', value: counts.draft, color: 'text-gray-600', bg: 'bg-gray-50', filter: 'draft' as StatusFilter },
          { label: 'Pendientes', value: counts.pending, color: 'text-amber-600', bg: 'bg-amber-50', filter: 'pending' as StatusFilter },
          { label: 'Enviados', value: counts.sent, color: 'text-green-600', bg: 'bg-green-50', filter: 'sent' as StatusFilter },
        ].map(({ label, value, color, bg, filter }) => (
          <button key={filter} onClick={() => setFilterStatus(filterStatus === filter ? 'all' : filter)}
            className={`${bg} rounded-xl p-3 text-center transition-all border-2 ${filterStatus === filter ? 'border-gray-400' : 'border-transparent'} hover:border-gray-300`}>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input
            placeholder="Buscar por contacto o mensaje..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-100"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value as FilterType)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700 outline-none">
          <option value="all">Todos los canales</option>
          <option value="email">📧 Email</option>
          <option value="whatsapp">💬 WhatsApp</option>
        </select>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((comm) => {
          const contact = getContact(comm.contactId);
          return (
            <Card key={comm.id} className="p-4 group hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl flex-shrink-0 ${comm.type === 'email' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                  {comm.type === 'email' ? <Mail size={18} /> : <MessageSquare size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-800 text-sm">{getContactName(comm.contactId)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${comm.status === 'sent' ? 'bg-green-50 text-green-700' :
                        comm.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[comm.status]?.label || comm.status}
                    </span>
                    {comm.type === 'email' && contact?.email && (
                      <span className="text-xs text-gray-400">{contact.email}</span>
                    )}
                    {comm.type === 'whatsapp' && contact?.phone && (
                      <span className="text-xs text-gray-400">{contact.phone}</span>
                    )}
                  </div>
                  {comm.type === 'email' && comm.subject && (
                    <p className="text-sm font-medium text-gray-700 mt-0.5 truncate">{comm.subject}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{comm.content}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    <Clock size={11} className="inline mr-1" />
                    {new Date(comm.date).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {comm.status !== 'sent' && (
                    <>
                      <button onClick={() => handleSend(comm)} title="Abrir en app"
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <ExternalLink size={15} />
                      </button>
                      <button onClick={() => handleMarkSent(comm.id)} title="Marcar como enviado"
                        className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all">
                        <CheckCircle size={15} />
                      </button>
                    </>
                  )}
                  <button onClick={() => openEdit(comm)} title="Editar"
                    className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all">
                    <Edit3 size={15} />
                  </button>
                  <button onClick={() => handleDelete(comm.id)} title="Eliminar"
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <Inbox className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-gray-400">
              {searchTerm || filterType !== 'all' || filterStatus !== 'all' ? 'Sin resultados' : 'Buzón vacío'}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {searchTerm ? 'Prueba con otra búsqueda' : 'Crea tu primera comunicación con un cliente'}
            </p>
            {!searchTerm && <Button onClick={openNew} variant="ghost">Crear comunicación</Button>}
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
        title={editingComm?.id ? 'Editar Comunicación' : 'Nueva Comunicación'} maxWidth="max-w-lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Canal</label>
              <select
                value={editingComm?.type || 'email'}
                onChange={(e) => {
                  const type = e.target.value as 'email' | 'whatsapp';
                  setEditingComm(prev => ({ ...prev, type, content: '' }));
                  applyDefaultTemplate(type);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white outline-none">
                <option value="email">📧 Email</option>
                <option value="whatsapp">💬 WhatsApp</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">Contacto</label>
              <select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white outline-none">
                <option value="">Seleccionar...</option>
                {allContacts?.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type === 'client' ? 'Cliente' : 'Prov'})</option>
                ))}
              </select>
            </div>
          </div>

          {selectedContactId && (() => {
            const contact = allContacts?.find(c => c.id === selectedContactId);
            if (!contact) return null;
            return (
              <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2
                ${editingComm?.type === 'email' && !contact.email ? 'bg-red-50 text-red-700' :
                  editingComm?.type === 'whatsapp' && !contact.phone ? 'bg-red-50 text-red-700' :
                  'bg-blue-50 text-blue-700'}`}>
                {editingComm?.type === 'email' ? <Mail size={13} /> : <Phone size={13} />}
                {editingComm?.type === 'email'
                  ? (contact.email || '⚠ Este contacto no tiene email')
                  : (contact.phone || '⚠ Este contacto no tiene teléfono')}
              </div>
            );
          })()}

          {editingComm?.type === 'email' && (
            <Input label="Asunto" placeholder="Ej: Factura pendiente #123"
              value={editingComm.subject || ''}
              onChange={(e: any) => setEditingComm(prev => ({ ...prev, subject: e.target.value }))} />
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Mensaje</label>
              {editingComm?.type === 'whatsapp' && (settings as any)?.whatsappInvoiceTemplate && (
                <button onClick={() => applyDefaultTemplate('whatsapp')}
                  className="text-xs text-blue-600 hover:underline">Usar plantilla</button>
              )}
            </div>
            <textarea
              className="w-full h-36 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
              placeholder={editingComm?.type === 'whatsapp'
                ? 'Hola {{nombre}}, ...'
                : 'Escribe tu mensaje aquí...'}
              value={editingComm?.content || ''}
              onChange={(e) => setEditingComm(prev => ({ ...prev, content: e.target.value }))}
            />
            {editingComm?.type === 'whatsapp' && (
              <p className="text-xs text-gray-400 mt-1">Variables: {'{{nombre}} {{empresa}}'}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>
              {editingComm?.id ? 'Guardar cambios' : 'Crear borrador'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
