import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import { normalizePath } from './content';
import { applyClientHead } from './seo';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró #root para montar Shekinah.');

const path = normalizePath(window.location.pathname);
const application = (
  <StrictMode>
    <App path={path} />
  </StrictMode>
);
applyClientHead(path);
if (root.hasChildNodes()) hydrateRoot(root, application);
else createRoot(root).render(application);
