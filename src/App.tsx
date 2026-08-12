import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { trackAnalyticsEvent } from './analytics/client';
import { AnalyticsConsent } from './analytics/AnalyticsConsent';
import { useCart } from './cart/CartContext';
import { authorizedAssets } from './config/authorized-assets';
import {
  footerNavigationItems,
  navigationItems,
  siteContent,
} from './content/site-content';
import { CartPage } from './pages/CartPage';
import type { ProductInteractionState } from './admin/ProductManager';
import { CatalogPage } from './pages/CatalogPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PaymentReturnPage } from './pages/PaymentReturnPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProductPage } from './pages/ProductPage';
import { AppLink } from './routing/AppLink';
import { appPaths } from './routing/routes';
import type { AppRoute, Navigate } from './routing/routes';
import { useBrowserRoute } from './routing/useBrowserRoute';

const AdminBackoffice = lazy(() =>
  import('./admin/AdminBackoffice').then(({ AdminBackoffice: component }) => ({
    default: component,
  })),
);

const IDLE_ADMIN_INTERACTION: ProductInteractionState = Object.freeze({
  busy: false,
  dirty: false,
});

export function App() {
  const currentYear = new Date().getFullYear();
  const { itemCount } = useCart();
  const [adminInteraction, setAdminInteraction] = useState(IDLE_ADMIN_INTERACTION);
  const [navigationFeedback, setNavigationFeedback] = useState('');
  const shouldNavigate = useCallback(() => {
    if (adminInteraction.busy) {
      setNavigationFeedback(
        adminInteraction.operationLabel === undefined
          ? 'Esperá a que termine la operación administrativa antes de salir.'
          : `Esperá a que termine: ${adminInteraction.operationLabel}.`,
      );
      return false;
    }
    if (!adminInteraction.dirty) {
      setNavigationFeedback('');
      return true;
    }
    const confirmed = window.confirm(
      'Salir de Administración\n\nHay cambios de producto sin guardar. Si salís ahora, se perderán.',
    );
    setNavigationFeedback(confirmed ? '' : 'Los cambios siguen sin guardar. Permanecés en Administración.');
    return confirmed;
  }, [adminInteraction]);
  const { navigate, pathname, route } = useBrowserRoute(shouldNavigate);
  const mainRef = useRef<HTMLElement | null>(null);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    document.title = route.title;
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', route.description);
  }, [route.description, route.title]);

  useEffect(() => {
    if (route.id !== 'admin' && route.id !== 'resolving-product') {
      void trackAnalyticsEvent('page_view', { path: pathname });
    }
  }, [pathname, route.id]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    mainRef.current?.focus({ preventScroll: false });
  }, [pathname]);

  useEffect(() => {
    if (!adminInteraction.busy && !adminInteraction.dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [adminInteraction.busy, adminInteraction.dirty]);

  useEffect(() => {
    if (!adminInteraction.busy && !adminInteraction.dirty) {
      setNavigationFeedback('');
    }
  }, [adminInteraction.busy, adminInteraction.dirty]);

  const activePath = route.id === 'not-found' || route.id === 'resolving-product'
    ? null
    : route.id === 'product' || route.id === 'category'
      ? appPaths.catalog
      : route.id === 'paymentSuccess' ||
          route.id === 'paymentPending' ||
          route.id === 'paymentError'
        ? appPaths.cart
        : route.path;

  return (
    <>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <header className="site-header">
        <div className="container header-inner">
          <AppLink
            className="brand"
            aria-label="Shekinah, ir al inicio"
            navigate={navigate}
            to={appPaths.home}
          >
            <img
              className="brand-mark"
              src={authorizedAssets.logo.path}
              width="72"
              height="72"
              alt={authorizedAssets.logo.alt}
            />
            <span className="brand-text">
              <strong>{siteContent.brand.name}</strong>
              <small>{siteContent.brand.descriptor}</small>
            </span>
          </AppLink>
          <nav className="primary-navigation" aria-label="Navegación principal">
            <ul>
              {navigationItems.map((item) => (
                <li key={item.href}>
                  <AppLink
                    aria-current={activePath === item.href ? 'page' : undefined}
                    navigate={navigate}
                    to={item.href}
                  >
                    {item.label}
                  </AppLink>
                </li>
              ))}
              <li>
                <AppLink
                  aria-current={activePath === appPaths.cart ? 'page' : undefined}
                  aria-label={`Carrito, ${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}`}
                  className="cart-navigation-link"
                  navigate={navigate}
                  to={appPaths.cart}
                >
                  Carrito <CartCount itemCount={itemCount} />
                </AppLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      {navigationFeedback === '' ? null : (
        <p className="container navigation-feedback" role="alert">{navigationFeedback}</p>
      )}
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        <RouteView
          navigate={navigate}
          pathname={pathname}
          route={route}
          onAdminInteractionStateChange={setAdminInteraction}
        />
      </main>
      {route.id === 'admin' ? null : <AnalyticsConsent />}
      <footer className="site-footer">
        <div className="container footer-inner">
          <p className="footer-brand">
            <strong>{siteContent.brand.name}</strong>
            <span>{siteContent.brand.descriptor}</span>
          </p>
          <nav className="footer-navigation" aria-label="Navegación del pie">
            {footerNavigationItems.map((item) => (
              <AppLink
                aria-current={activePath === item.href ? 'page' : undefined}
                navigate={navigate}
                to={item.href}
                key={item.href}
              >
                {item.label}
              </AppLink>
            ))}
          </nav>
          <p className="copyright">© {currentYear} {siteContent.brand.name}.</p>
        </div>
      </footer>
    </>
  );
}

function CartCount({ itemCount }: Readonly<{ itemCount: number }>) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <span
      className={`cart-count${mounted.current ? ' cart-count-updated' : ''}`}
      key={itemCount}
      aria-hidden="true"
    >
      {itemCount}
    </span>
  );
}

function RouteView({
  navigate,
  onAdminInteractionStateChange,
  pathname,
  route,
}: Readonly<{
  navigate: Navigate;
  onAdminInteractionStateChange: (state: ProductInteractionState) => void;
  pathname: string;
  route: AppRoute;
}>) {
  switch (route.id) {
    case 'home':
      return <HomePage navigate={navigate} />;
    case 'catalog':
      return <CatalogPage navigate={navigate} />;
    case 'cart':
      return <CartPage navigate={navigate} />;
    case 'category':
      return <CatalogPage categorySlug={route.categorySlug} key={route.path} navigate={navigate} />;
    case 'product':
      return <ProductPage key={route.path} navigate={navigate} productSlug={route.productSlug} />;
    case 'privacy':
      return <PrivacyPage navigate={navigate} />;
    case 'paymentSuccess':
      return <PaymentReturnPage expected="success" navigate={navigate} />;
    case 'paymentPending':
      return <PaymentReturnPage expected="pending" navigate={navigate} />;
    case 'paymentError':
      return <PaymentReturnPage expected="failure" navigate={navigate} />;
    case 'admin':
      return (
        <Suspense fallback={<p className="container" role="status">Cargando administración…</p>}>
          <AdminBackoffice
            navigate={navigate}
            onInteractionStateChange={onAdminInteractionStateChange}
          />
        </Suspense>
      );
    case 'resolving-product':
      return (
        <section className="section" aria-labelledby="resolving-product-title">
          <div className="container">
            <h1 id="resolving-product-title">Cargando producto…</h1>
            <p role="status">Verificando el catálogo público.</p>
          </div>
        </section>
      );
    case 'not-found':
      return <NotFoundPage navigate={navigate} pathname={pathname} />;
  }
  return assertNever(route);
}

function assertNever(value: never): never {
  throw new Error(`Ruta no contemplada: ${JSON.stringify(value)}`);
}
