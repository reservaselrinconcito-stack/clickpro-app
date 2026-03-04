/**
 * WebEditorPage.tsx — Vertical: Peluquería
 *
 * No-code web editor for the business's public website.
 * - Edit text, contact info, hours
 * - Toggle sections on/off
 * - Photo gallery management
 * - Template picker (3 styles)
 * - Live preview (iframe with generated HTML)
 * - Publish to Cloudflare Pages
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe, Eye, Save, Upload, Image, Clock, Phone, Mail,
  MapPin, MessageSquare, ToggleLeft, ToggleRight, Layout,
  CheckCircle, ExternalLink, Loader, ChevronDown, ChevronUp,
  Trash2, Plus, X
} from 'lucide-react';
import type { WebConfig, WebPhoto, WebTemplate } from '../models';
import {
  getWebConfig, saveWebConfig, addPhoto, removePhoto,
  markAsPublished, generateWebsiteHTML
} from '../services/web-config-service';
import { getHairServices } from '../services/professional-service';

// ─── Template options ─────────────────────────────────────────────────────────

const TEMPLATES: { id: WebTemplate; name: string; description: string; preview: string }[] = [
  { id: 'moderna',     name: 'Moderna',     description: 'Degradados suaves, muy visual', preview: '#6366f1' },
  { id: 'clasica',     name: 'Clásica',     description: 'Elegante y sobria',              preview: '#92400e' },
  { id: 'minimalista', name: 'Minimalista', description: 'Limpia y directa',               preview: '#374151' },
];

// ─── Section config ───────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  hero:     'Cabecera principal',
  services: 'Servicios',
  gallery:  'Galería de fotos',
  team:     'Equipo / profesionales',
  contact:  'Contacto y ubicación',
  booking:  'Botón de reserva',
};

// ─── Editable field ───────────────────────────────────────────────────────────

function Field({ label, icon, value, onChange, type = 'text', placeholder }: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
          focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
      />
    </div>
  );
}

function TextArea({ label, icon, value, onChange, placeholder }: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none
          focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
      />
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Collapsible({ title, children, defaultOpen = true }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-50 hover:bg-gray-100"
      >
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WebEditorPage() {
  const [config, setConfig] = useState<WebConfig | null>(null);
  const [services, setServices] = useState<{ name: string; price: number; durationMinutes: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Cloudflare deploy config
  const [cloudflareProjectName, setCloudflareProjectName] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [showDeployPanel, setShowDeployPanel] = useState(false);

  const load = useCallback(async () => {
    const [cfg, svcs] = await Promise.all([
      getWebConfig(),
      getHairServices(),
    ]);
    setConfig(cfg);
    setServices(svcs);
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateConfig(partial: Partial<WebConfig>) {
    setConfig(c => c ? { ...c, ...partial, isDraft: true } : c);
    setSaved(false);
  }

  function updateSection(sectionId: keyof WebConfig['sections'], visible: boolean) {
    if (!config) return;
    setConfig(c => c ? {
      ...c,
      sections: { ...c.sections, [sectionId]: { ...c.sections[sectionId], visible } },
      isDraft: true
    } : c);
    setSaved(false);
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      await saveWebConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    if (!config) return;
    await handleSave();
    const html = generateWebsiteHTML(config, services);
    setPreviewHtml(html);
    setShowPreview(true);
  }

  async function handlePhotoAdd() {
    const url = prompt('URL de la imagen (o sube la imagen a tu servidor):\n\nEjemplo: https://images.unsplash.com/...', '');
    if (!url?.trim()) return;
    const newCfg = await addPhoto({ url: url.trim(), sortOrder: 0 });
    setConfig(newCfg);
  }

  async function handlePhotoRemove(photoId: string) {
    const newCfg = await removePhoto(photoId);
    setConfig(newCfg);
  }

  async function handlePublish() {
    if (!config || !cloudflareProjectName) {
      alert('Introduce el nombre del proyecto en Cloudflare Pages');
      return;
    }
    setPublishing(true);
    try {
      const html = generateWebsiteHTML(config, services);
      const url = `https://${cloudflareProjectName}.pages.dev`;

      // In a real implementation, this would call Cloudflare's API to deploy
      // For now: download the HTML file so the user can deploy manually
      const blob = new Blob([html], { type: 'text/html' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'index.html';
      link.click();

      const finalUrl = customDomain || url;
      const updatedCfg = await markAsPublished(finalUrl);
      setConfig(updatedCfg);
      alert(`Web generada.\n\nDeploying to: ${url}\n\nConsulta docs/WEB_DEPLOY.md para el proceso completo.`);
    } finally {
      setPublishing(false);
    }
  }

  if (!config) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-gray-400">Cargando editor…</div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Left: editor panel ────────────────────────────────────────────── */}
      <div className="w-96 shrink-0 overflow-y-auto bg-white border-r border-gray-200">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2 z-10">
          <Globe size={18} className="text-indigo-600" />
          <h2 className="font-semibold text-gray-900 flex-1">Editor Web</h2>
          {config.isDraft && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Borrador</span>
          )}
          {config.publishedUrl && (
            <a href={config.publishedUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              Ver web <ExternalLink size={11} />
            </a>
          )}
        </div>

        <div className="p-4 space-y-4">

          {/* ── Business info ────────────────────────────────────────────── */}
          <Collapsible title="Información del negocio">
            <Field label="Nombre del negocio" icon={<Globe size={12} />}
              value={config.businessName ?? ''} onChange={v => updateConfig({ businessName: v })}
              placeholder="Mi Peluquería" />
            <Field label="Tagline / eslogan" icon={<Globe size={12} />}
              value={config.tagline ?? ''} onChange={v => updateConfig({ tagline: v })}
              placeholder="Tu peluquería de confianza" />
            <TextArea label="Descripción" icon={<Globe size={12} />}
              value={config.description ?? ''} onChange={v => updateConfig({ description: v })}
              placeholder="Breve descripción de tu negocio…" />
          </Collapsible>

          {/* ── Contact ──────────────────────────────────────────────────── */}
          <Collapsible title="Contacto y ubicación">
            <Field label="Teléfono" icon={<Phone size={12} />}
              value={config.phone ?? ''} onChange={v => updateConfig({ phone: v })}
              type="tel" placeholder="+34 900 000 000" />
            <Field label="Email" icon={<Mail size={12} />}
              value={config.email ?? ''} onChange={v => updateConfig({ email: v })}
              type="email" placeholder="info@mipeluqueria.com" />
            <Field label="Dirección" icon={<MapPin size={12} />}
              value={config.address ?? ''} onChange={v => updateConfig({ address: v })}
              placeholder="Calle Mayor 1, Madrid" />
            <Field label="WhatsApp (número sin espacios)" icon={<MessageSquare size={12} />}
              value={config.whatsapp ?? ''} onChange={v => updateConfig({ whatsapp: v })}
              placeholder="34600000000" />
            <TextArea label="Horarios (texto libre)" icon={<Clock size={12} />}
              value={config.hoursText ?? ''} onChange={v => updateConfig({ hoursText: v })}
              placeholder="Lun–Vie 9:00–20:00&#10;Sáb 9:00–14:00&#10;Dom: Cerrado" />
          </Collapsible>

          {/* ── Sections ─────────────────────────────────────────────────── */}
          <Collapsible title="Secciones visibles">
            {(Object.keys(SECTION_LABELS) as Array<keyof typeof SECTION_LABELS>).map(key => (
              <div key={key} className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-700">{SECTION_LABELS[key]}</span>
                <button
                  onClick={() => updateSection(key as keyof WebConfig['sections'],
                    !config.sections[key as keyof WebConfig['sections']].visible)}
                  className="flex items-center gap-1 text-xs"
                >
                  {config.sections[key as keyof WebConfig['sections']].visible ? (
                    <ToggleRight size={22} className="text-indigo-600" />
                  ) : (
                    <ToggleLeft size={22} className="text-gray-300" />
                  )}
                </button>
              </div>
            ))}
          </Collapsible>

          {/* ── Template ─────────────────────────────────────────────────── */}
          <Collapsible title="Plantilla" defaultOpen={false}>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => updateConfig({ template: t.id })}
                  className={`rounded-xl overflow-hidden border-2 transition-all ${
                    config.template === t.id
                      ? 'border-indigo-500 shadow-md'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div
                    className="h-14 flex items-center justify-center"
                    style={{ backgroundColor: t.preview }}
                  >
                    <Layout size={24} className="text-white opacity-80" />
                  </div>
                  <div className="p-2 text-center">
                    <p className="text-xs font-semibold text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-400 leading-tight">{t.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </Collapsible>

          {/* ── Gallery ──────────────────────────────────────────────────── */}
          <Collapsible title={`Galería (${config.photos.length} fotos)`} defaultOpen={false}>
            <div className="grid grid-cols-3 gap-2">
              {config.photos.map(photo => (
                <div key={photo.id} className="relative group aspect-square">
                  <img
                    src={photo.url} alt={photo.caption ?? ''}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    onClick={() => handlePhotoRemove(photo.id)}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full
                      opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <button
                onClick={handlePhotoAdd}
                className="aspect-square border-2 border-dashed border-gray-200 rounded-lg
                  flex flex-col items-center justify-center gap-1 text-gray-400
                  hover:border-indigo-300 hover:text-indigo-400 transition-colors"
              >
                <Plus size={18} />
                <span className="text-xs">Añadir</span>
              </button>
            </div>
          </Collapsible>

          {/* ── SEO ──────────────────────────────────────────────────────── */}
          <Collapsible title="SEO" defaultOpen={false}>
            <Field label="Título de la página (meta title)" icon={<Globe size={12} />}
              value={config.metaTitle ?? ''} onChange={v => updateConfig({ metaTitle: v })}
              placeholder="Mi Peluquería — Madrid" />
            <TextArea label="Descripción SEO (meta description)" icon={<Globe size={12} />}
              value={config.metaDescription ?? ''} onChange={v => updateConfig({ metaDescription: v })}
              placeholder="Peluquería en Madrid. Cortes, tintes, mechas. Reserva tu cita online." />
          </Collapsible>

          {/* ── Deploy ───────────────────────────────────────────────────── */}
          <Collapsible title="Publicar web" defaultOpen={false}>
            <div className="space-y-3">
              {config.publishedUrl && (
                <div className="p-3 bg-green-50 rounded-xl">
                  <p className="text-xs text-green-700 font-medium mb-1">✓ Publicada en:</p>
                  <a href={config.publishedUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-green-600 hover:underline break-all flex items-center gap-1">
                    {config.publishedUrl} <ExternalLink size={11} />
                  </a>
                  {config.lastPublishedAt && (
                    <p className="text-xs text-green-600 mt-1">
                      Última vez: {new Date(config.lastPublishedAt).toLocaleDateString('es-ES')}
                    </p>
                  )}
                </div>
              )}

              {/* API URL — clave para que los formularios funcionen */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                  <Globe size={12} />
                  URL del Worker de reservas *
                </label>
                <input
                  type="url"
                  value={config.publicApiBaseUrl ?? ''}
                  onChange={e => updateConfig({ publicApiBaseUrl: e.target.value.trim() || undefined })}
                  placeholder="https://contigo-api.TU-CUENTA.workers.dev"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
                <p className="text-xs text-gray-400">
                  Necesaria para que los formularios de reserva y contacto funcionen.
                  {!config.publicApiBaseUrl && (
                    <span className="text-amber-600 font-medium"> ⚠ Sin esta URL, los formularios no aparecerán en la web.</span>
                  )}
                </p>
              </div>

              <Field label="Nombre proyecto Cloudflare Pages" icon={<Upload size={12} />}
                value={cloudflareProjectName} onChange={setCloudflareProjectName}
                placeholder="mipeluqueria" />
              <Field label="Dominio propio (opcional)" icon={<Globe size={12} />}
                value={customDomain} onChange={setCustomDomain}
                placeholder="www.mipeluqueria.com" />
              <p className="text-xs text-gray-400">
                Generará index.html listo para subir a Cloudflare Pages.
                Consulta <code>docs/WEB_DEPLOY.md</code> para instrucciones completas.
              </p>

              <button
                onClick={handlePublish}
                disabled={publishing}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600
                  text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {publishing ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />}
                {publishing ? 'Generando…' : 'Generar y publicar'}
              </button>
            </div>
          </Collapsible>
        </div>
      </div>

      {/* ── Right: preview ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Preview toolbar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 shrink-0">
          <span className="text-sm text-gray-500">Vista previa</span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={handlePreview}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
            >
              <Eye size={14} />
              Actualizar preview
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                saved
                  ? 'bg-green-100 text-green-700'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              } disabled:opacity-50`}
            >
              {saving ? <Loader size={14} className="animate-spin" /> :
               saved ? <CheckCircle size={14} /> : <Save size={14} />}
              {saved ? 'Guardado' : saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* iframe preview */}
        <div className="flex-1 bg-gray-100 p-4 overflow-auto">
          {showPreview ? (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden h-full">
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                className="w-full h-full border-0"
                title="Vista previa de la web"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Globe size={48} className="text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 mb-3">Haz clic en "Actualizar preview"</p>
                <p className="text-sm text-gray-300">para ver cómo quedará tu web</p>
                <button
                  onClick={handlePreview}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 mx-auto"
                >
                  <Eye size={16} />
                  Ver preview
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
