import type { ReactNode } from 'react';
import { verifiedStore } from './catalog';
import { quantityLabel, useCart } from './cart';
import { toSitePath } from './content';

function StoreHeader() {
  const { lines, setOpen } = useCart();
  return (
    <>
      <div className="commercial-bar">
        <div className="container commercial-bar__inner">
          <span>LOS OLORES NO SE TRANSMITEN · LA CALIDAD SÍ</span>
          <a href={`https://wa.me/${verifiedStore.whatsappNumber}`}>{verifiedStore.whatsappVisible}</a>
        </div>
      </div>
      <header className="store-header">
        <div className="container store-header__inner">
          <a className="store-brand" href={toSitePath('/')} aria-label="Shekinah, inicio">
            <img src={toSitePath('/images/brand-horizontal.webp')} alt="Shekinah" width="600" height="162" />
          </a>
          <nav aria-label="Navegación principal de la tienda">
            <a href={toSitePath('/')}>Inicio</a>
            <a href={toSitePath('/tienda/')}>Tienda</a>
            <a href={toSitePath('/recetas/')}>Recetas</a>
            <a href={toSitePath('/blog/')}>Blog</a>
            <a href={toSitePath('/nosotros/')}>Nosotros</a>
          </nav>
          <button className="cart-trigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
            Carrito <span aria-label={quantityLabel(lines)}>{lines.reduce((total, line) => total + line.quantity, 0)}</span>
          </button>
        </div>
      </header>
    </>
  );
}

function StoreFooter() {
  return (
    <footer className="store-footer">
      <div className="container store-footer__grid">
        <div>
          <img src={toSitePath('/images/brand-lockup.webp')} alt="Shekinah" width="1200" height="670" />
          <p>Herbolario y tienda gourmet con productos seleccionados para tu cocina.</p>
        </div>
        <nav aria-label="Navegación legal">
          <a href={toSitePath('/terms-and-conditions/')}>Términos y condiciones</a>
          <a href={toSitePath('/blog/')}>Blog</a>
          <a href={toSitePath('/recetas/')}>Recetas</a>
        </nav>
        <div>
          <strong>Consultas</strong>
          <p>
            <a href={`https://wa.me/${verifiedStore.whatsappNumber}`}>{verifiedStore.whatsappVisible}</a>
          </p>
          <p>Mar del Plata, Buenos Aires, Argentina.</p>
        </div>
      </div>
    </footer>
  );
}

export function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <StoreHeader />
      <main id="main-content">{children}</main>
      <StoreFooter />
    </>
  );
}
