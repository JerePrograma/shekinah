import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';

const rootElement = document.getElementById('root');

if (!(rootElement instanceof HTMLElement)) {
  throw new Error('No se encontró el elemento raíz de la aplicación.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
