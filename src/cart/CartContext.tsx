import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import {
  isRuntimeCatalogResolved,
  useRuntimeCatalogProducts,
} from '../data/runtime-catalog';
import {
  addCartItem,
  CART_STORAGE_KEY,
  clearCart,
  emptyCart,
  getProductCartLimit,
  isProductAvailable,
  parseStoredCartJson,
  removeCartItem,
  serializeCart,
  setCartItemQuantity,
  summarizeCart,
} from './model';
import type { CartItem, StoredCart } from './model';

export type CartContextValue = Readonly<{
  add: (productId: string, quantity?: number) => boolean;
  clear: () => void;
  items: readonly CartItem[];
  itemCount: number;
  liveMessage: string;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  storedItems: StoredCart['items'];
  total: number;
}>;

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: PropsWithChildren) {
  const products = useRuntimeCatalogProducts();
  const initiallyResolved = useRef(isRuntimeCatalogResolved()).current;
  const pendingStoredCart = useRef(readStoredCartJson());
  const initialCart = useMemo(
    () => initiallyResolved
      ? parseStoredCartJson(pendingStoredCart.current, products)
      : emptyCart(),
    // El estado inicial se calcula una sola vez. Si el catálogo todavía no está
    // resuelto, la hidratación diferida conserva el JSON sin sobrescribirlo.
    [],
  );
  const [cart, setCart] = useState<StoredCart>(initialCart);
  const cartRef = useRef(initialCart);
  const [hydrated, setHydrated] = useState(initiallyResolved);
  const hydratedRef = useRef(initiallyResolved);
  const [liveAnnouncement, setLiveAnnouncement] = useState({
    id: 0,
    message: '',
  });
  const skipNextPersistence = useRef(false);

  const announce = useCallback((message: string) => {
    setLiveAnnouncement((current) => ({
      id: current.id + 1,
      message,
    }));
  }, []);

  const availableProducts = useMemo(
    () => new Map(
      products
        .filter(isProductAvailable)
        .map((product) => [product.id, product]),
    ),
    [products],
  );

  useEffect(() => {
    if (!hydratedRef.current) {
      if (!isRuntimeCatalogResolved()) return;
      const normalized = parseStoredCartJson(
        pendingStoredCart.current,
        products,
      );
      cartRef.current = normalized;
      hydratedRef.current = true;
      setCart(normalized);
      setHydrated(true);
      return;
    }

    const normalized = parseStoredCartJson(
      serializeCart(cartRef.current),
      products,
    );
    if (serializeCart(normalized) === serializeCart(cartRef.current)) return;
    cartRef.current = normalized;
    setCart(normalized);
    const itemCount = normalized.items.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    announce(
      `El carrito se ajustó al stock y la disponibilidad actuales. Ahora contiene ${formatUnits(itemCount)}.`,
    );
  }, [announce, products]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextPersistence.current) {
      skipNextPersistence.current = false;
      return;
    }
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(cart));
    } catch {
      announce(
        'El carrito cambió, pero no se pudo guardar en este navegador. Mantené esta pestaña abierta mientras completás la compra.',
      );
    }
  }, [announce, cart, hydrated]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CART_STORAGE_KEY) return;
      pendingStoredCart.current = event.newValue;
      if (!hydratedRef.current || !isRuntimeCatalogResolved()) return;
      const incoming = parseStoredCartJson(event.newValue, products);
      if (serializeCart(incoming) === serializeCart(cartRef.current)) return;
      cartRef.current = incoming;
      skipNextPersistence.current = true;
      setCart(incoming);
      announce('El carrito se actualizó desde otra pestaña.');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [announce, products]);

  const summary = useMemo(
    () => summarizeCart(cart, products),
    [cart, products],
  );

  const add = useCallback((productId: string, quantity = 1): boolean => {
    const product = availableProducts.get(productId);
    if (product === undefined) {
      announce('No se pudo agregar el producto.');
      return false;
    }
    const maximum = getProductCartLimit(product);
    const current = cartRef.current;
    const next = addCartItem(current, productId, quantity, maximum);
    const changed = next !== current;
    if (changed) {
      cartRef.current = next;
      setCart(next);
    }
    const nextQuantity = next.items.find(
      (item) => item.productId === productId,
    )?.quantity ?? 0;
    announce(
      changed
        ? `${product.name} se agregó al carrito. Ahora hay ${formatUnits(nextQuantity)} de este producto.`
        : `${product.name} ya alcanzó el máximo de ${formatUnits(maximum)} en el carrito.`,
    );
    return changed;
  }, [announce, availableProducts]);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    const product = availableProducts.get(productId);
    if (product === undefined) {
      announce('El producto ya no está disponible.');
      return;
    }
    const current = cartRef.current;
    const next = setCartItemQuantity(
      current,
      productId,
      quantity,
      getProductCartLimit(product),
    );
    if (next === current) {
      announce(
        `No se cambió la cantidad de ${product.name}: ingresá un valor entre 1 y ${getProductCartLimit(product)}.`,
      );
      return;
    }
    cartRef.current = next;
    setCart(next);
    const nextQuantity = next.items.find(
      (item) => item.productId === productId,
    )?.quantity ?? quantity;
    announce(
      `Cantidad de ${product.name} actualizada a ${formatUnits(nextQuantity)}.`,
    );
  }, [announce, availableProducts]);

  const remove = useCallback((productId: string) => {
    const current = cartRef.current;
    const product = availableProducts.get(productId);
    const next = removeCartItem(current, productId);
    if (next === current) return;
    cartRef.current = next;
    setCart(next);
    announce(
      product === undefined
        ? 'Producto eliminado del carrito.'
        : `${product.name} se eliminó del carrito.`,
    );
  }, [announce, availableProducts]);

  const clear = useCallback(() => {
    const current = cartRef.current;
    const itemCount = current.items.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    const next = clearCart(current);
    if (next === current) return;
    cartRef.current = next;
    setCart(next);
    announce(`Carrito vaciado. Se eliminaron ${formatUnits(itemCount)}.`);
  }, [announce]);

  const value = useMemo<CartContextValue>(() => ({
    add,
    clear,
    items: summary.items,
    itemCount: summary.itemCount,
    liveMessage: liveAnnouncement.message,
    remove,
    setQuantity,
    storedItems: cart.items,
    total: summary.total,
  }), [
    add,
    cart.items,
    clear,
    liveAnnouncement.message,
    remove,
    setQuantity,
    summary,
  ]);

  return (
    <CartContext.Provider value={value}>
      {children}
      <div
        className="visually-hidden"
        aria-live="polite"
        aria-atomic="true"
      >
        <span key={liveAnnouncement.id}>{liveAnnouncement.message}</span>
      </div>
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (value === null) {
    throw new Error('useCart debe usarse dentro de CartProvider.');
  }
  return value;
}

function readStoredCartJson(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return null;
  }
}

function formatUnits(quantity: number): string {
  return `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`;
}
