# Guía: Cómo crear una nueva vertical sobre el núcleo

> Versión: v2.4.0 · Autor: Arquitectura Contigo

Este documento explica el patrón arquitectónico para crear una especialización sectorial (vertical) sobre el núcleo de Contigo. Sigue este patrón para crear **obra**, **electricidad** u otras verticales sin modificar el núcleo.

---

## Arquitectura general

```
src/
├── core/                          ← NÚCLEO (no tocar)
│   ├── config/
│   │   └── app-config.ts          ← Branding + feature flags
│   ├── services/                  ← Servicios compartidos
│   └── components/                ← Componentes UI reutilizables
│
├── verticals/                     ← VERTICALES SECTORIALES
│   ├── peluqueria/                ← Ejemplo: peluquería (completo)
│   │   ├── models/index.ts
│   │   ├── migrations/v3-peluqueria.ts
│   │   ├── services/
│   │   ├── components/
│   │   └── pages/
│   │
│   ├── obra/                      ← Futura vertical: construcción
│   └── electricidad/              ← Futura vertical: instaladores
│
├── tauri/
│   └── db-adapter.ts              ← Añade migración de la vertical
└── App.tsx                        ← Añade rutas y nav de la vertical
```

---

## Paso 1: Crear la carpeta de la vertical

```bash
mkdir -p src/verticals/obra/{models,services,components,pages,migrations}
```

---

## Paso 2: Definir los modelos

Crea `src/verticals/obra/models/index.ts` con las interfaces TypeScript específicas del sector:

```ts
// Ejemplo: obra / construcción
export interface WorkOrder {
  id: string;
  clientId?: string;         // Reusa contacts del núcleo
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'invoiced';
  tradesmen: string[];       // IDs de profesionales
  startDate: number;
  endDate?: number;
  estimatedHours: number;
  materialsCost: number;
  laborCost: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Tradesman {
  id: string;
  name: string;
  trade: string;             // "Albañil", "Fontanero", etc.
  hourlyRate: number;
  phone?: string;
  active: boolean;
}
```

**Reutiliza del núcleo:**
- `contacts` → para clientes
- `documents` → para presupuestos y facturas
- `settings` → para configuración general

**Crea sólo lo específico del sector.**

---

## Paso 3: Crear la migración de base de datos

Crea `src/verticals/obra/migrations/v4-obra.ts`:

```ts
export const MIGRATION_V4_OBRA = {
  version: 4,  // siguiente número tras las existentes
  statements: [
    `CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      start_date INTEGER,
      end_date INTEGER,
      estimated_hours REAL,
      materials_cost REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE SET NULL
    )`,

    `CREATE TABLE IF NOT EXISTS tradesmen (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trade TEXT,
      hourly_rate REAL NOT NULL DEFAULT 0,
      phone TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ],
};
```

---

## Paso 4: Registrar la migración en db-adapter.ts

En `src/tauri/db-adapter.ts`, importa y añade a `MIGRATIONS`:

```ts
import { MIGRATION_V4_OBRA } from '../verticals/obra/migrations/v4-obra';

const MIGRATIONS = [
  // ... v1, v2, v3 existentes ...
  MIGRATION_V4_OBRA,  // ← añadir al final
];
```

⚠️ Las migraciones son **aditivas y no destructivas**. Nunca elimines tablas existentes.

---

## Paso 5: Crear los servicios

Crea `src/verticals/obra/services/work-order-service.ts`:

```ts
import { getDbAdapter } from '../../../tauri/db-adapter';
import type { WorkOrder } from '../models';
import { nanoid } from 'nanoid';

export async function createWorkOrder(input: Omit<WorkOrder, 'id'|'createdAt'|'updatedAt'>) {
  const db = getDbAdapter();
  const now = Date.now();
  const id = nanoid();
  await db.execute(
    `INSERT INTO work_orders (id, client_id, title, ..., created_at, updated_at)
     VALUES (?,?,?,...,?,?)`,
    [id, input.clientId ?? null, input.title, ..., now, now]
  );
  return { ...input, id, createdAt: now, updatedAt: now };
}

// ... getWorkOrders, updateWorkOrder, etc.
```

**Patrón a seguir:** mismo que `appointment-service.ts` de peluquería.

---

## Paso 6: Crear las páginas de UI

Crea las páginas en `src/verticals/obra/pages/`:

- `WorkOrdersPage.tsx` — listado de órdenes de trabajo
- `WorkOrderDetailPage.tsx` — detalle + partes de trabajo
- `TradesmenPage.tsx` — gestión de profesionales

**Reutiliza componentes del núcleo:**
- Tablas, modales, inputs → de `src/core/components/`
- Layout principal → ya provisto por `App.tsx`

---

## Paso 7: Añadir feature flag

En `src/core/config/app-config.ts`, añade el flag:

```ts
export interface FeatureFlags {
  accounting: boolean;
  peluqueria: boolean;
  obra: boolean;         // ← añadir
  webEditor: boolean;
  inbox: boolean;
  // ...
}

const DEFAULT_CONFIG: AppConfig = {
  features: {
    // ...
    obra: false,  // desactivado por defecto, se activa por cliente
  },
};
```

---

## Paso 8: Añadir rutas y nav en App.tsx

En `src/App.tsx`:

```tsx
// Importar páginas
const WorkOrdersPage = lazy(() => import('./verticals/obra/pages/WorkOrdersPage'));

// Añadir nav items
const navObraItems = [
  { to: '/work-orders', label: 'Órdenes de trabajo', icon: HardHat },
  { to: '/tradesmen',   label: 'Profesionales',       icon: Users },
];

// En Sidebar, añadir sección:
{getFeature('obra') && (
  <>
    <p className="...">Obra</p>
    {navObraItems.map(item => <NavLink ... />)}
  </>
)}

// En Routes:
{getFeature('obra') && (
  <Route path="/work-orders" element={<WorkOrdersPage />} />
)}
```

---

## Paso 9: Configurar para un cliente específico

En la función de boot o en `Settings`, carga la config del cliente:

```ts
import { setAppConfig } from './core/config/app-config';

// Al iniciar la app o al cambiar el perfil de cliente:
setAppConfig({
  activeVertical: 'obra',
  features: {
    peluqueria: false,
    obra: true,
    webEditor: true,
    inbox: true,
  },
  branding: {
    appName: 'ObraGest',
    appFullName: 'ObraGest — Gestión para constructores',
  },
});
```

---

## Checklist de nueva vertical

- [ ] `src/verticals/NOMBRE/models/index.ts` — interfaces TypeScript
- [ ] `src/verticals/NOMBRE/migrations/vN-nombre.ts` — SQL migration
- [ ] Migración registrada en `db-adapter.ts`
- [ ] `src/verticals/NOMBRE/services/*.ts` — CRUD services
- [ ] `src/verticals/NOMBRE/pages/*.tsx` — páginas de UI
- [ ] Feature flag añadido en `app-config.ts`
- [ ] Nav + rutas añadidos en `App.tsx`
- [ ] Tests de integración básicos

---

## Qué está en el núcleo (reutilizar, no duplicar)

| Módulo             | Tabla/Servicio         | Reutilizar como                    |
|--------------------|------------------------|------------------------------------|
| Clientes           | `contacts`             | Clientes de la vertical            |
| Artículos          | `items`                | Materiales, productos, servicios   |
| Facturas           | `documents`            | Facturar trabajos de la vertical   |
| Pagos              | `payments`             | Cobros de la vertical              |
| Configuración      | `settings`             | Config general del negocio         |
| Audit log          | `audit_log`            | Trazabilidad de acciones           |
| Licencias          | `LicenseContext`       | Misma validación de licencia       |
| UI base            | `components/`          | Botones, tablas, inputs, modales   |

---

## Contrato entre núcleo y vertical

El núcleo expone:

```ts
// core/services/contacts.ts  — ya existe
export function getContacts(): Promise<Contact[]>
export function getContact(id: string): Promise<Contact | null>

// core/services/company-profile.ts  — ya existe
export function getCompanySettings(): Promise<CompanySettings>

// core/config/app-config.ts
export function getFeature(flag: keyof FeatureFlags): boolean
export function getBranding(): AppBranding
```

La vertical **importa** del núcleo, nunca al revés.
El núcleo nunca importa de una vertical.

---

## Próximas verticales sugeridas

| Vertical       | Módulos clave                                              |
|----------------|------------------------------------------------------------|
| Obra           | Órdenes trabajo, partes diarios, certificaciones, AAFF    |
| Electricidad   | Instalaciones, revisiones, certificados, normativa         |
| Fontanería     | Avisos, urgencias, presupuestos rápidos                    |
| Clínica        | Pacientes, citas médicas, historial, consentimientos       |
| Consultoría    | Proyectos, tareas, time-tracking, hitos                    |

---

*Patrón diseñado para Contigo v2.4.0. Actualizar con cada versión mayor.*
