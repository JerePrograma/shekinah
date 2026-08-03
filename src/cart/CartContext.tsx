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

import { authorizedProducts } from '../data/authorized-commercial-data';
import {
  addCartItem,
  CART_STORAGE_KEY,
  clearCart,
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
const availableProductIds = new Set(
  authorizedProducts.filter(isProductAvailable).map(({ id }) => id),
);

export function CartProvider({ children }: PropsWithChildren) {
  const initialCart = useMemo(readInitialCart, []);
  const [cart, setCart] = useState<StoredCart>(initialCart);
  const cartRef = useRef(initialCart);
  const [liveMessage, setLiveMessage] = useState('');
  const skipNextPersistence = useRef(false);

  useEffect(() => {
    if (skipNextPersistence.current) {
      skipNextPersistence.current = false;
      return;
    }
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(cart));
    } catch {
      // El carrito continúa en memoria si el almacenamiento no está disponible.
    }
  }, [cart]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CART_STORAGE_KEY) return;
      const incoming = parseStoredCartJson(event.newValue, authorizedProducts);
      if (serializeCart(incoming) === serializeCart(cartRef.current)) return;
      cartRef.current = incoming;
      skipNextPersistence.current = true;
      setCart(incoming);
      setLiveMessage('El carrito se actualizó desde otra pestaña.');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const summary = useMemo(
    () => summarizeCart(cart, authorizedProducts),
    [cart],
  );

  const add = useCallback((productId: string, quantity = 1): boolean => {
    if (!availableProductIds.has(productId)) {
      setLiveMessage('No se pudo agregar el producto.');
      return false;
    }
    const current = cartRef.current;
    const next = addCartItem(current, productId, quantity);
    const changed = next !== current;
    if (changed) {
      cartRef.current = next;
      setCart(next);
    }
    setLiveMessage(changed ? 'Producto agregado al carrito.' : 'No se pudo agregar el producto.');
    return changed;
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    const current = cartRef.current;
    const next = setCartItemQuantity(current, productId, quantity);
    if (next === current) {
      setLiveMessage('La cantidad indicada no es válida.');
      return;
    }
    cartRef.current = next;
    setCart(next);
    setLiveMessage('Cantidad actualizada.');
  }, []);

  const remove = useCallback((productId: string) => {
    const current = cartRef.current;
    const next = removeCartItem(current, productId);
    if (next === current) return;
    cartRef.current = next;
    setCart(next);
    setLiveMessage('Producto eliminado del carrito.');
  }, []);

  const clear = useCallback(() => {
    const current = cartRef.current;
    const next = clearCart(current);
    if (next === current) return;
    cartRef.current = next;
    setCart(next);
    setLiveMessage('Carrito vaciado.');
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      add,
      clear,
      items: summary.items,
      itemCount: summary.itemCount,
      liveMessage,
      remove,
      setQuantity,
      storedItems: cart.items,
      total: summary.total,
    }),
    [add, cart.items, clear, liveMessage, remove, setQuantity, summary],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (value === null) throw new Error('useCart debe usarse dentro de CartProvider.');
  return value;
}

function readInitialCart(): StoredCart {
  if (typeof window === 'undefined') return parseStoredCartJson(null, authorizedProducts);
  try {
    return parseStoredCartJson(window.localStorage.getItem(CART_STORAGE_KEY), authorizedProducts);
  } catch {
    return parseStoredCartJson(null, authorizedProducts);
  }
}
