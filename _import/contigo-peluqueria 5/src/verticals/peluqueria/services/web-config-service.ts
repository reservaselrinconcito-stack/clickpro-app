/**
 * web-config-service.ts — Vertical: Peluquería  (v2.4.1)
 *
 * Cambios en esta versión:
 * - WebConfig incluye publicApiBaseUrl (URL del Worker de reservas)
 * - rowToWebConfig y saveWebConfig persisten el nuevo campo
 * - generateWebsiteHTML incluye formularios reales con fetch al Worker
 *   (reserva y contacto) con validación frontend y mensajes de éxito/error
 * - URL del Worker no hardcodeada: sale de config.publicApiBaseUrl
 */

import { getDbAdapter } from '../../../tauri/db-adapter';
import type { WebConfig, WebPhoto, WebTemplate } from '../models';

// ─── Default config ────────────────────────────────────────────────────────────

const DEFAULT_SECTIONS: WebConfig['sections'] = {
  hero:     { id: 'hero',     visible: true },
  services: { id: 'services', visible: true },
  gallery:  { id: 'gallery',  visible: true },
  team:     { id: 'team',     visible: false },
  contact:  { id: 'contact',  visible: true },
  booking:  { id: 'booking',  visible: true },
};

function rowToWebConfig(r: Record<string, unknown>): WebConfig {
  return {
    id: r.id as string,
    businessName:    r.business_name as string | undefined,
    tagline:         r.tagline as string | undefined,
    description:     r.description as string | undefined,
    phone:           r.phone as string | undefined,
    email:           r.email as string | undefined,
    address:         r.address as string | undefined,
    whatsapp:        r.whatsapp as string | undefined,
    publicApiBaseUrl: r.public_api_base_url as string | undefined,
    hoursText:       r.hours_text as string | undefined,
    template:        (r.template as WebTemplate) ?? 'moderna',
    sections:        r.sections ? JSON.parse(r.sections as string) : DEFAULT_SECTIONS,
    photos:          r.photos ? JSON.parse(r.photos as string) : [],
    metaTitle:       r.meta_title as string | undefined,
    metaDescription: r.meta_description as string | undefined,
    publishedUrl:    r.published_url as string | undefined,
    lastPublishedAt: r.last_published_at as number | undefined,
    isDraft:         Boolean(r.is_draft),
    createdAt:       r.created_at as number,
    updatedAt:       r.updated_at as number,
  };
}

// ─── Read ──────────────────────────────────────────────────────────────────────

export async function getWebConfig(): Promise<WebConfig> {
  const db = getDbAdapter();

  try {
    const rows = await db.select<Record<string, unknown>>(
      "SELECT * FROM web_config WHERE id='main'"
    );
    if (rows.length) return rowToWebConfig(rows[0]);
  } catch { /* tabla no existe aún */ }

  // Pre-rellenar desde settings del core
  let companyName: string | undefined;
  let phone: string | undefined;
  let email: string | undefined;
  let address: string | undefined;

  try {
    const settingRows = await db.select<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key IN ('company_name','company_phone','company_email','company_address')"
    );
    const m: Record<string, string> = {};
    settingRows.forEach(r => { m[r.key] = r.value; });
    companyName = m['company_name'];
    phone       = m['company_phone'];
    email       = m['company_email'];
    address     = m['company_address'];
  } catch { /* ignore */ }

  const now = Date.now();
  return {
    id: 'main',
    businessName: companyName,
    phone,
    email,
    address,
    template: 'moderna',
    sections: DEFAULT_SECTIONS,
    photos: [],
    isDraft: true,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Write ─────────────────────────────────────────────────────────────────────

export async function saveWebConfig(config: Partial<Omit<WebConfig, 'id'>>): Promise<WebConfig> {
  const db = getDbAdapter();
  const existing = await getWebConfig();
  const merged: WebConfig = {
    ...existing,
    ...config,
    id: 'main',
    sections: config.sections ?? existing.sections,
    photos:   config.photos   ?? existing.photos,
    updatedAt: Date.now(),
  };

  await db.execute(
    `INSERT OR REPLACE INTO web_config (
      id, business_name, tagline, description, phone, email, address,
      whatsapp, public_api_base_url, hours_text, template, sections, photos,
      meta_title, meta_description, published_url, last_published_at,
      is_draft, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      'main',
      merged.businessName      ?? null,
      merged.tagline           ?? null,
      merged.description       ?? null,
      merged.phone             ?? null,
      merged.email             ?? null,
      merged.address           ?? null,
      merged.whatsapp          ?? null,
      merged.publicApiBaseUrl  ?? null,
      merged.hoursText         ?? null,
      merged.template,
      JSON.stringify(merged.sections),
      JSON.stringify(merged.photos),
      merged.metaTitle         ?? null,
      merged.metaDescription   ?? null,
      merged.publishedUrl      ?? null,
      merged.lastPublishedAt   ?? null,
      merged.isDraft ? 1 : 0,
      merged.createdAt,
      merged.updatedAt,
    ]
  );

  return merged;
}

export async function addPhoto(photo: Omit<WebPhoto, 'id'>): Promise<WebConfig> {
  const config = await getWebConfig();
  const newPhoto: WebPhoto = { id: `photo-${Date.now()}`, ...photo, sortOrder: config.photos.length };
  return saveWebConfig({ photos: [...config.photos, newPhoto] });
}

export async function removePhoto(photoId: string): Promise<WebConfig> {
  const config = await getWebConfig();
  return saveWebConfig({ photos: config.photos.filter(p => p.id !== photoId) });
}

export async function reorderPhotos(orderedIds: string[]): Promise<WebConfig> {
  const config = await getWebConfig();
  const byId = Object.fromEntries(config.photos.map(p => [p.id, p]));
  const reordered = orderedIds.filter(id => byId[id]).map((id, i) => ({ ...byId[id], sortOrder: i }));
  return saveWebConfig({ photos: reordered });
}

export async function markAsPublished(url: string): Promise<WebConfig> {
  return saveWebConfig({ publishedUrl: url, lastPublishedAt: Date.now(), isDraft: false });
}

// ─── generateWebsiteHTML ───────────────────────────────────────────────────────
/**
 * Genera el HTML estático de la web del negocio.
 * Incluye formularios de reserva y contacto que hacen fetch al Worker.
 * La URL del Worker sale de config.publicApiBaseUrl (no hardcodeada).
 */
export function generateWebsiteHTML(
  config: WebConfig,
  services: Array<{ name: string; price: number; durationMinutes: number }>
): string {
  const name     = config.businessName ?? 'Mi Peluquería';
  const tagline  = config.tagline      ?? 'Tu peluquería de confianza';
  const phone    = config.phone        ?? '';
  const whatsapp = config.whatsapp     ?? phone.replace(/\D/g, '');
  // URL del Worker — configurable, nunca hardcodeada
  const apiBase  = config.publicApiBaseUrl?.replace(/\/$/, '') ?? '';

  // ── Secciones condicionales ──────────────────────────────────────────────────

  const servicesHTML = config.sections.services.visible && services.length
    ? `<section id="servicios" class="section">
        <div class="container">
          <h2>Nuestros Servicios</h2>
          <div class="services-grid">
            ${services.map(s => `
              <div class="service-card">
                <div class="service-name">${s.name}</div>
                <div class="service-meta">${s.durationMinutes} min &middot; ${s.price.toFixed(0)} &euro;</div>
              </div>`).join('')}
          </div>
        </div>
      </section>`
    : '';

  const galleryHTML = config.sections.gallery.visible && config.photos.length
    ? `<section id="galeria" class="section section--alt">
        <div class="container">
          <h2>Galería</h2>
          <div class="gallery-grid">
            ${config.photos.map(p => `
              <div class="gallery-item">
                <img src="${p.url}" alt="${p.caption ?? name}" loading="lazy">
              </div>`).join('')}
          </div>
        </div>
      </section>`
    : '';

  const whatsappFab = whatsapp
    ? `<a href="https://wa.me/${whatsapp}" class="whatsapp-fab" target="_blank" rel="noopener noreferrer"
         aria-label="Contactar por WhatsApp">
         <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
           <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
         </svg>
       </a>`
    : '';

  // ── Formularios — solo si hay API configurada ────────────────────────────────
  // Si no hay publicApiBaseUrl, los formularios muestran un mensaje de advertencia.
  const hasApi = Boolean(apiBase);

  const reservationForm = config.sections.booking.visible
    ? `<section id="reservar" class="section section--primary">
        <div class="container">
          <h2>Reservar Cita</h2>
          <p class="section-subtitle">Solicita tu cita y te confirmaremos disponibilidad lo antes posible.</p>
          ${!hasApi
            ? `<div class="form-notice form-notice--warning">
                ⚠️ El formulario de reservas no está configurado aún. Contacta por teléfono o WhatsApp.
               </div>`
            : `<form id="form-reserva" class="form" novalidate>
                <div class="form-row">
                  <div class="form-field">
                    <label for="r-name">Nombre *</label>
                    <input type="text" id="r-name" name="name" placeholder="Tu nombre completo" required minlength="2">
                  </div>
                  <div class="form-field">
                    <label for="r-phone">Teléfono *</label>
                    <input type="tel" id="r-phone" name="phone" placeholder="612 345 678" required>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-field">
                    <label for="r-email">Email <span class="optional">(opcional)</span></label>
                    <input type="email" id="r-email" name="email" placeholder="tu@email.com">
                  </div>
                  <div class="form-field">
                    <label for="r-service">Servicio</label>
                    <select id="r-service" name="service">
                      <option value="">Selecciona un servicio…</option>
                      ${services.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
                    </select>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-field">
                    <label for="r-date">Fecha preferida</label>
                    <input type="date" id="r-date" name="preferredDate" min="${new Date().toISOString().slice(0, 10)}">
                  </div>
                  <div class="form-field">
                    <label for="r-time">Hora preferida</label>
                    <input type="time" id="r-time" name="preferredTime" min="09:00" max="20:00" step="1800">
                  </div>
                </div>
                <div class="form-field">
                  <label for="r-notes">Notas adicionales</label>
                  <textarea id="r-notes" name="notes" rows="3" placeholder="Cualquier preferencia o información útil…"></textarea>
                </div>
                <div id="reserva-feedback" class="form-feedback" role="alert" aria-live="polite"></div>
                <button type="submit" class="btn-submit" id="reserva-btn">
                  <span class="btn-text">Solicitar cita</span>
                  <span class="btn-spinner" hidden>Enviando…</span>
                </button>
              </form>`
          }
        </div>
      </section>`
    : '';

  const contactForm = config.sections.contact.visible
    ? `<section id="contacto" class="section">
        <div class="container contact-grid">
          <div class="contact-info">
            <h2>Encuéntranos</h2>
            ${config.address ? `<p class="contact-item">📍 ${config.address}</p>` : ''}
            ${phone          ? `<p class="contact-item">📞 <a href="tel:${phone}">${phone}</a></p>` : ''}
            ${config.email   ? `<p class="contact-item">✉️ <a href="mailto:${config.email}">${config.email}</a></p>` : ''}
            ${config.hoursText ? `<p class="contact-item">🕐 ${config.hoursText}</p>` : ''}
            ${whatsapp ? `<a href="https://wa.me/${whatsapp}" class="btn-whatsapp" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </a>` : ''}
          </div>
          <div class="contact-form-wrap">
            <h3>Envíanos un mensaje</h3>
            ${!hasApi
              ? `<div class="form-notice form-notice--warning">
                  Formulario de contacto no configurado. Contacta por teléfono.
                 </div>`
              : `<form id="form-contacto" class="form" novalidate>
                  <div class="form-field">
                    <label for="c-name">Nombre *</label>
                    <input type="text" id="c-name" name="name" placeholder="Tu nombre" required minlength="2">
                  </div>
                  <div class="form-row">
                    <div class="form-field">
                      <label for="c-phone">Teléfono</label>
                      <input type="tel" id="c-phone" name="phone" placeholder="612 345 678">
                    </div>
                    <div class="form-field">
                      <label for="c-email">Email</label>
                      <input type="email" id="c-email" name="email" placeholder="tu@email.com">
                    </div>
                  </div>
                  <div class="form-field">
                    <label for="c-subject">Asunto</label>
                    <input type="text" id="c-subject" name="subject" placeholder="¿En qué podemos ayudarte?">
                  </div>
                  <div class="form-field">
                    <label for="c-message">Mensaje *</label>
                    <textarea id="c-message" name="message" rows="4" placeholder="Escribe tu consulta…" required minlength="5"></textarea>
                  </div>
                  <div id="contacto-feedback" class="form-feedback" role="alert" aria-live="polite"></div>
                  <button type="submit" class="btn-submit" id="contacto-btn">
                    <span class="btn-text">Enviar mensaje</span>
                    <span class="btn-spinner" hidden>Enviando…</span>
                  </button>
                </form>`
            }
          </div>
        </div>
      </section>`
    : '';

  // ── JavaScript de formularios ─────────────────────────────────────────────────
  // Solo se incluye si hay API configurada
  const formsScript = hasApi ? `
<script>
(function() {
  'use strict';

  var API_BASE = ${JSON.stringify(apiBase)};

  function setFeedback(el, msg, isError) {
    el.textContent = msg;
    el.className = 'form-feedback ' + (isError ? 'form-feedback--error' : 'form-feedback--success');
    el.hidden = false;
  }

  function setLoading(form, isLoading) {
    var btn = form.querySelector('[type="submit"]');
    var btnText = form.querySelector('.btn-text');
    var btnSpinner = form.querySelector('.btn-spinner');
    if (btn) btn.disabled = isLoading;
    if (btnText) btnText.hidden = isLoading;
    if (btnSpinner) btnSpinner.hidden = !isLoading;
  }

  function validateEmail(e) {
    return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(e);
  }

  function validatePhone(p) {
    return /^[+\\d\\s\\-().]{7,20}$/.test(p);
  }

  // ── Formulario de reserva ─────────────────────────────────────────────────────
  var formReserva = document.getElementById('form-reserva');
  if (formReserva) {
    formReserva.addEventListener('submit', function(e) {
      e.preventDefault();
      var feedback = document.getElementById('reserva-feedback');
      feedback.hidden = true;

      var name  = (document.getElementById('r-name')?.value  ?? '').trim();
      var phone = (document.getElementById('r-phone')?.value ?? '').trim();
      var email = (document.getElementById('r-email')?.value ?? '').trim();
      var service = document.getElementById('r-service')?.value ?? '';
      var preferredDate = document.getElementById('r-date')?.value ?? '';
      var preferredTime = document.getElementById('r-time')?.value ?? '';
      var notes = (document.getElementById('r-notes')?.value ?? '').trim();

      // Validación frontend
      if (!name || name.length < 2) {
        setFeedback(feedback, 'Por favor, introduce tu nombre.', true);
        document.getElementById('r-name')?.focus();
        return;
      }
      if (!phone && !email) {
        setFeedback(feedback, 'Introduce un teléfono o email para que podamos contactarte.', true);
        document.getElementById('r-phone')?.focus();
        return;
      }
      if (phone && !validatePhone(phone)) {
        setFeedback(feedback, 'El teléfono no tiene un formato válido.', true);
        document.getElementById('r-phone')?.focus();
        return;
      }
      if (email && !validateEmail(email)) {
        setFeedback(feedback, 'El email no tiene un formato válido.', true);
        document.getElementById('r-email')?.focus();
        return;
      }

      setLoading(formReserva, true);

      fetch(API_BASE + '/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, phone: phone, email: email, service: service,
                               preferredDate: preferredDate, preferredTime: preferredTime, notes: notes })
      })
      .then(function(res) {
        return res.json().then(function(data) { return { ok: res.ok, data: data }; });
      })
      .then(function(result) {
        setLoading(formReserva, false);
        if (result.ok) {
          setFeedback(feedback, result.data.message || '¡Solicitud enviada! Te contactaremos pronto.', false);
          formReserva.reset();
        } else {
          setFeedback(feedback, result.data.error || 'Error al enviar la solicitud. Inténtalo de nuevo.', true);
        }
      })
      .catch(function(err) {
        setLoading(formReserva, false);
        setFeedback(feedback, 'Error de conexión. Comprueba tu internet e inténtalo de nuevo.', true);
        console.error('[Contigo] Error reserva:', err);
      });
    });
  }

  // ── Formulario de contacto ────────────────────────────────────────────────────
  var formContacto = document.getElementById('form-contacto');
  if (formContacto) {
    formContacto.addEventListener('submit', function(e) {
      e.preventDefault();
      var feedback = document.getElementById('contacto-feedback');
      feedback.hidden = true;

      var name    = (document.getElementById('c-name')?.value    ?? '').trim();
      var phone   = (document.getElementById('c-phone')?.value   ?? '').trim();
      var email   = (document.getElementById('c-email')?.value   ?? '').trim();
      var subject = (document.getElementById('c-subject')?.value ?? '').trim();
      var message = (document.getElementById('c-message')?.value ?? '').trim();

      if (!name || name.length < 2) {
        setFeedback(feedback, 'Por favor, introduce tu nombre.', true);
        document.getElementById('c-name')?.focus();
        return;
      }
      if (!message || message.length < 5) {
        setFeedback(feedback, 'El mensaje es demasiado corto.', true);
        document.getElementById('c-message')?.focus();
        return;
      }
      if (!phone && !email) {
        setFeedback(feedback, 'Introduce un teléfono o email para que podamos responderte.', true);
        document.getElementById('c-phone')?.focus();
        return;
      }
      if (phone && !validatePhone(phone)) {
        setFeedback(feedback, 'El teléfono no tiene un formato válido.', true);
        return;
      }
      if (email && !validateEmail(email)) {
        setFeedback(feedback, 'El email no tiene un formato válido.', true);
        return;
      }

      setLoading(formContacto, true);

      fetch(API_BASE + '/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, phone: phone, email: email, subject: subject, message: message })
      })
      .then(function(res) {
        return res.json().then(function(data) { return { ok: res.ok, data: data }; });
      })
      .then(function(result) {
        setLoading(formContacto, false);
        if (result.ok) {
          setFeedback(feedback, result.data.message || 'Mensaje enviado. ¡Gracias!', false);
          formContacto.reset();
        } else {
          setFeedback(feedback, result.data.error || 'Error al enviar el mensaje. Inténtalo de nuevo.', true);
        }
      })
      .catch(function(err) {
        setLoading(formContacto, false);
        setFeedback(feedback, 'Error de conexión. Comprueba tu internet e inténtalo de nuevo.', true);
        console.error('[Contigo] Error contacto:', err);
      });
    });
  }

})();
</script>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.metaTitle ?? name}</title>
  <meta name="description" content="${config.metaDescription ?? tagline}">
  <meta property="og:title" content="${config.metaTitle ?? name}">
  <meta property="og:description" content="${config.metaDescription ?? tagline}">
  <meta property="og:type" content="website">
  <meta name="robots" content="index, follow">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
      --primary-light: #ede9fe;
      --dark: #1e1b4b;
      --text: #374151;
      --muted: #6b7280;
      --border: #e5e7eb;
      --surface: #f9fafb;
      --white: #fff;
      --success: #059669;
      --error: #dc2626;
      --warning: #d97706;
      --radius: 12px;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: var(--text); background: var(--white); line-height: 1.6; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
    a { color: var(--primary); }

    /* ── Nav ── */
    nav { position: sticky; top: 0; background: rgba(255,255,255,.95); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); z-index: 100; }
    .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
    .nav-logo { font-size: 1.2rem; font-weight: 800; color: var(--primary); text-decoration: none; }
    .nav-links { display: flex; gap: 1.5rem; list-style: none; }
    .nav-links a { text-decoration: none; color: var(--text); font-size: .9rem; font-weight: 500; transition: color .2s; }
    .nav-links a:hover { color: var(--primary); }
    .nav-cta { display: inline-flex; align-items: center; background: var(--primary); color: #fff !important; padding: .5rem 1.25rem; border-radius: 9999px; font-weight: 600; font-size: .875rem; text-decoration: none; transition: background .2s; }
    .nav-cta:hover { background: var(--primary-dark); }

    /* ── Hero ── */
    .hero { background: linear-gradient(135deg, var(--primary-light) 0%, #ddd6fe 100%); padding: 5rem 0 4rem; text-align: center; }
    .hero h1 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; color: var(--dark); margin-bottom: 1rem; }
    .hero p { font-size: 1.15rem; color: var(--muted); max-width: 520px; margin: 0 auto 2rem; }
    .hero-actions { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }

    /* ── Buttons ── */
    .btn { display: inline-flex; align-items: center; gap: .5rem; padding: .75rem 1.75rem; border-radius: 9999px; font-weight: 600; font-size: .95rem; text-decoration: none; transition: all .2s; cursor: pointer; border: none; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover { background: var(--primary-dark); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(99,102,241,.3); }
    .btn-outline { background: transparent; color: var(--primary); border: 2px solid var(--primary); }
    .btn-outline:hover { background: var(--primary-light); }
    .btn-whatsapp { display: inline-flex; align-items: center; gap: .5rem; background: #25d366; color: #fff; padding: .65rem 1.25rem; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: .875rem; transition: opacity .2s; }
    .btn-whatsapp:hover { opacity: .88; }

    /* ── Sections ── */
    .section { padding: 4.5rem 0; }
    .section--alt { background: var(--surface); }
    .section--primary { background: linear-gradient(135deg, #f0f9ff 0%, var(--primary-light) 100%); }
    .section h2 { font-size: 2rem; font-weight: 700; text-align: center; margin-bottom: .75rem; color: var(--dark); }
    .section-subtitle { text-align: center; color: var(--muted); margin-bottom: 2.5rem; max-width: 540px; margin-left: auto; margin-right: auto; }

    /* ── Services ── */
    .services-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 1rem; }
    .service-card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem 1.5rem; transition: box-shadow .2s, transform .2s; }
    .service-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.08); transform: translateY(-2px); }
    .service-name { font-weight: 600; font-size: .95rem; margin-bottom: .25rem; }
    .service-meta { color: var(--muted); font-size: .85rem; }

    /* ── Gallery ── */
    .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
    .gallery-item img { width: 100%; height: 220px; object-fit: cover; border-radius: 10px; display: block; }

    /* ── Contact ── */
    .contact-grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 3rem; align-items: start; }
    .contact-info h2 { text-align: left; }
    .contact-item { margin-bottom: .875rem; color: var(--text); }
    .contact-item a { color: inherit; text-decoration: none; }
    .contact-item a:hover { color: var(--primary); }

    /* ── Forms ── */
    .form { display: flex; flex-direction: column; gap: 1rem; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-field { display: flex; flex-direction: column; gap: .35rem; }
    .form-field label { font-size: .85rem; font-weight: 500; color: var(--muted); }
    .optional { font-weight: 400; color: #9ca3af; }
    .form-field input, .form-field select, .form-field textarea {
      padding: .65rem .9rem; border: 1.5px solid var(--border); border-radius: 10px;
      font-size: .9rem; color: var(--text); background: var(--white); transition: border-color .2s, box-shadow .2s;
      font-family: inherit;
    }
    .form-field input:focus, .form-field select:focus, .form-field textarea:focus {
      outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,.12);
    }
    .form-field textarea { resize: vertical; }
    .btn-submit {
      align-self: flex-start; padding: .75rem 2rem; background: var(--primary); color: #fff;
      border: none; border-radius: 9999px; font-size: .95rem; font-weight: 600;
      cursor: pointer; transition: background .2s, opacity .2s; font-family: inherit;
    }
    .btn-submit:hover { background: var(--primary-dark); }
    .btn-submit:disabled { opacity: .6; cursor: not-allowed; }
    .form-feedback { display: none; padding: .75rem 1rem; border-radius: 10px; font-size: .875rem; font-weight: 500; }
    .form-feedback--success { display: block; background: #d1fae5; color: var(--success); border: 1px solid #a7f3d0; }
    .form-feedback--error   { display: block; background: #fee2e2; color: var(--error);   border: 1px solid #fca5a5; }
    .form-notice { padding: 1rem; border-radius: 10px; font-size: .9rem; }
    .form-notice--warning { background: #fef3c7; color: var(--warning); border: 1px solid #fde68a; }

    /* ── WhatsApp FAB ── */
    .whatsapp-fab {
      position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 200;
      background: #25d366; color: #fff; width: 56px; height: 56px;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(37,211,102,.4); transition: transform .2s, box-shadow .2s;
      text-decoration: none;
    }
    .whatsapp-fab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(37,211,102,.5); }

    /* ── Footer ── */
    footer { background: var(--dark); color: rgba(255,255,255,.5); text-align: center; padding: 2rem; font-size: .85rem; }
    footer a { color: rgba(255,255,255,.6); text-decoration: none; }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .nav-links { display: none; }
      .contact-grid { grid-template-columns: 1fr; gap: 2rem; }
      .form-row { grid-template-columns: 1fr; }
      .contact-form-wrap h3 { display: none; }
    }
    @media (max-width: 480px) {
      .hero { padding: 3rem 0 2.5rem; }
      .section { padding: 3rem 0; }
    }
  </style>
</head>
<body>

<nav>
  <div class="container nav-inner">
    <a href="#" class="nav-logo">${name}</a>
    <ul class="nav-links">
      ${config.sections.services.visible ? '<li><a href="#servicios">Servicios</a></li>' : ''}
      ${config.sections.gallery.visible  ? '<li><a href="#galeria">Galería</a></li>'     : ''}
      ${config.sections.contact.visible  ? '<li><a href="#contacto">Contacto</a></li>'   : ''}
    </ul>
    ${config.sections.booking.visible && hasApi
      ? '<a href="#reservar" class="nav-cta">Reservar cita</a>'
      : config.sections.contact.visible
        ? '<a href="#contacto" class="nav-cta">Contactar</a>'
        : ''}
  </div>
</nav>

<section class="hero">
  <div class="container">
    <h1>${name}</h1>
    <p>${tagline}</p>
    <div class="hero-actions">
      ${config.sections.booking.visible && hasApi
        ? '<a href="#reservar" class="btn btn-primary">Reservar cita</a>'
        : ''}
      ${whatsapp
        ? `<a href="https://wa.me/${whatsapp}" class="btn btn-outline" target="_blank" rel="noopener">WhatsApp</a>`
        : config.sections.contact.visible
          ? '<a href="#contacto" class="btn btn-outline">Contactar</a>'
          : ''}
    </div>
  </div>
</section>

${servicesHTML}
${galleryHTML}
${reservationForm}
${contactForm}

<footer>
  <p>&copy; ${new Date().getFullYear()} ${name}. Todos los derechos reservados.</p>
</footer>

${whatsappFab}
${formsScript}

</body>
</html>`;
}
