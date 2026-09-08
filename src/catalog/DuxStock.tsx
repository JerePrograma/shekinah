import { formatDuxStockQuantity } from './catalog';
import { useEffect, useState } from 'react';
import type { Product } from './model';

export function DuxStock({ product }: Readonly<{ product: Product }>) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <DuxStockDetails product={product} now={now} />;
}

export function DuxStockDetails({ product, now }: Readonly<{ product: Product; now: number }>) {
  const inventory = product.commerce;
  if (inventory?.source !== 'dux') return null;
  const stock = inventory.observedStock;
  const rows = inventory.warehouseStocks;
  const readAt = inventory.stockSyncedAt;
  const stale = readAt === undefined || now - Date.parse(readAt) > 15 * 60 * 1000;
  const quantity = (value: number | null | undefined) => value == null ? 'No informado' : formatDuxStockQuantity(value);
  return <section className="admin-context-note" aria-label="Existencias en Dux">
    <h2>Stock en Dux</h2>
    {rows !== undefined && rows.length > 1 ? <p>Existencias por depósito y variante. Dux no permite confirmar un total comparable.</p> : null}
    {(rows?.length ? rows : [{...stock, depositName: inventory.depositName, variantId: null, size: null, color: null}]).map((row, index) => <div key={index}>
      {row.depositName === undefined ? null : <p>Depósito: {row.depositName}.{row.variantId === null ? '' : ` Variante ${row.variantId}.`} {[row.size, row.color].filter(Boolean).join(' · ')}</p>}
      <dl className="product-facts">
        <div><dt><strong>Disponible</strong></dt><dd><strong>{quantity(row.available)}</strong></dd></div>
        <div><dt>Stock real</dt><dd>{quantity(row.real)}</dd></div>
        <div><dt>Reservado</dt><dd>{quantity(row.reserved)}</dd></div>
      </dl>
    </div>)}
    {readAt === undefined ? <p>Fecha de lectura del inventario no disponible.</p> : <p>Última lectura: <time dateTime={readAt}>{new Date(readAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })}</time> (Argentina).</p>}
    {stale ? <p role="status">El stock supera el objetivo de 15 minutos o no tiene una fecha verificable. Las existencias pueden haber cambiado.</p> : null}
    {inventory.availabilityState === 'updating'
      ? <p>Esta lectura necesita actualizarse para confirmar las existencias actuales.</p> : null}
    {!inventory.checkoutEligible ? <p>Las compras todavía no están habilitadas.</p> : null}
  </section>;
}
