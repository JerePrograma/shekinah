import { formatDuxStockQuantity } from './catalog';
import type { Product } from './model';

export function DuxStock({ product }: Readonly<{ product: Product }>) {
  const inventory = product.commerce;
  if (inventory?.source !== 'dux') return null;
  const stock = inventory.observedStock;
  if (stock === undefined) return <p>Stock Dux pendiente de verificación.</p>;
  return <section className="admin-context-note" aria-label="Existencias en Dux">
    <h2>Stock en Dux</h2>
    <dl className="product-facts">
      <div><dt>Stock real</dt><dd>{formatDuxStockQuantity(stock.real)}</dd></div>
      <div><dt>Reservado</dt><dd>{formatDuxStockQuantity(stock.reserved)}</dd></div>
      <div><dt>Disponible</dt><dd>{formatDuxStockQuantity(stock.available)}</dd></div>
    </dl>
    <p>Última lectura: <time dateTime={inventory.stockSyncedAt ?? inventory.syncedAt}>{new Date(inventory.stockSyncedAt ?? inventory.syncedAt).toLocaleString('es-AR')}</time>.</p>
    {inventory.depositName === undefined ? null : <p>Depósito: {inventory.depositName}.</p>}
    {inventory.availabilityState === 'updating' || inventory.availabilityState === 'unavailable'
      ? <p>Esta lectura necesita actualizarse para confirmar las existencias actuales.</p> : null}
    {!inventory.checkoutEligible ? <p>Las compras todavía no están habilitadas.</p> : null}
  </section>;
}
