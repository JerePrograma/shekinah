import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { formatPrice, products, verifiedStore, type Product } from './catalog';
import { toSitePath } from './content';

interface CartLine {
  productId: string;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const STORAGE_KEY = 'shekinah-cart:v1';
const CartContext = createContext<CartContextValue | null>(null);

function sanitizeLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const validIds = new Set(products.map((product) => product.id));
  const merged = new Map<string, number>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as Record<string, unknown>;
    if (typeof record.productId !== 'string' || !validIds.has(record.productId)) continue;
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(record.quantity))));
    if (!Number.isFinite(quantity)) continue;
    merged.set(record.productId, Math.min(99, (merged.get(record.productId) ?? 0) + quantity));
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { version?: unknown; lines?: unknown };
        if (parsed.version === 1) setLines(sanitizeLines(parsed.lines));
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, lines }));
  }, [lines, loaded]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      add(productId, quantity = 1) {
        setLines((current) => {
          const safeQuantity = Math.max(1, Math.min(99, Math.floor(quantity)));
          const existing = current.find((line) => line.productId === productId);
          if (!existing) return [...current, { productId, quantity: safeQuantity }];
          return current.map((line) =>
            line.productId === productId
              ? { ...line, quantity: Math.min(99, line.quantity + safeQuantity) }
              : line,
          );
        });
        setOpen(true);
      },
      setQuantity(productId, quantity) {
        if (quantity <= 0) {
          setLines((current) => current.filter((line) => line.productId !== productId));
          return;
        }
        setLines((current) =>
          current.map((line) =>
            line.productId === productId
              ? { ...line, quantity: Math.max(1, Math.min(99, Math.floor(quantity))) }
              : line,
          ),
        );
      },
      remove(productId) {
        setLines((current) => current.filter((line) => line.productId !== productId));
      },
      clear() {
        setLines([]);
      },
      open,
      setOpen,
    }),
    [lines, open],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('El carrito debe usarse dentro de CartProvider.');
  return value;
}

export function quantityLabel(lines: CartLine[]): string {
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  return count === 1 ? '1 producto' : `${count} productos`;
}

export function QuantityControl({ productId, value }: { productId: string; value: number }) {
  const { setQuantity } = useCart();
  return (
    <div className="quantity-control" aria-label="Cantidad del producto">
      <button type="button" aria-label="Reducir cantidad" onClick={() => setQuantity(productId, value - 1)}>−</button>
      <input
        aria-label="Cantidad"
        inputMode="numeric"
        min="1"
        max="99"
        type="number"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setQuantity(productId, Number(event.currentTarget.value))}
      />
      <button type="button" aria-label="Aumentar cantidad" onClick={() => setQuantity(productId, value + 1)}>+</button>
    </div>
  );
}

function resolveLines(lines: CartLine[]): Array<{ line: CartLine; product: Product }> {
  return lines
    .map((line) => ({ line, product: products.find((product) => product.id === line.productId) }))
    .filter((item): item is { line: CartLine; product: Product } => Boolean(item.product));
}

function buildWhatsAppMessage(lines: CartLine[]): string {
  const resolved = resolveLines(lines);
  const knownSubtotal = resolved.reduce(
    (total, item) => total + (item.product.price ?? 0) * item.line.quantity,
    0,
  );
  const detail = resolved.map((item) => {
    const lineTotal = item.product.price === null
      ? 'precio a confirmar'
      : new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: item.product.currency ?? 'ARS',
        }).format(item.product.price * item.line.quantity);
    return `• ${item.product.name} × ${item.line.quantity} — ${lineTotal}`;
  });
  const subtotalText = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(knownSubtotal);
  return [
    'Hola, Shekinah. Quiero consultar disponibilidad para:',
    '',
    ...detail,
    '',
    `Subtotal informativo de productos con precio publicado: ${subtotalText}`,
    'Necesito confirmar precio final, disponibilidad y forma de entrega.',
  ].join('\n');
}

export function CartDialog() {
  const { lines, open, setOpen, remove, clear } = useCart();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const resolved = resolveLines(lines);
  const subtotal = resolved.reduce((total, item) => total + (item.product.price ?? 0) * item.line.quantity, 0);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('has-open-overlay');
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('has-open-overlay');
      previousFocus.current?.focus();
    };
  }, [open, setOpen]);

  if (!open) return null;
  const whatsapp = `https://wa.me/${verifiedStore.whatsappNumber}?text=${encodeURIComponent(buildWhatsAppMessage(lines))}`;

  const clearCart = () => {
    if (window.confirm('¿Querés eliminar todos los productos del carrito?')) clear();
  };

  return (
    <div className="cart-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="cart-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        onMouseDown={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Revisá antes de consultar</p>
            <h2 id="cart-title">Carrito</h2>
          </div>
          <button ref={closeRef} className="cart-close" type="button" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        </header>
        {resolved.length ? (
          <>
            <ul className="cart-lines">
              {resolved.map(({ line, product }) => (
                <li key={product.id}>
                  <div>
                    <a href={toSitePath(product.path)}>{product.name}</a>
                    <span>{formatPrice(product) ?? 'Precio a confirmar'}</span>
                  </div>
                  <QuantityControl productId={product.id} value={line.quantity} />
                  <button className="cart-remove" type="button" onClick={() => remove(product.id)}>Eliminar producto</button>
                </li>
              ))}
            </ul>
            <div className="cart-summary">
              <span>Subtotal informativo</span>
              <strong>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(subtotal)}</strong>
            </div>
            <p className="checkout-disclaimer">El precio y la disponibilidad se confirman por WhatsApp. Este sitio no procesa pagos.</p>
            <div className="cart-actions">
              <a className="button" href={whatsapp} target="_blank" rel="noreferrer">Consultar por WhatsApp</a>
              <button className="button button--secondary" type="button" onClick={clearCart}>Vaciar carrito</button>
            </div>
          </>
        ) : (
          <div className="cart-empty">
            <p>El carrito está vacío.</p>
            <a className="button" href={toSitePath('/tienda/')} onClick={() => setOpen(false)}>Volver a productos</a>
          </div>
        )}
      </div>
    </div>
  );
}
