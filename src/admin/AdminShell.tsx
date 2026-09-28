import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { AdminSection } from '../pages/AdminPage';
import { AppLink } from '../routing/AppLink';
import type { Navigate } from '../routing/routes';

const GROUPS = [
  { label: 'Gestión', items: [
    { id: 'summary', label: 'Inicio' },
    { id: 'orders', label: 'Pedidos' },
    { id: 'products', label: 'Productos' },
  ] },
  { label: 'Herramientas', items: [
    { id: 'inventory', label: 'Actualizaciones' },
    { id: 'analytics', label: 'Visitas' },
    { id: 'audit', label: 'Actividad' },
  ] },
] as const;

export function AdminShell({ children, section, identity, busy, dirty, loggingOut, navigate, onSectionChange, onLogout }: Readonly<{
  children: ReactNode;
  section: AdminSection;
  identity: string;
  busy: boolean;
  dirty: boolean;
  loggingOut: boolean;
  navigate: Navigate;
  onSectionChange: (section: AdminSection) => void;
  onLogout: () => void;
}>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  function selectSection(next: AdminSection): void {
    if (busy && next !== section) return;
    onSectionChange(next);
    setMenuOpen(false);
    window.requestAnimationFrame(() => {
      const id = next === 'products' ? 'backoffice-title' : next === 'inventory' ? 'admin-dux-title' : `admin-${next}-title`;
      const heading = document.getElementById(id);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    });
  }

  return <div className="admin-app">
    <aside className="admin-sidebar" onKeyDown={event => {
      if (event.key !== 'Escape' || !menuOpen) return;
      event.preventDefault();
      setMenuOpen(false);
      menuRef.current?.focus();
    }}>
      <div className="admin-brand-row">
        <div className="admin-brand">
          <img src="/assets/favicon-shekinah.svg" alt="" width="36" height="36" />
          <div><strong>Shekinah</strong><span>Administración</span></div>
        </div>
        <button ref={menuRef} className="admin-menu-toggle" type="button" aria-expanded={menuOpen}
          aria-controls="admin-navigation-panel" onClick={() => setMenuOpen(open => !open)}>
          <AdminIcon name={menuOpen ? 'close' : 'menu'} />{menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        </button>
      </div>
      <div id="admin-navigation-panel" className={`admin-navigation-panel${menuOpen ? ' is-open' : ''}`}>
        <nav aria-label="Secciones administrativas">
          {GROUPS.map(group => <div className="admin-nav-group" key={group.label}>
            <p className="admin-nav-label">{group.label}</p>
            <ul>{group.items.map(item => <li key={item.id}>
              <button type="button" className="admin-nav-link" aria-current={section === item.id ? 'page' : undefined}
                disabled={busy && section !== item.id} onClick={() => selectSection(item.id)}>
                <AdminIcon name={item.id} /><span>{item.label}</span>
                {item.id === 'products' && dirty ? <span className="admin-unsaved-dot" aria-label="cambios sin guardar" /> : null}
              </button>
            </li>)}</ul>
          </div>)}
        </nav>
        <div className="admin-sidebar-footer">
          <AppLink className="admin-nav-link" navigate={navigate} to="/"><AdminIcon name="site" />Ir al sitio</AppLink>
          <p className="admin-session-identity"><span>Sesión iniciada como</span><strong>{identity}</strong></p>
          <button className="admin-nav-link" type="button" disabled={loggingOut || busy} onClick={onLogout}>
            <AdminIcon name="logout" />{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </aside>
    <div className="admin-content">{children}</div>
  </div>;
}

function AdminIcon({ name }: Readonly<{ name: AdminSection | 'site' | 'logout' | 'menu' | 'close' }>) {
  const paths = {
    summary: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z',
    orders: 'M8 4H5v17h14V4h-3M8 3h8v4H8ZM8 11h8M8 15h5',
    products: 'm3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 5 9-5M12 12v9M7 5l10 5',
    inventory: 'M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5',
    analytics: 'M4 20V4m0 16h17M8 16v-4m5 4V8m5 8V5',
    audit: 'M3 12a9 9 0 1 0 3-7L3 8m0-5v5h5m4-1v5l3 2',
    site: 'M14 3h7v7m0-7L11 13M10 5H4v15h15v-6',
    logout: 'M10 4H4v16h6m4-12 4 4-4 4m-6-4h12',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'm6 6 12 12M6 18 18 6',
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
