import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useQuery } from '@/core/db-adapter/useQuery';
import { settingsApi } from '@/core/adapter-api';
import { Button, Input, Card, Select, notify } from '../../components/UI';
import { Save, Building, Mail, CreditCard, MessageSquare, Database, Globe, MapPin, Instagram, Twitter, Linkedin, Facebook, Upload, X, Image, Phone, Info } from 'lucide-react';
import { IS_TAURI, IS_WEB, MODE_LABEL } from '@/core/environment';
import { APP_VERSION, BUILD_DATE, SCHEMA_VERSION } from '@/version';
// Phase 3: DesktopBackup has static @tauri-apps/* imports — lazy so it never
// enters the web bundle. IS_TAURI=false at build time → this call is DCE'd.
const DesktopBackup = IS_TAURI
  ? lazy(() => import('@/components/DesktopBackup').then(m => ({ default: m.DesktopBackup })))
  : null;

const Settings = () => {
    const settingsRaw = useQuery(() => settingsApi.get(), [], ['settings']);
    const settings = settingsRaw ?? {};
    const [activeTab, setActiveTab] = useState('company');
    const [logoPreview, setLogoPreview] = useState<string>('');
    const logoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if ((settings as any)?.logoBase64) {
            setLogoPreview((settings as any).logoBase64);
        }
    }, [(settings as any)?.logoBase64]);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 500 * 1024) { notify('El logo no puede superar 500KB', 'error'); return; }
        const reader = new FileReader();
        reader.onload = () => setLogoPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const updates: any = {};
        for (const [key, value] of formData.entries()) updates[key] = value;
        updates.logoBase64 = logoPreview;
        try {
            await settingsApi.save(updates);
            notify('Configuración guardada correctamente', 'success');
        } catch {
            notify('Error al guardar la configuración', 'error');
        }
    };

    const getSetting = (key: string) => (settings as any)[key] || '';

    const tabs = [
        { id: 'company', label: 'Empresa', icon: Building },
        { id: 'contact', label: 'Contacto y Presencia', icon: MapPin },
        { id: 'billing', label: 'Facturación', icon: CreditCard },
        { id: 'communications', label: 'Email / WhatsApp', icon: MessageSquare },
        { id: 'system', label: 'Sistema y Backups', icon: Database },
    ];

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Configuración</h1>
                <p className="text-gray-500">Administra los detalles de tu negocio y la aplicación.</p>
            </div>
            <div className="flex flex-col md:flex-row gap-8">
                <Card className="w-full md:w-64 h-fit p-2 sticky top-8">
                    <nav className="space-y-1">
                        {tabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                                <tab.icon size={18} /><span>{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </Card>
                <div className="flex-1">
                    {/* All tabs except system use the form */}
                    {activeTab !== 'system' ? (
                        <form onSubmit={handleSave} className="space-y-6">
                            {activeTab === 'company' && (
                                <Card className="p-6 space-y-6">
                                    <h2 className="text-lg font-bold text-gray-800 pb-4 border-b border-gray-100 flex items-center gap-2">
                                        <Building size={20} className="text-blue-500" /> Datos de la Empresa
                                    </h2>
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Logo</h3>
                                        <div className="flex items-start gap-4">
                                            <div className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center bg-gray-50 overflow-hidden flex-shrink-0">
                                                {logoPreview ? (
                                                    <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                                                ) : (
                                                    <Image size={28} className="text-gray-300" />
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-xs text-gray-500">Aparecerá en facturas y comunicaciones. PNG/SVG recomendado. Máx. 500KB.</p>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => logoInputRef.current?.click()}
                                                        className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-colors">
                                                        <Upload size={12} /> Subir logo
                                                    </button>
                                                    {logoPreview && (
                                                        <button type="button" onClick={() => setLogoPreview('')}
                                                            className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 flex items-center gap-1.5 transition-colors">
                                                            <X size={12} /> Quitar
                                                        </button>
                                                    )}
                                                </div>
                                                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-gray-50">
                                        <Input name="companyName" label="Nombre Comercial" defaultValue={getSetting('companyName')} placeholder="Ej: Mi Empresa S.L." />
                                        <Input name="legalName" label="Razón Social" defaultValue={getSetting('legalName')} placeholder="Ej: Mi Empresa Sociedad Limitada" />
                                        <Input name="nif" label="NIF / CIF" defaultValue={getSetting('nif')} placeholder="B-12345678" />
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Dirección Fiscal</h3>
                                        <Input name="address" label="Dirección" defaultValue={getSetting('address')} placeholder="Calle Principal, 123" />
                                        <div className="grid grid-cols-3 gap-4">
                                            <Input name="zip" label="CP" defaultValue={getSetting('zip')} placeholder="28001" />
                                            <Input name="city" label="Ciudad" defaultValue={getSetting('city')} className="col-span-2" placeholder="Madrid" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <Input name="province" label="Provincia" defaultValue={getSetting('province')} placeholder="Madrid" />
                                            <Input name="country" label="País" defaultValue={getSetting('country')} placeholder="España" />
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {activeTab === 'contact' && (
                                <Card className="p-6 space-y-6">
                                    <h2 className="text-lg font-bold text-gray-800 pb-4 border-b border-gray-100 flex items-center gap-2">
                                        <MapPin size={20} className="text-orange-500" /> Contacto y Presencia
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <Input name="email" label="Email de Contacto" type="email" defaultValue={getSetting('email')} placeholder="info@miempresa.com" />
                                        <Input name="phone" label="Teléfono" defaultValue={getSetting('phone')} placeholder="+34 600 000 000" />
                                        <Input name="website" label="Sitio Web" defaultValue={getSetting('website')} placeholder="https://www.miempresa.com" />
                                    </div>
                                    <div className="space-y-4 pt-4 border-t border-gray-100">
                                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Redes Sociales</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {[
                                                { name: 'socialInstagram', label: 'Instagram', placeholder: '@tuempresa', Icon: Instagram, bg: 'bg-pink-50', color: 'text-pink-600' },
                                                { name: 'socialLinkedin', label: 'LinkedIn', placeholder: 'empresa', Icon: Linkedin, bg: 'bg-blue-50', color: 'text-blue-700' },
                                                { name: 'socialTwitter', label: 'X / Twitter', placeholder: '@empresa', Icon: Twitter, bg: 'bg-sky-50', color: 'text-sky-500' },
                                                { name: 'socialFacebook', label: 'Facebook', placeholder: 'empresa', Icon: Facebook, bg: 'bg-blue-50', color: 'text-blue-600' },
                                            ].map(({ name, label, placeholder, Icon, bg, color }) => (
                                                <div key={name} className="flex items-end gap-2">
                                                    <div className={`p-2 ${bg} rounded-lg flex-shrink-0 mb-1.5`}><Icon size={16} className={color} /></div>
                                                    <Input name={name} label={label} placeholder={placeholder} defaultValue={getSetting(name)} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {activeTab === 'billing' && (
                                <Card className="p-6 space-y-6">
                                    <h2 className="text-lg font-bold text-gray-800 pb-4 border-b border-gray-100 flex items-center gap-2">
                                        <CreditCard size={20} className="text-green-500" /> Datos de Facturación
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <Input name="defaultVat" label="IVA por defecto (%)" type="number" defaultValue={getSetting('defaultVat')} />
                                        <Input name="currency" label="Moneda" defaultValue={getSetting('currency') || 'EUR'} disabled />
                                        <Input name="bankName" label="Nombre del Banco" defaultValue={getSetting('bankName')} placeholder="Banco Ejemplo" />
                                        <Input name="iban" label="IBAN" defaultValue={getSetting('iban')} placeholder="ES00 0000 0000 0000 0000 0000" />
                                        <Input name="swift" label="SWIFT / BIC" defaultValue={getSetting('swift')} placeholder="BANCESMMXXX" />
                                    </div>
                                    <div className="pt-4">
                                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">Términos y Condiciones</h3>
                                        <textarea name="legalTerms"
                                            className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                                            placeholder="Términos que aparecerán al pie de las facturas..."
                                            defaultValue={getSetting('legalTerms')}></textarea>
                                    </div>
                                    <div className="pt-4 border-t border-gray-100 space-y-4">
                                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Numeración</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <Input name="invoicePrefix" label="Prefijo Facturas" defaultValue={getSetting('invoicePrefix') || 'FAC'} placeholder="FAC" />
                                            <Input name="quotePrefix" label="Prefijo Presupuestos" defaultValue={getSetting('quotePrefix') || 'PRE'} placeholder="PRE" />
                                            <div className="flex flex-col space-y-1.5">
                                                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Tipo numeración</label>
                                                <select name="numberingType" defaultValue={getSetting('numberingType') || 'yearly'}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none appearance-none">
                                                    <option value="yearly">Anual (reinicia)</option>
                                                    <option value="continuous">Continua</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {activeTab === 'communications' && (
                                <div className="space-y-6">
                                    <Card className="p-6 space-y-5">
                                        <h2 className="text-lg font-bold text-gray-800 pb-4 border-b border-gray-100 flex items-center gap-2">
                                            <Mail size={20} className="text-blue-500" /> Email
                                        </h2>
                                        <p className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                            Estos datos pre-rellenan el cuerpo al enviar desde facturas o presupuestos.
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <Input name="emailSenderName" label="Nombre del remitente" defaultValue={getSetting('emailSenderName')} placeholder="Mi Empresa S.L." />
                                            <Input name="emailSenderAddress" label="Email de envío" type="email" defaultValue={getSetting('emailSenderAddress')} placeholder="facturas@miempresa.com" />
                                            <Input name="emailReplyTo" label="Reply-To" type="email" defaultValue={getSetting('emailReplyTo')} placeholder="info@miempresa.com" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Firma por defecto</h3>
                                            <textarea name="emailSignature"
                                                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                                                placeholder={"Un saludo,\nEl equipo de Mi Empresa"}
                                                defaultValue={getSetting('emailSignature')}></textarea>
                                        </div>
                                    </Card>
                                    <Card className="p-6 space-y-5">
                                        <h2 className="text-lg font-bold text-gray-800 pb-4 border-b border-gray-100 flex items-center gap-2">
                                            <Phone size={20} className="text-green-500" /> WhatsApp
                                        </h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <Input name="whatsappNumber" label="Número WhatsApp Business" defaultValue={getSetting('whatsappNumber')} placeholder="+34 600 000 000" />
                                            <div className="flex flex-col space-y-1.5">
                                                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Apertura de links</label>
                                                <select name="whatsappLinkTarget" defaultValue={getSetting('whatsappLinkTarget') || 'web'}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none appearance-none">
                                                    <option value="web">web.whatsapp.com (escritorio)</option>
                                                    <option value="app">wa.me (app móvil)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Mensaje de factura por defecto</h3>
                                            <textarea name="whatsappInvoiceTemplate"
                                                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none resize-none font-mono"
                                                placeholder={"Hola {{nombre}}, te adjunto la factura {{numero}} por {{total}}."}
                                                defaultValue={getSetting('whatsappInvoiceTemplate')}></textarea>
                                            <p className="text-xs text-gray-400 mt-1">Variables: {'{{nombre}} {{numero}} {{total}} {{empresa}}'}</p>
                                        </div>
                                    </Card>
                                </div>
                            )}

                            <div className="flex justify-end pt-4">
                                <Button type="submit" size="lg">
                                    <Save size={18} className="mr-2" /> Guardar Configuración
                                </Button>
                            </div>
                        </form>
                    ) : (
                        // System tab — no form needed
                        <Card className="p-6 space-y-6">
                            <h2 className="text-lg font-bold text-gray-800 pb-4 border-b border-gray-100 flex items-center gap-2">
                                <Database size={20} className="text-slate-500" /> Sistema y Copias de Seguridad
                            </h2>
                            {IS_TAURI && DesktopBackup ? (
                                <Suspense fallback={<div className="text-sm text-gray-400">Cargando…</div>}>
                                    <DesktopBackup />
                                </Suspense>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-600">Copias de seguridad e importaciones en el asistente dedicado.</p>
                                    <Button onClick={() => window.location.href = '/import'} variant="secondary">
                                        Ir al Asistente de Importación / Exportación
                                    </Button>
                                </div>
                            )}

                            {/* Version info card */}
                            <div className="mt-6 pt-6 border-t border-gray-100">
                                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Info size={15} className="text-gray-400" />
                                    Información de versión
                                </h3>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    {[
                                        { label: 'Versión',      value: `v${APP_VERSION}` },
                                        { label: 'Modo',         value: MODE_LABEL },
                                        { label: 'Compilado',    value: BUILD_DATE },
                                        { label: 'Esquema DB',   value: `v${SCHEMA_VERSION}` },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                                            <p className="text-gray-400 mb-0.5">{label}</p>
                                            <p className="font-mono font-semibold text-gray-700">{value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Settings;
