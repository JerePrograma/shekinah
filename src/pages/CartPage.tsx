import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';

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
  calculateShippingQuote,
  deliveryMethodLabel,
  validateFulfillment,
} from '../commerce/fulfillment';
import type {
  FulfillmentDraft,
  FulfillmentField,
} from '../commerce/fulfillment';
import {
  getAuthorizedMercadoPagoPaymentLink,
  getAuthorizedWhatsappNumber,
  isCommerceClientEnabled,
} from '../commerce/env';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

const INITIAL_FULFILLMENT: FulfillmentDraft = Object.freeze({
  method: 'coordinated_pickup',
  fullName: '',
  phone: '',
  address: '',
  locality: '',
  province: '',
  postalCode: '',
});

const fields: readonly Readonly<{
  key: Exclude<FulfillmentField, 'method' | 'form'>;
  label: string;
  autoComplete: string;
  inputMode?: 'tel' | 'text';
}>[] = [
  { key: 'fullName', label: 'Nombre completo', autoComplete: 'name' },
  { key: 'phone', label: 'Celular', autoComplete: 'tel', inputMode: 'tel' },
  { key: 'address', label: 'Dirección', autoComplete: 'street-address' },
  { key: 'locality', label: 'Localidad', autoComplete: 'address-level2' },
  { key: 'province', label: 'Provincia', autoComplete: 'address-level1' },
  { key: 'postalCode', label: 'Código postal', autoComplete: 'postal-code' },
];

export function CartPage({ navigate }: Readonly<{ navigate: Navigate }>) {
  const { clear, items, itemCount, remove, setQuantity, total } = useCart();
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [manualPaymentNotice, setManualPaymentNotice] = useState('');
  const [fulfillmentDraft, setFulfillmentDraft] = useState<FulfillmentDraft>(INITIAL_FULFILLMENT);
  const [showErrors, setShowErrors] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const whatsappNumber = getAuthorizedWhatsappNumber();
  const mercadoPagoPaymentLink = getAuthorizedMercadoPagoPaymentLink();
  const commerceEnabled = isCommerceClientEnabled();
  const validation = useMemo(() => validateFulfillment(fulfillmentDraft), [fulfillmentDraft]);
  const quote = useMemo(
    () => calculateShippingQuote(
      items.map(({ product, quantity }) => ({
        name: product.name,
        ...(product.presentation === undefined ? {} : { presentation: product.presentation }),
        quantity,
      })),
      fulfillmentDraft.method === '' ? 'coordinated_pickup' : fulfillmentDraft.method,
    ),
    [fulfillmentDraft.method, items],
  );
  const productsTotalMinor = Math.round(total * 100);
  const checkoutTotalMinor = productsTotalMinor + quote.shippingMinor;

  useEffect(() => {
    setManualPaymentNotice('');
  }, [checkoutTotalMinor]);

  async function startCheckout() {
    if (items.length === 0 || checkoutPending || !commerceEnabled) return;
    setShowErrors(true);
    setCheckoutError('');
    if (validation.value === null) {
      focusFirstError(validation.errors);
      return;
    }
    if (quote.kind === 'manual') {
      setCheckoutError(manualQuoteMessage(quote.tier));
      return;
    }
    setCheckoutPending(true);
    void trackAnalyticsEvent('checkout_start', { path: appPaths.cart });
    try {
      const checkoutKey = await getOrCreateCheckoutIdempotencyKey(
        items,
        validation.value,
      );
      const result = await createCheckoutPreference(
        items,
        checkoutKey,
        validation.value,
      );
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

  function prepareManualPayment(event: MouseEvent<HTMLAnchorElement>) {
    if (
      mercadoPagoPaymentLink === null ||
      items.length === 0 ||
      quote.kind === 'manual'
    ) {
      event.preventDefault();
      return;
    }

    setShowErrors(true);
    setCheckoutError('');
    if (validation.value === null) {
      event.preventDefault();
      focusFirstError(validation.errors);
      return;
    }

    const amount = formatManualPaymentAmount(checkoutTotalMinor);
    const displayTotal = formatMinor(checkoutTotalMinor);
    if (navigator.clipboard === undefined) {
      setManualPaymentNotice(
        `Ingresá ${displayTotal} en Mercado Pago. El navegador no permitió copiar el monto automáticamente.`,
      );
      return;
    }

    try {
      void navigator.clipboard.writeText(amount).then(
        () => {
          setManualPaymentNotice(`Monto copiado: ${displayTotal}. Pegalo en Mercado Pago.`);
        },
        () => {
          setManualPaymentNotice(
            `Ingresá ${displayTotal} en Mercado Pago. No se pudo copiar el monto automáticamente.`,
          );
        },
      );
    } catch {
      setManualPaymentNotice(
        `Ingresá ${displayTotal} en Mercado Pago. No se pudo copiar el monto automáticamente.`,
      );
    }
  }

  function updateField(
    field: keyof FulfillmentDraft,
    value: string,
  ) {
    setFulfillmentDraft((current) => Object.freeze({ ...current, [field]: value }));
  }

  function openWhatsapp() {
    if (whatsappNumber === null || items.length === 0) return;
    const lines = items.map(({ product, quantity, subtotal }) => {
      const presentation = product.presentation === undefined ? '' : ` (${product.presentation})`;
      const subtotalText =
        formatProductPrice({ amount: subtotal, currency: 'ARS' }) ?? 'Sin precio';
      return `• ${quantity} × ${product.name}${presentation}: ${subtotalText}`;
    });
    const customerLines = validation.value === null
      ? []
      : [
          '',
          `Modalidad: ${deliveryMethodLabel(validation.value.method)}`,
          `Nombre: ${validation.value.fullName}`,
          `Celular: ${validation.value.phone}`,
          `Dirección: ${validation.value.address}, ${validation.value.locality}, ${validation.value.province} (${validation.value.postalCode})`,
        ];
    const totalText = formatMinor(checkoutTotalMinor);
    const message = [
      'Hola, quiero consultar por este carrito de Shekinah:',
      '',
      ...lines,
      ...customerLines,
      '',
      `Total de referencia: ${totalText}`,
      quote.kind === 'manual'
        ? manualQuoteMessage(quote.tier)
        : 'Por favor, confirmen disponibilidad, pago y preparación.',
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
            <div className="cart-main-column">
              <div className="cart-items" aria-label="Productos del carrito">
                {items.map(({ product, quantity, unitPrice, subtotal }) => (
                  <article className="cart-line" key={product.id}>
                    <div className="cart-line-content">
                      <h2>
                        <AppLink navigate={navigate} to={product.path}>
                          {product.name}
                        </AppLink>
                      </h2>
                      <p className="cart-line-meta">
                        {formatProductPrice({ amount: unitPrice, currency: 'ARS' })}
                        {product.presentation === undefined ? null : ` · ${product.presentation}`}
                      </p>
                      <div className="cart-line-controls">
                        <label htmlFor={`quantity-${product.id}`}>
                          Cantidad
                          <input
                            id={`quantity-${product.id}`}
                            type="number"
                            min="1"
                            max={MAX_CART_QUANTITY}
                            inputMode="numeric"
                            value={quantity}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => {
                              const nextQuantity = Number.parseInt(event.currentTarget.value, 10);
                              if (Number.isInteger(nextQuantity)) setQuantity(product.id, nextQuantity);
                            }}
                          />
                        </label>
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
                    </div>
                    <p className="cart-line-subtotal">
                      {formatProductPrice({ amount: subtotal, currency: 'ARS' })}
                    </p>
                  </article>
                ))}
              </div>

              <div className="fulfillment-form" ref={formRef} aria-labelledby="fulfillment-title">
                <div>
                  <h2 id="fulfillment-title">Datos de entrega</h2>
                  <p>No se guardan en el carrito del navegador. Se registran sólo al iniciar el pedido.</p>
                </div>
                <label htmlFor="fulfillment-method">
                  Modalidad
                  <select
                    id="fulfillment-method"
                    value={fulfillmentDraft.method}
                    aria-invalid={showErrors && validation.errors.method !== undefined}
                    aria-describedby={showErrors && validation.errors.method !== undefined ? 'error-method' : undefined}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      updateField('method', event.currentTarget.value);
                    }}
                  >
                    <option value="coordinated_pickup">Retiro o entrega personal coordinada</option>
                    <option value="correo_argentino">Correo Argentino a todo el país</option>
                  </select>
                  <FieldError id="error-method" message={showErrors ? validation.errors.method : undefined} />
                </label>
                <div className="fulfillment-grid">
                  {fields.map((field) => {
                    const error = showErrors ? validation.errors[field.key] : undefined;
                    return (
                      <label htmlFor={`fulfillment-${field.key}`} key={field.key}>
                        {field.label}
                        <input
                          id={`fulfillment-${field.key}`}
                          value={fulfillmentDraft[field.key]}
                          autoComplete={field.autoComplete}
                          inputMode={field.inputMode}
                          aria-invalid={error !== undefined}
                          aria-describedby={error === undefined ? undefined : `error-${field.key}`}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            updateField(field.key, event.currentTarget.value);
                          }}
                        />
                        <FieldError id={`error-${field.key}`} message={error} />
                      </label>
                    );
                  })}
                </div>
                <FieldError id="error-form" message={showErrors ? validation.errors.form : undefined} />
              </div>
            </div>

            <aside className="cart-summary" aria-labelledby="cart-summary-title">
              <h2 id="cart-summary-title">Resumen</h2>
              <dl className="cart-totals">
                <div><dt>Productos</dt><dd>{formatMinor(productsTotalMinor)}</dd></div>
                <div><dt>Envío</dt><dd>{quote.kind === 'manual' ? 'A cotizar' : formatMinor(quote.shippingMinor)}</dd></div>
                <div className="cart-total"><dt>Total</dt><dd>{quote.kind === 'manual' ? 'Pendiente' : formatMinor(checkoutTotalMinor)}</dd></div>
              </dl>
              {fulfillmentDraft.method === 'correo_argentino' && quote.totalWeightGrams !== null ? (
                <p className="cart-disclaimer">Peso calculado: {formatWeight(quote.totalWeightGrams)}.</p>
              ) : null}
              {quote.kind === 'manual' ? (
                <p className="form-error" role="status">{manualQuoteMessage(quote.tier)}</p>
              ) : null}
              <p className="cart-disclaimer">
                El servidor recalcula productos, peso, envío y total cuando el Checkout Pro integrado está habilitado. La disponibilidad se confirma al preparar el pedido.
              </p>
              {commerceEnabled ? (
                <button
                  className="button button-primary"
                  type="button"
                  disabled={checkoutPending || quote.kind === 'manual'}
                  onClick={() => void startCheckout()}
                >
                  {checkoutPending ? 'Preparando pago…' : 'Pagar con Mercado Pago'}
                </button>
              ) : mercadoPagoPaymentLink !== null && quote.kind === 'online' ? (
                <>
                  <a
                    className="button button-primary"
                    href={mercadoPagoPaymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={prepareManualPayment}
                  >
                    Copiar {formatMinor(checkoutTotalMinor)} y abrir Mercado Pago
                  </a>
                  <p className="cart-configuration-note">
                    Cobro temporal manual: el enlace autorizado de Mercado Pago está configurado sin monto. El sitio copia el total para que lo pegues al abrir el Link de Pago. Después enviá el carrito por WhatsApp para asociar el pago y coordinar la entrega.
                  </p>
                  {manualPaymentNotice === '' ? null : (
                    <p className="cart-configuration-note" role="status">{manualPaymentNotice}</p>
                  )}
                </>
              ) : (
                <>
                  <button className="button button-primary" type="button" disabled>
                    Pagar con Mercado Pago
                  </button>
                  <p className="cart-configuration-note">
                    {quote.kind === 'manual'
                      ? 'El pago se habilita cuando el envío tenga un total definido. Solicitá la cotización por WhatsApp.'
                      : 'El pago estará disponible cuando el comercio esté habilitado.'}
                  </p>
                </>
              )}
              <button
                className="button button-secondary"
                type="button"
                disabled={whatsappNumber === null}
                onClick={openWhatsapp}
              >
                Enviar carrito por WhatsApp
              </button>
              {whatsappNumber === null ? (
                <p className="cart-configuration-note">WhatsApp estará disponible cuando se configure un número autorizado.</p>
              ) : null}
              <button className="text-button" type="button" onClick={clear}>Vaciar carrito</button>
              {checkoutError === '' ? null : <p className="form-error" role="alert">{checkoutError}</p>}
            </aside>
          </div>
        )}
      </div>
    </section>
  );

  function focusFirstError(errors: Readonly<Partial<Record<FulfillmentField, string>>>) {
    const first = ['method', 'fullName', 'phone', 'address', 'locality', 'province', 'postalCode']
      .find((field) => errors[field as FulfillmentField] !== undefined);
    if (first === undefined) return;
    formRef.current?.querySelector<HTMLElement>(`#fulfillment-${first}`)?.focus();
  }
}

function FieldError({ id, message }: Readonly<{ id: string; message: string | undefined }>) {
  return message === undefined ? null : <span className="field-error" id={id}>{message}</span>;
}

function formatMinor(value: number): string {
  return formatProductPrice({ amount: value / 100, currency: 'ARS' }) ?? '$ 0';
}

function formatManualPaymentAmount(valueMinor: number): string {
  const pesos = Math.trunc(valueMinor / 100);
  const cents = valueMinor % 100;
  return cents === 0 ? String(pesos) : `${pesos},${String(cents).padStart(2, '0')}`;
}

function formatWeight(grams: number): string {
  return grams >= 1_000 ? `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(grams / 1_000)} kg` : `${grams} g`;
}

function manualQuoteMessage(tier: string): string {
  return tier === 'manual_unknown_weight'
    ? 'Uno de los productos no tiene un peso determinístico. Solicitá la cotización por WhatsApp.'
    : 'El pedido supera los 5 kg. Solicitá la cotización por WhatsApp.';
}
