import type { ReactNode } from 'react';
import { verifiedStore } from './catalog';
import { quantityLabel, useCart } from './cart';

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
          <a className="store-brand" href="/" aria-label="Shekinah, inicio">
            <img src="/images/brand-horizontal.webp" alt="Shekinah" width="600" height="162" />
          </a>
          <nav aria-label="Navegación principal de la tienda">
            <a href="/">Inicio</a>
            <a href="/tienda/">Tienda</a>
            <a href="/recetas/">Recetas</a>
            <a href="/blog/">Blog</a>
            <a href="/nosotros/">Nosotros</a>
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
          <img src="/images/brand-lockup.webp" alt="Shekinah" width="1200" height="670" />
          <p>Herbolario y tienda gourmet. Contenido recuperado con procedencia explícita.</p>
        </div>
        <nav aria-label="Navegación legal">
          <a href="/terms-and-conditions/">Términos y condiciones</a>
          <a href="/blog/">Blog</a>
          <a href="/recetas/">Recetas</a>
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

