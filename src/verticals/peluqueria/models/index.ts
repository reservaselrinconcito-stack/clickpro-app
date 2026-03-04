/**
 * models/index.ts — Vertical: Peluquería
 *
 * All domain models specific to the hairdresser vertical.
 * Core models (Contact, Document, etc.) live in core/.
 */

// ─── Service Catalog ──────────────────────────────────────────────────────────

export interface HairService {
  id: string;
  name: string;                  // "Corte caballero", "Mechas", etc.
  description?: string;
  durationMinutes: number;       // Base duration for scheduling
  bufferMinutes: number;         // Cleaning/prep time after service
  price: number;
  colorHex?: string;             // UI color for calendar
  category?: string;             // "Color", "Corte", "Tratamiento"
  active: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Professional ─────────────────────────────────────────────────────────────

export interface Professional {
  id: string;
  name: string;
  role?: string;                 // "Estilista", "Colorista"
  phone?: string;
  email?: string;
  colorHex: string;              // Color for calendar column / appointment
  active: boolean;
  /** Days of week (0=Sun,1=Mon…6=Sat) they work */
  workDays: number[];
  /** Start time HH:MM */
  workStart: string;
  /** End time HH:MM */
  workEnd: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Schedule Config ──────────────────────────────────────────────────────────

export interface BusinessHours {
  dayOfWeek: number;   // 0-6
  open: boolean;
  startTime: string;   // "09:00"
  endTime: string;     // "20:00"
}

export interface ScheduleBlock {
  id: string;
  title: string;
  professionalId?: string;       // null = whole salon blocked
  startDatetime: number;         // Unix ms
  endDatetime: number;
  reason?: string;               // "Vacaciones", "Mantenimiento"
  recurring?: boolean;
  createdAt: number;
}

// ─── Appointment ──────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'pending'       // created, not confirmed
  | 'confirmed'     // confirmed by salon
  | 'completed'     // service done
  | 'cancelled'     // cancelled
  | 'no-show';      // client didn't show up

export type AppointmentOrigin =
  | 'manual'        // created in app
  | 'web'           // from business website
  | 'whatsapp'      // via WhatsApp
  | 'phone'         // via phone call
  | 'inbox';        // converted from inbox message

export interface Appointment {
  id: string;
  /** Contact from core contacts table (optional, can be walk-in) */
  contactId?: string;
  /** Walk-in / quick name if not linked to contact */
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;

  serviceId: string;
  serviceName: string;           // denormalized for speed
  professionalId?: string;
  professionalName?: string;     // denormalized

  /** Unix timestamp ms for start */
  startDatetime: number;
  /** Duration in minutes */
  durationMinutes: number;
  /** Buffer after appointment (cleaning etc.) */
  bufferMinutes: number;

  status: AppointmentStatus;
  origin: AppointmentOrigin;
  notes?: string;
  /** If converted from inbox, link to original message */
  inboxMessageId?: string;

  /** Computed: startDatetime + durationMinutes * 60000 */
  endDatetime: number;

  createdAt: number;
  updatedAt: number;
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

export type InboxMessageStatus =
  | 'unread'
  | 'read'
  | 'pending'        // needs action
  | 'converted'      // converted to appointment
  | 'archived';

export type InboxMessageType =
  | 'reservation-request'   // wants to book
  | 'contact-form'          // general contact
  | 'whatsapp'              // manually logged WhatsApp
  | 'cancellation'          // wants to cancel
  | 'other';

export interface InboxMessage {
  id: string;
  type: InboxMessageType;
  status: InboxMessageStatus;

  /** Sender info */
  senderName: string;
  senderPhone?: string;
  senderEmail?: string;

  subject?: string;
  body: string;

  /** Preferred date/time (from web form) */
  preferredDatetime?: number;
  preferredServiceId?: string;
  preferredServiceName?: string;
  preferredProfessionalId?: string;

  /** If converted to appointment */
  appointmentId?: string;

  /** Origin channel */
  source: 'web' | 'whatsapp' | 'manual' | 'other';

  readAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Web Config ───────────────────────────────────────────────────────────────

export type WebTemplate = 'moderna' | 'clasica' | 'minimalista';

export interface WebSection {
  id: string;
  visible: boolean;
}

export interface WebPhoto {
  id: string;
  url: string;
  caption?: string;
  sortOrder: number;
}

export interface WebConfig {
  id: string;
  /** Derived from core company data, but can be overridden */
  businessName?: string;
  tagline?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  whatsapp?: string;

  /**
   * Base URL del Cloudflare Worker de reservas.
   * Ejemplo: "https://contigo-reservation-api.ACCOUNT.workers.dev"
   * Configurable desde el editor web para no hardcodear la URL.
   */
  publicApiBaseUrl?: string;

  /** Opening hours text block (e.g. "L-V 9h-20h, S 9h-14h") */
  hoursText?: string;

  /** Active template */
  template: WebTemplate;

  /** Section visibility */
  sections: {
    hero: WebSection;
    services: WebSection;
    gallery: WebSection;
    team: WebSection;
    contact: WebSection;
    booking: WebSection;
  };

  /** Gallery photos (stored as JSON array in DB) */
  photos: WebPhoto[];

  /** SEO */
  metaTitle?: string;
  metaDescription?: string;

  /** Deployment */
  publishedUrl?: string;
  lastPublishedAt?: number;
  isDraft: boolean;

  createdAt: number;
  updatedAt: number;
}

// ─── Calendar View State ──────────────────────────────────────────────────────

export type CalendarViewMode = 'day' | 'week';

export interface CalendarState {
  viewMode: CalendarViewMode;
  currentDate: Date;
  selectedProfessionalId: string | null;   // null = all
  slotIntervalMinutes: 15 | 30 | 60;
}
