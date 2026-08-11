import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { CartProvider } from './cart/CartContext';
import './styles.css';
import './catalog.css';
import './routing.css';
import './commerce.css';
import './fulfillment.css';

const rootElement = document.getElementById('root');

if (!(rootElement instanceof HTMLElement)) {
  throw new Error('No se encontró el elemento raíz de la aplicación.');
}

createRoot(rootElement).render(
  <StrictMode>
    <CartProvider>
      <App />
    </CartProvider>
  </StrictMode>,
);
