import { useEffect, useState, type ReactNode } from 'react';
import { verifiedStore } from './catalog';
import { navigation, site, toSitePath } from './content';
import { quantityLabel, useCart } from './cart';

function isCurrent(currentPath: string, href: string): boolean {
  return href === '/' ? currentPath === '/' : currentPath === href || currentPath.startsWith(href);
}

function StoreHeader({ currentPath }: { currentPath: string }) {
  const { lines, setOpen: setCartOpen } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const quantity = lines.reduce((total, line) => total + line.quantity, 0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('has-open-menu', menuOpen);
    return () => document.body.classList.remove('has-open-menu');
  }, [menuOpen]);

  return (
    <header className="store-header">
      <div className="container store-header__inner">
        <a className="store-brand" href={toSitePath('/')} aria-label="Shekinah, volver al inicio">
          <img src={toSitePath('/images/brand-horizontal.webp')} alt="Shekinah" width="600" height="162" />
        </a>
        <button
          className="store-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="store-navigation"
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? 'Cerrar menú' : 'Menú'}
        </button>
        <nav
          id="store-navigation"
          className={`store-navigation${menuOpen ? ' is-open' : ''}`}
          aria-label="Navegación principal"
        >
          {navigation.map((item) => (
            <a
              key={item.href}
              href={toSitePath(item.href)}
              aria-current={isCurrent(currentPath, item.href) ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <button
          className="cart-trigger"
          type="button"
          onClick={() => setCartOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Abrir carrito, ${quantityLabel(lines)}`}
        >
          Carrito <span aria-hidden="true">{quantity}</span>
        </button>
      </div>
    </header>
  );
}

function StoreFooter() {
  return (
    <footer className="store-footer">
      <div className="container store-footer__grid">
        <div>
          <img src={toSitePath('/images/brand-horizontal.webp')} alt="Shekinah" width="600" height="162" />
          <p>{site.description}</p>
        </div>
        <nav aria-label="Enlaces útiles">
          <strong>Enlaces útiles</strong>
          <a href={toSitePath('/nosotros/')}>Nosotros</a>
          <a href={toSitePath('/blog/')}>Guías y consejos</a>
          <a href={toSitePath('/terms-and-conditions/')}>Términos y condiciones</a>
        </nav>
        <div>
          <strong>Contacto</strong>
          <p><a href={`https://wa.me/${verifiedStore.whatsappNumber}`} target="_blank" rel="noreferrer">WhatsApp {verifiedStore.whatsappVisible}</a></p>
          <p><a href={`mailto:${site.email}`}>{site.email}</a></p>
          <p>{site.address}</p>
        </div>
      </div>
    </footer>
  );
}

export function StoreLayout({ children, currentPath }: { children: ReactNode; currentPath: string }) {
  return (
    <>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <StoreHeader currentPath={currentPath} />
      <main id="main-content">{children}</main>
      <StoreFooter />
    </>
  );
}
