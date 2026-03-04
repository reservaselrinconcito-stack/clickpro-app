import type { VerticalDescriptor } from '../../core/vertical-engine/types';

import CalendarPage from './pages/CalendarPage';
import InboxPage from './pages/InboxPage';
import WebEditorPage from './pages/WebEditorPage';

export const peluqueriaVertical: VerticalDescriptor = {
  id: 'peluqueria',
  label: 'ClickPro',
  routes: [
    { path: '/calendar', element: <CalendarPage />, wrapInLayout: true },
    { path: '/inbox', element: <InboxPage />, wrapInLayout: true },
    { path: '/web-editor', element: <WebEditorPage />, wrapInLayout: true },
  ],
  menu: [
    { to: '/calendar', label: 'Calendario', icon: 'Calendar' as any },
    { to: '/inbox', label: 'Buzón', icon: 'Inbox' as any },
    { to: '/web-editor', label: 'Editor web', icon: 'Layout' as any },
  ],
};
