import { CatalogSection } from '../catalog/CatalogSection';
import { authorizedProducts } from '../data/authorized-commercial-data';

export function CatalogPage() {
  return <CatalogSection headingLevel={1} products={authorizedProducts} />;
}
