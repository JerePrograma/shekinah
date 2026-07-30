import { CatalogSection } from '../catalog/CatalogSection';
import { authorizedAssets } from '../config/authorized-assets';
import { siteContent } from '../content/site-content';
import { authorizedProducts } from '../data/authorized-commercial-data';
import { AppLink } from '../routing/AppLink';
import { appPaths } from '../routing/routes';
import type { Navigate } from '../routing/routes';

type HomePageProps = Readonly<{
  navigate: Navigate;
}>;

export function HomePage({ navigate }: HomePageProps) {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div className="hero-content">
            <p className="eyebrow">{siteContent.hero.eyebrow}</p>
            <h1 id="hero-title">{siteContent.hero.title}</h1>
            <p className="hero-summary">{siteContent.hero.summary}</p>

            <div className="hero-actions" aria-label="Acción principal">
              <AppLink
                className="button button-primary"
                navigate={navigate}
                to={appPaths.catalog}
              >
                {siteContent.hero.primaryAction}
              </AppLink>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="hero-brand-card">
              <span className="hero-brand-label">{siteContent.brand.name}</span>
              <img
                className="hero-logo"
                src={authorizedAssets.logo.path}
                width={authorizedAssets.logo.width}
                height={authorizedAssets.logo.height}
                alt=""
              />
            </div>
          </div>
        </div>
      </section>

      <CatalogSection navigate={navigate} products={authorizedProducts} />
    </>
  );
}
