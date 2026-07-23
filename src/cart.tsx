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
          const existing = current.find((line) => line.productId === productId);
          if (!existing) return [...current, { productId, quantity: Math.max(1, Math.min(99, quantity)) }];
          return current.map((line) =>
            line.productId === productId
              ? { ...line, quantity: Math.min(99, line.quantity + Math.max(1, quantity)) }
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
            line.productId === productId ? { ...line, quantity: Math.max(1, Math.min(99, quantity)) } : line,
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
    <div className="quantity-control" aria-label="Cantidad">
      <button type="button" aria-label="Reducir cantidad" onClick={() => setQuantity(productId, value - 1)}>
        −
      </button>
      <input
        aria-label="Cantidad"
        inputMode="numeric"
        min="1"
        max="99"
        type="number"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setQuantity(productId, Number(event.currentTarget.value))}
      />
      <button type="button" aria-label="Aumentar cantidad" onClick={() => setQuantity(productId, value + 1)}>
        +
      </button>
    </div>
  );
}


function buildWhatsAppMessage(lines: CartLine[]): string {
  const resolved = lines
    .map((line) => ({ line, product: products.find((product) => product.id === line.productId) }))
    .filter((item): item is { line: CartLine; product: Product } => Boolean(item.product));
  const subtotal = resolved.reduce((total, item) => total + (item.product.price ?? 0) * item.line.quantity, 0);
  const detail = resolved.map((item) => {
    const lineTotal = item.product.price === null ? 'precio no disponible' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: item.product.currency ?? 'ARS' }).format(item.product.price * item.line.quantity);
    return `• ${item.product.name} × ${item.line.quantity} — ${lineTotal}`;
  });
  const subtotalText = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(subtotal);
  return [
    'Hola, Shekinah. Quiero consultar disponibilidad para:',
    '',
    ...detail,
    '',
    `Subtotal informativo: ${subtotalText}`,
    'Entiendo que el sitio no procesa el pago y que precio/stock deben confirmarse.',
  ].join('\n');
}

export function CartDialog() {
  const { lines, open, setOpen, remove, clear } = useCart();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const resolved = lines
    .map((line) => ({ line, product: products.find((product) => product.id === line.productId) }))
    .filter((item): item is { line: CartLine; product: Product } => Boolean(item.product));
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
            <p className="eyebrow">Consulta comercial</p>
            <h2 id="cart-title">Carrito</h2>
          </div>
          <button ref={closeRef} className="cart-close" type="button" aria-label="Cerrar carrito" onClick={() => setOpen(false)}>
            ×
          </button>
        </header>
        {resolved.length ? (
          <>
            <ul className="cart-lines">
              {resolved.map(({ line, product }) => (
                <li key={product.id}>
                  <div>
                    <a href={product.path}>{product.name}</a>
                    <span>{formatPrice(product) ?? 'Precio no disponible'}</span>
                  </div>
                  <QuantityControl productId={product.id} value={line.quantity} />
                  <button className="cart-remove" type="button" onClick={() => remove(product.id)}>
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
            <div className="cart-summary">
              <span>Subtotal informativo</span>
              <strong>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(subtotal)}</strong>
            </div>
            <p className="checkout-disclaimer">No se procesa el pago en este sitio. WhatsApp se abre únicamente al activar el enlace.</p>
            <div className="cart-actions">
              <a className="button" href={whatsapp} target="_blank" rel="noreferrer">
                Consultar por WhatsApp
              </a>
              <button className="button button--secondary" type="button" onClick={clear}>
                Vaciar carrito
              </button>
            </div>
          </>
        ) : (
          <div className="cart-empty">
            <p>El carrito está vacío.</p>
            <a className="button" href="/tienda/" onClick={() => setOpen(false)}>
              Ir a la tienda
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function CommerceDock() {
  const { lines, setOpen } = useCart();
  return (
    <div className="commerce-dock" aria-label="Acciones comerciales">
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Carrito ({lines.reduce((total, line) => total + line.quantity, 0)})
      </button>
      <a href={`https://wa.me/${verifiedStore.whatsappNumber}`} target="_blank" rel="noreferrer">
        WhatsApp
      </a>
    </div>
  );
}

