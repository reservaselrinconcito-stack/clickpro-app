import type { VerticalDescriptor } from '../../core/vertical-engine/types';

import CalendarPage from './pages/CalendarPage';
import InboxPage from './pages/InboxPage';
import WebEditorPage from './pages/WebEditorPage';

export const peluqueriaVertical: VerticalDescriptor = {
  id: 'peluqueria',
  label: 'ClickPro',
  routes: [
    { path: '/peluqueria/calendar', element: <CalendarPage />, wrapInLayout: true },
    { path: '/peluqueria/inbox', element: <InboxPage />, wrapInLayout: true },
    { path: '/peluqueria/web-editor', element: <WebEditorPage />, wrapInLayout: true },
  ],
  menu: [
    { to: '/peluqueria/calendar', label: 'Calendario', icon: 'Calendar' as any },
    { to: '/peluqueria/inbox', label: 'Buzón', icon: 'Inbox' as any },
    { to: '/peluqueria/web-editor', label: 'Editor web', icon: 'Layout' as any },
  ],
};
