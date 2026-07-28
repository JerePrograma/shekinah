const LOGO_PATH = '/assets/logo-shekinah.png';

const navigationItems = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#enfoque', label: 'Enfoque' },
  { href: '#catalogo', label: 'Catálogo' },
] as const;

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
              src={LOGO_PATH}
              width="72"
              height="72"
              alt="Shekinah, hierbas y especias"
            />
            <span className="brand-text">
              <strong>Shekinah</strong>
              <small>Hierbas y especias</small>
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
              <p className="eyebrow">Hierbas y especias</p>
              <h1 id="hero-title">Una experiencia simple para descubrir nuevos sabores.</h1>
              <p className="hero-summary">
                Shekinah presenta un espacio claro y accesible. El catálogo se incorporará
                únicamente cuando la información comercial esté confirmada.
              </p>

              <div className="hero-actions" aria-label="Acciones principales">
                <a className="button button-primary" href="#catalogo">
                  Explorar catálogo
                </a>
                <a className="button button-secondary" href="#enfoque">
                  Ver el enfoque
                </a>
              </div>

              <ul className="hero-points" aria-label="Principios de la experiencia">
                <li>Lectura simple</li>
                <li>Navegación directa</li>
                <li>Datos verificables</li>
              </ul>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="hero-brand-card">
                <span className="hero-brand-label">Shekinah</span>
                <img className="hero-logo" src={LOGO_PATH} width="383" height="383" alt="" />
              </div>
            </div>
          </div>
        </section>

        <section className="approach section" id="enfoque" aria-labelledby="approach-title">
          <div className="container">
            <div className="section-heading">
              <p className="eyebrow">Enfoque</p>
              <h2 id="approach-title">Diseñado para orientarte con facilidad.</h2>
              <p>
                La estructura prioriza decisiones simples, información legible y una experiencia
                consistente en cualquier tamaño de pantalla.
              </p>
            </div>

            <div className="principle-grid">
              <article className="principle-card">
                <span className="principle-number" aria-hidden="true">
                  01
                </span>
                <h3>Orientación inmediata</h3>
                <p>Una jerarquía visual clara permite identificar cada sección sin esfuerzo.</p>
              </article>

              <article className="principle-card">
                <span className="principle-number" aria-hidden="true">
                  02
                </span>
                <h3>Contenido verificable</h3>
                <p>Los datos comerciales se publicarán únicamente después de ser confirmados.</p>
              </article>

              <article className="principle-card">
                <span className="principle-number" aria-hidden="true">
                  03
                </span>
                <h3>Experiencia adaptable</h3>
                <p>El diseño conserva su legibilidad en escritorio, tablet y teléfono.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="catalog-section section" id="catalogo" aria-labelledby="catalog-title">
          <div className="container catalog-layout">
            <div className="section-heading catalog-heading">
              <p className="eyebrow">Catálogo</p>
              <h2 id="catalog-title">Información comercial en preparación.</h2>
              <p>
                Este espacio está listo para recibir el catálogo cuando sus datos hayan sido
                revisados y autorizados.
              </p>
            </div>

            <div className="empty-state" role="status" aria-live="polite">
              <span className="empty-state-mark" aria-hidden="true">
                S
              </span>
              <div>
                <h3>Todavía no hay productos publicados</h3>
                <p>
                  Se incorporarán únicamente nombres, presentaciones, categorías y precios
                  confirmados.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <p className="footer-brand">
            <strong>Shekinah</strong>
            <span>Hierbas y especias</span>
          </p>

          <nav className="footer-navigation" aria-label="Navegación del pie">
            {navigationItems.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <p className="copyright">© {currentYear} Shekinah.</p>
        </div>
      </footer>
    </>
  );
}
