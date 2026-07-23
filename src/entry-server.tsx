import { renderToString } from 'react-dom/server';
import { normalizePath, redirects } from './content';
import { canonicalRoutes, routeExists, SiteApp } from './siteApp';
import { buildSiteHead } from './siteSeo';
import './styles.css';

export { canonicalRoutes, redirects };

export function render(pathValue: string) {
  const path = normalizePath(pathValue);
  const status = routeExists(path) ? 200 : 404;
  const renderPath = status === 404 ? '/404/' : path;
  return {
    html: renderToString(<SiteApp path={renderPath} />),
    head: buildSiteHead(renderPath),
    status,
  };
}
