import { renderToString } from 'react-dom/server';
import { App, routeExists } from './App';
import { canonicalRoutes, normalizePath, redirects } from './content';
import { buildHead } from './seo';
import './styles.css';

export { canonicalRoutes, redirects };

export function render(pathValue: string) {
  const path = normalizePath(pathValue);
  const status = routeExists(path) ? 200 : 404;
  const renderPath = status === 404 ? '/404/' : path;
  return {
    html: renderToString(<App path={renderPath} />),
    head: buildHead(renderPath),
    status,
  };
}
