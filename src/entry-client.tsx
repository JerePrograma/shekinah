import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { normalizePath } from './content';
import { SiteApp } from './siteApp';
import { applySiteClientHead } from './siteSeo';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró #root para montar Shekinah.');

const path = normalizePath(window.location.pathname);
const application = (
  <StrictMode>
    <SiteApp path={path} />
  </StrictMode>
);
applySiteClientHead(path);
if (root.hasChildNodes()) hydrateRoot(root, application);
else createRoot(root).render(application);
