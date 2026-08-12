import { useId } from 'react';

import { trackAnalyticsEvent } from '../analytics/client';
import type { Product } from '../catalog/model';
import { getProductCartLimit, isProductAvailable } from './model';
import { useCart } from './CartContext';

type AddToCartButtonProps = Readonly<{
  className: string;
  product: Product;
  productNamedLabel?: boolean;
  unavailableLabel?: string;
}>;

export function AddToCartButton({
  className,
  product,
  productNamedLabel = false,
  unavailableLabel = 'Producto no disponible',
}: AddToCartButtonProps) {
  const { add, storedItems } = useCart();
  const statusId = useId();
  const quantity = storedItems.find(({ productId }) => productId === product.id)?.quantity ?? 0;
  const maximum = getProductCartLimit(product);
  const available = isProductAvailable(product);
  const maximumReached = available && quantity >= maximum;
  const status = quantity === 0
    ? null
    : `${product.name}: ${formatUnits(quantity)} en el carrito.${maximumReached ? ' Alcanzaste el máximo disponible.' : ''}`;
  const label = buttonLabel(quantity, available, maximumReached, unavailableLabel);
  const accessibleLabel = productNamedLabel
    ? namedButtonLabel(product.name, quantity, available, maximumReached, maximum)
    : undefined;

  return (
    <>
      <button
        className={className}
        type="button"
        disabled={!available || maximumReached}
        aria-describedby={status === null ? undefined : statusId}
        aria-label={accessibleLabel}
        onClick={() => {
          if (add(product.id)) {
            void trackAnalyticsEvent('cart_add', {
              path: product.path,
              productId: product.id,
            });
          }
        }}
      >
        {label}
      </button>
      {status === null ? null : (
        <p className="cart-configuration-note" id={statusId}>{status}</p>
      )}
    </>
  );
}

function buttonLabel(
  quantity: number,
  available: boolean,
  maximumReached: boolean,
  unavailableLabel: string,
): string {
  if (!available) return unavailableLabel;
  if (maximumReached) return 'Máximo en el carrito';
  return quantity === 0 ? 'Agregar al carrito' : 'Agregar otra unidad';
}

function namedButtonLabel(
  productName: string,
  quantity: number,
  available: boolean,
  maximumReached: boolean,
  maximum: number,
): string {
  if (!available) return `${productName} no está disponible`;
  if (maximumReached) return `${productName}: máximo de ${formatUnits(maximum)} en el carrito`;
  return quantity === 0
    ? `Agregar ${productName} al carrito`
    : `Agregar otra unidad de ${productName} al carrito`;
}

function formatUnits(quantity: number): string {
  return `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`;
}
