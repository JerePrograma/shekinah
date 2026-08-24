import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { trackAnalyticsEvent } from '../analytics/client';
import { formatProductPrice } from '../catalog/catalog';
import { useCart } from '../cart/CartContext';
import { getProductCartLimit } from '../cart/model';
import { createCheckoutPreference, createWhatsappOrder } from '../commerce/api';
import {
  getOrCreateCheckoutIdempotencyKey,
  getOrCreateWhatsappOrderIdempotencyKey,
  rememberCheckoutOrder,
} from '../commerce/checkout-session';
import {
  calculateShippingQuote,
  deliveryMethodLabel,
  requiresDeliveryAddress,
  validateFulfillment,
} from '../commerce/fulfillment';
import { formatOrderNumber } from '../commerce/contracts';
import type { WhatsappOrderResponse } from '../commerce/contracts';
import type {
  CheckoutFulfillment,
  FulfillmentDraft,
  FulfillmentField,
} from '../commerce/fulfillment';
import { getAuthorizedWhatsappNumber, isCommerceClientEnabled } from '../commerce/env';
import { refreshRuntimeCatalog } from '../data/runtime-catalog';
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

type WhatsappOrderResult = Readonly<{
  order: WhatsappOrderResponse;
  fulfillment: CheckoutFulfillment;
  manualQuoteTier: string | null;
}>;

export function CartPage({ navigate }: Readonly<{ navigate: Navigate }>) {
  const { clear, items, itemCount, liveMessage, remove, setQuantity, total } = useCart();
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [whatsappOrderPending, setWhatsappOrderPending] = useState(false);
  const [whatsappOrderResult, setWhatsappOrderResult] =
    useState<WhatsappOrderResult | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [fulfillmentDraft, setFulfillmentDraft] = useState<FulfillmentDraft>(INITIAL_FULFILLMENT);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [quantityDrafts, setQuantityDrafts] = useState<Readonly<Record<string, string>>>({});
  const [quantityErrors, setQuantityErrors] = useState<Readonly<Record<string, string>>>({});
  const [confirmingClear, setConfirmingClear] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef(new Map<string, HTMLElement>());
  const emptyStateRef = useRef<HTMLHeadingElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const cancelClearRef = useRef<HTMLButtonElement>(null);
  const whatsappResultTitleRef = useRef<HTMLHeadingElement>(null);
  const whatsappOrderPendingRef = useRef(false);
  const whatsappNumber = getAuthorizedWhatsappNumber();
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
  const cartOperationPending = checkoutPending || whatsappOrderPending;
  const cartHasAvailabilityConflict = items.some(({ product, quantity }) =>
    quantity > getProductCartLimit(product));
  const addressRequired = requiresDeliveryAddress(fulfillmentDraft.method);
  const whatsappReady = validation.value !== null && whatsappConsent;
  const whatsappUrl = whatsappOrderResult === null || whatsappNumber === null
    ? null
    : buildWhatsappUrl(whatsappNumber, whatsappOrderResult);

  useEffect(() => {
    setQuantityDrafts((current) => {
      const next: Record<string, string> = {};
      for (const { product, quantity } of items) {
        if (Object.hasOwn(current, product.id)) next[product.id] = String(quantity);
      }
      return Object.freeze(next);
    });
  }, [items]);

  useEffect(() => {
    if (!confirmingClear) return;
    cancelClearRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setConfirmingClear(false);
      clearButtonRef.current?.focus();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [confirmingClear]);

  useEffect(() => {
    if (!confirmingClear || items.length !== 0) return;
    setConfirmingClear(false);
    window.requestAnimationFrame(() => emptyStateRef.current?.focus());
  }, [confirmingClear, items.length]);

  useEffect(() => {
    if (whatsappOrderResult === null) return;
    window.requestAnimationFrame(() => whatsappResultTitleRef.current?.focus());
  }, [whatsappOrderResult]);

  async function startCheckout() {
    if (items.length === 0 || cartOperationPending || !commerceEnabled) return;
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
    setConfirmingClear(false);
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
      const errorCode = commerceErrorCode(error);
      if (
        errorCode !== null &&
        [
          'CATALOG_VERSION_CONFLICT',
          'CATALOG_VERSION_REQUIRED',
          'INSUFFICIENT_STOCK',
          'PRODUCT_UNAVAILABLE',
          'MERCADO_LIBRE_CATALOG_STALE',
        ].includes(errorCode)
      ) {
        await refreshRuntimeCatalog().catch(() => undefined);
      }
      setCheckoutError(
        errorCode === 'CATALOG_VERSION_CONFLICT' && error instanceof Error
          ? `${error.message} Revisá el precio actualizado y volvé a presionar Pagar con Mercado Pago.`
          : error instanceof Error ? error.message : 'No se pudo iniciar el pago.',
      );
      setCheckoutPending(false);
    }
  }

  function updateField(
    field: keyof FulfillmentDraft,
    value: string,
  ) {
    setWhatsappOrderResult(null);
    setWhatsappConsent(false);
    setFulfillmentDraft((current) => field === 'method' && value === 'coordinated_pickup'
      ? Object.freeze({
          ...current,
          method: 'coordinated_pickup',
          address: '',
          locality: '',
          province: '',
          postalCode: '',
        })
      : Object.freeze({ ...current, [field]: value }));
  }

  async function registerWhatsappOrder(): Promise<void> {
    if (
      whatsappNumber === null ||
      items.length === 0 ||
      whatsappOrderResult !== null ||
      whatsappOrderPendingRef.current ||
      checkoutPending ||
      !whatsappConsent
    ) return;

    if (validation.value === null) {
      setShowErrors(true);
      setCheckoutError('Completá o corregí todos los datos antes de continuar por WhatsApp.');
      focusFirstError(validation.errors);
      return;
    }

    const fulfillment = validation.value;
    whatsappOrderPendingRef.current = true;
    setWhatsappOrderPending(true);
    setConfirmingClear(false);
    setCheckoutError('');
    try {
      const idempotencyKey = await getOrCreateWhatsappOrderIdempotencyKey(
        items,
        fulfillment,
      );
      const order = await createWhatsappOrder(items, idempotencyKey, fulfillment, true);
      setWhatsappOrderResult(Object.freeze({
        order,
        fulfillment,
        manualQuoteTier: quote.kind === 'manual' ? quote.tier : null,
      }));
      void refreshRuntimeCatalog().catch(() => undefined);
    } catch (error: unknown) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : 'No pudimos registrar el pedido. Revisá el carrito e intentá nuevamente.',
      );
    } finally {
      whatsappOrderPendingRef.current = false;
      setWhatsappOrderPending(false);
    }
  }

  function updateQuantity(productId: string, rawValue: string, maximum: number) {
    setWhatsappOrderResult(null);
    setWhatsappConsent(false);
    setQuantityDrafts((current) => Object.freeze({ ...current, [productId]: rawValue }));
    const nextQuantity = Number(rawValue);
    if (!Number.isInteger(nextQuantity) || nextQuantity < 1 || nextQuantity > maximum) {
      setQuantityErrors((current) => Object.freeze({
        ...current,
        [productId]: maximum === 1
          ? 'Sólo hay 1 unidad disponible. Para quitarla, usá Eliminar.'
          : `Ingresá una cantidad entre 1 y ${maximum}. Para quitar el producto, usá Eliminar.`,
      }));
      return;
    }
    setQuantityErrors((current) => withoutKey(current, productId));
    setQuantityDrafts((current) => Object.freeze({ ...current, [productId]: String(nextQuantity) }));
    setQuantity(productId, nextQuantity);
  }

  function changeQuantity(productId: string, nextQuantity: number, maximum: number) {
    if (nextQuantity < 1 || nextQuantity > maximum) return;
    setWhatsappOrderResult(null);
    setWhatsappConsent(false);
    setQuantityErrors((current) => withoutKey(current, productId));
    setQuantityDrafts((current) => Object.freeze({ ...current, [productId]: String(nextQuantity) }));
    setQuantity(productId, nextQuantity);
    document.getElementById(`quantity-${productId}`)?.focus();
  }

  function removeProduct(productId: string) {
    const currentIndex = items.findIndex(({ product }) => product.id === productId);
    const focusTargetId = items[currentIndex + 1]?.product.id ?? items[currentIndex - 1]?.product.id;
    setWhatsappOrderResult(null);
    setWhatsappConsent(false);
    remove(productId);
    setQuantityDrafts((current) => withoutKey(current, productId));
    setQuantityErrors((current) => withoutKey(current, productId));
    void trackAnalyticsEvent('cart_remove', {
      path: appPaths.cart,
      productId,
    });
    window.requestAnimationFrame(() => {
      if (focusTargetId === undefined) {
        emptyStateRef.current?.focus();
      } else {
        lineRefs.current.get(focusTargetId)?.focus();
      }
    });
  }

  function clearCart() {
    if (cartOperationPending) return;
    clear();
    setConfirmingClear(false);
    setCheckoutError('');
    setWhatsappOrderResult(null);
    setQuantityDrafts({});
    setQuantityErrors({});
    setFulfillmentDraft(INITIAL_FULFILLMENT);
    setWhatsappConsent(false);
    setShowErrors(false);
    window.requestAnimationFrame(() => emptyStateRef.current?.focus());
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
          {liveMessage === '' ? null : (
            <p className="cart-context-feedback">{liveMessage}</p>
          )}
        </div>

        {whatsappOrderResult === null || whatsappUrl === null ? null : (
          <div className="cart-whatsapp-result">
            <div>
              <h2 ref={whatsappResultTitleRef} tabIndex={-1}>Pedido registrado</h2>
              <p role="status" aria-live="polite">
                El pedido {formatOrderNumber(whatsappOrderResult.order.orderId)} quedó pendiente de aprobación y sus unidades fueron reservadas por 24 horas.
              </p>
            </div>
            <a
              className="button button-primary"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                void trackAnalyticsEvent('whatsapp_open', { path: appPaths.cart });
              }}
            >
              Abrir WhatsApp
            </a>
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty-state">
            <div>
              <h2 ref={emptyStateRef} tabIndex={-1}>El carrito está vacío</h2>
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
                {items.map(({ product, quantity, unitPrice, subtotal }) => {
                  const maximum = getProductCartLimit(product);
                  const availabilityConflict = quantity > maximum;
                  const quantityError = quantityErrors[product.id];
                  return (
                  <article
                    className="cart-line"
                    key={product.id}
                    ref={(element) => {
                      if (element === null) lineRefs.current.delete(product.id);
                      else lineRefs.current.set(product.id, element);
                    }}
                    tabIndex={-1}
                  >
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
                      {availabilityConflict ? (
                        <p className="form-error" role="status">
                          {maximum === 0
                            ? product.commerce?.availabilityState === 'updating'
                              ? 'Estamos actualizando la disponibilidad. El producto se conserva en tu carrito, pero no se puede reservar todavía.'
                              : 'Este producto ya no está disponible. Eliminalo del carrito para continuar.'
                            : `La cantidad disponible cambió a ${maximum}. Elegí una cantidad válida para continuar.`}
                        </p>
                      ) : null}
                      <div className="cart-line-controls">
                        <button
                          className="quantity-button"
                          type="button"
                          aria-label={`Reducir cantidad de ${product.name}`}
                          disabled={cartOperationPending || quantity <= 1 || maximum === 0}
                          onClick={() => changeQuantity(product.id, quantity - 1, maximum)}
                        >
                          −
                        </button>
                        <label htmlFor={`quantity-${product.id}`}>
                          Cantidad
                          <input
                            id={`quantity-${product.id}`}
                            type="number"
                            min="1"
                            max={maximum}
                            inputMode="numeric"
                            disabled={cartOperationPending || maximum === 0}
                            aria-label={`Cantidad de ${product.name}`}
                            value={quantityDrafts[product.id] ?? String(quantity)}
                            aria-invalid={quantityError === undefined ? undefined : true}
                            aria-describedby={quantityError === undefined ? undefined : `quantity-error-${product.id}`}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => {
                              updateQuantity(product.id, event.currentTarget.value, maximum);
                            }}
                          />
                          {quantityError === undefined ? null : (
                            <span className="field-error" id={`quantity-error-${product.id}`}>{quantityError}</span>
                          )}
                        </label>
                        <button
                          className="quantity-button"
                          type="button"
                          aria-label={`Aumentar cantidad de ${product.name}`}
                          disabled={cartOperationPending || quantity >= maximum}
                          onClick={() => changeQuantity(product.id, quantity + 1, maximum)}
                        >
                          +
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          disabled={cartOperationPending}
                          aria-label={`Eliminar ${product.name} del carrito`}
                          onClick={() => {
                            removeProduct(product.id);
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
                  );
                })}
              </div>

              <div className="fulfillment-form" ref={formRef} aria-labelledby="fulfillment-title">
                <div>
                  <h2 id="fulfillment-title">Datos de entrega</h2>
                  <p>Nombre y celular son obligatorios. El domicilio se solicita sólo para Correo Argentino. Estos datos no se guardan en el carrito del navegador.</p>
                </div>
                <label htmlFor="fulfillment-method">
                  Modalidad
                  <select
                    id="fulfillment-method"
                    disabled={cartOperationPending}
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
                  {fields.filter((field) => addressRequired || field.key === 'fullName' || field.key === 'phone').map((field) => {
                    const error = showErrors ? validation.errors[field.key] : undefined;
                    return (
                      <label htmlFor={`fulfillment-${field.key}`} key={field.key}>
                        {field.label}
                        <input
                          id={`fulfillment-${field.key}`}
                          value={fulfillmentDraft[field.key]}
                          autoComplete={field.autoComplete}
                          inputMode={field.inputMode}
                          disabled={cartOperationPending}
                          required
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

            <aside className="cart-summary" aria-labelledby="cart-summary-title" aria-busy={cartOperationPending}>
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
                El servidor vuelve a validar productos, precios, disponibilidad, envío y total antes de registrar el pedido o iniciar el pago integrado.
              </p>
              {commerceEnabled ? (
                <button
                  className="button button-primary"
                  type="button"
                  disabled={cartOperationPending || quote.kind === 'manual' || cartHasAvailabilityConflict}
                  onClick={() => void startCheckout()}
                >
                  {checkoutPending ? 'Preparando pago…' : 'Pagar con Mercado Pago'}
                </button>
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
              {whatsappOrderResult === null ? (
                <>
                  <label className="whatsapp-consent" htmlFor="whatsapp-consent">
                    <input
                      id="whatsapp-consent"
                      type="checkbox"
                      checked={whatsappConsent}
                      disabled={cartOperationPending}
                      required
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        setWhatsappConsent(event.currentTarget.checked);
                        setCheckoutError('');
                      }}
                    />
                    <span>Acepto compartir los datos ingresados mediante WhatsApp para gestionar este pedido.</span>
                  </label>
                  <p className="cart-configuration-note" id="whatsapp-readiness" aria-live="polite">
                    {validation.value === null
                      ? 'Completá los datos obligatorios para habilitar el pedido por WhatsApp.'
                      : whatsappConsent
                        ? 'Los datos están completos y el consentimiento fue aceptado.'
                        : 'Aceptá compartir los datos para habilitar el pedido por WhatsApp.'}
                  </p>
                  <button
                    className="button button-secondary"
                    type="button"
                    aria-describedby="whatsapp-readiness"
                    disabled={cartOperationPending || whatsappNumber === null || !whatsappReady || cartHasAvailabilityConflict}
                    onClick={() => void registerWhatsappOrder()}
                  >
                    {whatsappOrderPending ? 'Creando pedido…' : 'Pedir por WhatsApp'}
                  </button>
                </>
              ) : null}
              {whatsappNumber === null ? (
                <p className="cart-configuration-note">WhatsApp estará disponible cuando se configure un número autorizado.</p>
              ) : null}
              {checkoutPending ? (
                <p className="cart-configuration-note" role="status">
                  Estamos preparando el pago. Cuando esté listo, te redirigiremos a Mercado Pago.
                </p>
              ) : null}
              {whatsappOrderPending ? (
                <p className="cart-configuration-note" role="status">
                  Estamos registrando el pedido y reservando las unidades antes de abrir WhatsApp.
                </p>
              ) : null}
              <button
                className="text-button"
                type="button"
                ref={clearButtonRef}
                disabled={cartOperationPending}
                onClick={() => setConfirmingClear(true)}
              >
                Vaciar carrito
              </button>
              {confirmingClear ? (
                <div
                  className="cart-confirmation"
                  role="alertdialog"
                  aria-labelledby="clear-cart-title"
                  aria-describedby="clear-cart-description"
                >
                  <h3 id="clear-cart-title">Vaciar el carrito</h3>
                  <p id="clear-cart-description">
                    Se eliminarán {itemCount} {itemCount === 1 ? 'unidad' : 'unidades'} y los datos de entrega ingresados. Esta acción no se puede deshacer.
                  </p>
                  <div className="cart-confirmation-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      ref={cancelClearRef}
                      disabled={cartOperationPending}
                      onClick={() => {
                        setConfirmingClear(false);
                        clearButtonRef.current?.focus();
                      }}
                    >
                      Seguir con el carrito
                    </button>
                    <button
                      className="button button-danger"
                      type="button"
                      disabled={cartOperationPending}
                      onClick={clearCart}
                    >
                      Sí, vaciar carrito
                    </button>
                  </div>
                </div>
              ) : null}
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

function commerceErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as Readonly<{ code?: unknown }>).code;
  return typeof code === 'string' ? code : null;
}

function FieldError({ id, message }: Readonly<{ id: string; message: string | undefined }>) {
  return message === undefined ? null : <span className="field-error" id={id}>{message}</span>;
}

function formatMinor(value: number): string {
  return formatProductPrice({ amount: value / 100, currency: 'ARS' }) ?? '$ 0';
}

function formatWeight(grams: number): string {
  return grams >= 1_000 ? `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(grams / 1_000)} kg` : `${grams} g`;
}

function manualQuoteMessage(tier: string): string {
  return tier === 'manual_unknown_weight'
    ? 'Uno de los productos no tiene un peso determinístico. Solicitá la cotización por WhatsApp.'
    : 'El pedido supera los 5 kg. Solicitá la cotización por WhatsApp.';
}

function buildWhatsappUrl(
  whatsappNumber: string,
  result: WhatsappOrderResult,
): string {
  const lines = result.order.items.map((item) => {
    const presentation = item.presentation === undefined ? '' : ` (${item.presentation})`;
    return `• ${item.quantity} × ${item.name}${presentation}: ${formatMinor(item.subtotalMinor)}`;
  });
  const customerLines = [
    '',
    `Modalidad: ${deliveryMethodLabel(result.fulfillment.method)}`,
    `Nombre: ${result.fulfillment.fullName}`,
    `Celular: ${result.fulfillment.phone}`,
    ...(requiresDeliveryAddress(result.fulfillment.method)
      ? [`Dirección: ${result.fulfillment.address}, ${result.fulfillment.locality}, ${result.fulfillment.province} (${result.fulfillment.postalCode})`]
      : []),
  ];
  const message = [
    `Hola, quiero consultar por el pedido ${formatOrderNumber(result.order.orderId)} de Shekinah:`,
    `ID interno: ${result.order.orderId}`,
    '',
    ...lines,
    ...customerLines,
    '',
    `Total registrado: ${formatMinor(result.order.totalMinor)}`,
    result.manualQuoteTier === null
      ? 'Quedo a la espera de la confirmación y coordinación del pedido.'
      : manualQuoteMessage(result.manualQuoteTier),
  ].join('\n');
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function withoutKey<T>(
  value: Readonly<Record<string, T>>,
  key: string,
): Readonly<Record<string, T>> {
  const next = { ...value };
  delete next[key];
  return Object.freeze(next);
}
