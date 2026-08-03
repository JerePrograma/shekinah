import { useState } from 'react';
import type { ChangeEvent } from 'react';

import { trackAnalyticsEvent } from '../analytics/client';
import { formatProductPrice } from '../catalog/catalog';
import { useCart } from '../cart/CartContext';
import { MAX_CART_QUANTITY } from '../cart/model';
import { createCheckoutPreference } from '../commerce/api';
import {
  getOrCreateCheckoutIdempotencyKey,
  rememberCheckoutOrder,
} from '../commerce/checkout-session';
import {
  getAuthorizedWhatsappNumber,
  isCommerceClientEnabled,
} from '../commerce/env';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

export function CartPage({ navigate }: Readonly<{ navigate: Navigate }>) {
  const { clear, items, itemCount, remove, setQuantity, total } = useCart();
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const whatsappNumber = getAuthorizedWhatsappNumber();
  const commerceEnabled = isCommerceClientEnabled();

  async function startCheckout() {
    if (items.length === 0 || checkoutPending || !commerceEnabled) return;
    setCheckoutPending(true);
    setCheckoutError('');
    void trackAnalyticsEvent('checkout_start', { path: appPaths.cart });
    try {
      const checkoutKey = await getOrCreateCheckoutIdempotencyKey(items);
      const result = await createCheckoutPreference(items, checkoutKey);
      rememberCheckoutOrder(result.publicToken, items);
      void trackAnalyticsEvent('checkout_redirect', { path: appPaths.cart });
      window.location.assign(result.checkoutUrl);
    } catch (error: unknown) {
      setCheckoutError(
        error instanceof Error ? error.message : 'No se pudo iniciar el pago.',
      );
      setCheckoutPending(false);
    }
  }

  function openWhatsapp() {
    if (whatsappNumber === null || items.length === 0) return;
    const lines = items.map(({ product, quantity, subtotal }) => {
      const presentation = product.presentation === undefined ? '' : ` (${product.presentation})`;
      const subtotalText =
        formatProductPrice({ amount: subtotal, currency: 'ARS' }) ?? 'Sin precio';
      return `• ${quantity} × ${product.name}${presentation}: ${subtotalText}`;
    });
    const totalText = formatProductPrice({ amount: total, currency: 'ARS' }) ?? 'Sin precio';
    const message = [
      'Hola, quiero consultar por este carrito de Shekinah:',
      '',
      ...lines,
      '',
      `Total de referencia: ${totalText}`,
      'Por favor, confirmen disponibilidad e importe final.',
    ].join('\n');
    void trackAnalyticsEvent('whatsapp_open', { path: appPaths.cart });
    window.open(
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <section className="cart-page section" aria-labelledby="cart-title">
      <div className="container cart-shell">
        <div className="section-heading">
          <p className="eyebrow">Compra</p>
          <h1 id="cart-title">Tu carrito.</h1>
          <p>
            {itemCount === 0
              ? 'Todavía no agregaste productos.'
              : `${itemCount} ${itemCount === 1 ? 'unidad' : 'unidades'} en el carrito.`}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <div>
              <h2>El carrito está vacío</h2>
              <p>Recorré el catálogo y agregá los productos que necesitás.</p>
              <AppLink className="button" navigate={navigate} to={appPaths.catalog}>
                Ver catálogo
              </AppLink>
            </div>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-items" aria-label="Productos del carrito">
              {items.map(({ product, quantity, unitPrice, subtotal }) => (
                <article className="cart-line" key={product.id}>
                  {product.primaryImage === undefined ? (
                    <div
                      className="product-image-placeholder cart-line-image"
                      role="img"
                      aria-label="Imagen no disponible"
                    >
                      Imagen no disponible
                    </div>
                  ) : (
                    <img
                      className="cart-line-image"
                      src={product.primaryImage.src}
                      alt={product.primaryImage.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <div className="cart-line-content">
                    <h2>
                      <AppLink navigate={navigate} to={product.path}>
                        {product.name}
                      </AppLink>
                    </h2>
                    <p>
                      {formatProductPrice({ amount: unitPrice, currency: 'ARS' })}
                      {product.presentation === undefined
                        ? null
                        : ` · ${product.presentation}`}
                    </p>
                    <label htmlFor={`quantity-${product.id}`}>
                      Cantidad
                    </label>
                    <input
                      id={`quantity-${product.id}`}
                      className="cart-quantity"
                      type="number"
                      min="1"
                      max={MAX_CART_QUANTITY}
                      inputMode="numeric"
                      value={quantity}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const nextQuantity = Number.parseInt(event.currentTarget.value, 10);
                        if (Number.isInteger(nextQuantity)) {
                          setQuantity(product.id, nextQuantity);
                        }
                      }}
                    />
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        remove(product.id);
                        void trackAnalyticsEvent('cart_remove', {
                          path: appPaths.cart,
                          productId: product.id,
                        });
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                  <p className="cart-line-subtotal">
                    {formatProductPrice({ amount: subtotal, currency: 'ARS' })}
                  </p>
                </article>
              ))}
            </div>

            <aside className="cart-summary" aria-labelledby="cart-summary-title">
              <h2 id="cart-summary-title">Resumen</h2>
              <p className="cart-total">
                <span>Total</span>
                <strong>
                  {formatProductPrice({ amount: total, currency: 'ARS' })}
                </strong>
              </p>
              <p className="cart-disclaimer">
                El servidor vuelve a validar disponibilidad y precios antes de crear el pago.
              </p>
              <button
                className="button button-primary"
                type="button"
                disabled={checkoutPending || !commerceEnabled}
                onClick={() => void startCheckout()}
              >
                {checkoutPending ? 'Preparando pago…' : 'Pagar con Mercado Pago'}
              </button>
              {!commerceEnabled ? (
                <p className="cart-configuration-note">
                  El pago estará disponible cuando el comercio esté habilitado.
                </p>
              ) : null}
              <button
                className="button button-secondary"
                type="button"
                disabled={whatsappNumber === null}
                onClick={openWhatsapp}
              >
                Enviar carrito por WhatsApp
              </button>
              {whatsappNumber === null ? (
                <p className="cart-configuration-note">
                  WhatsApp estará disponible cuando se configure un número autorizado.
                </p>
              ) : null}
              <button className="text-button" type="button" onClick={clear}>
                Vaciar carrito
              </button>
              {checkoutError === '' ? null : (
                <p className="form-error" role="alert">
                  {checkoutError}
                </p>
              )}
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
