import { CatalogSection } from './catalog/CatalogSection';
import { authorizedAssets } from './config/authorized-assets';
import { navigationItems, siteContent } from './content/site-content';
import { authorizedProducts } from './data/authorized-commercial-data';

export function App() {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>

      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#inicio" aria-label="Shekinah, ir al inicio">
            <img
              className="brand-mark"
              src={authorizedAssets.logo.path}
              width="72"
              height="72"
              alt={authorizedAssets.logo.alt}
            />
            <span className="brand-text">
              <strong>{siteContent.brand.name}</strong>
              <small>{siteContent.brand.descriptor}</small>
            </span>
          </a>

          <nav className="primary-navigation" aria-label="Navegación principal">
            <ul>
              {navigationItems.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="hero" id="inicio" aria-labelledby="hero-title">
          <div className="container hero-grid">
            <div className="hero-content">
              <p className="eyebrow">{siteContent.hero.eyebrow}</p>
              <h1 id="hero-title">{siteContent.hero.title}</h1>
              <p className="hero-summary">{siteContent.hero.summary}</p>

              <div className="hero-actions" aria-label="Acciones principales">
                <a className="button button-primary" href="#catalogo">
                  {siteContent.hero.primaryAction}
                </a>
                <a className="button button-secondary" href="#enfoque">
                  {siteContent.hero.secondaryAction}
                </a>
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

        <section className="approach section" id="enfoque" aria-labelledby="approach-title">
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
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <p className="footer-brand">
            <strong>{siteContent.brand.name}</strong>
            <span>{siteContent.brand.descriptor}</span>
          </p>

          <nav className="footer-navigation" aria-label="Navegación del pie">
            {navigationItems.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <p className="copyright">
            © {currentYear} {siteContent.brand.name}.
          </p>
        </div>
      </footer>
    </>
  );
}
