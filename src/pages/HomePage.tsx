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

            <div className="hero-actions" aria-label="Acciones principales">
              <AppLink
                className="button button-primary"
                navigate={navigate}
                to={appPaths.catalog}
              >
                {siteContent.hero.primaryAction}
              </AppLink>
              <AppLink
                className="button button-secondary"
                navigate={navigate}
                to={appPaths.approach}
              >
                {siteContent.hero.secondaryAction}
              </AppLink>
            </div>

            <ul className="hero-points" aria-label="Principios de la experiencia">
              {siteContent.hero.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
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

      <section className="approach section" aria-labelledby="approach-title">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">{siteContent.approach.eyebrow}</p>
            <h2 id="approach-title">{siteContent.approach.title}</h2>
            <p>{siteContent.approach.summary}</p>
          </div>

          <div className="principle-grid">
            {siteContent.approach.principles.map((principle) => (
              <article className="principle-card" key={principle.number}>
                <span className="principle-number" aria-hidden="true">
                  {principle.number}
                </span>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CatalogSection products={authorizedProducts} />
    </>
  );
}
