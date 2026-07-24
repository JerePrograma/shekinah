import { useEffect, useState, type ReactNode } from 'react';
import { categories, products, verifiedStore } from './catalog';
import {
  entries,
  findEntry,
  navigation,
  normalizePath,
  posts,
  site,
  toSitePath,
  type Block,
  type ContentEntry,
} from './content';
import { getOriginalMedia, type OriginalImage } from './originalMedia';

interface AppProps {
  path: string;
}

const whatsappHref = `https://wa.me/${verifiedStore.whatsappNumber}`;

function isCurrent(currentPath: string, href: string): boolean {
  return href === '/' ? currentPath === '/' : currentPath === href || currentPath.startsWith(href);
}

function Header({ currentPath }: { currentPath: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('has-open-menu', open);
    return () => document.body.classList.remove('has-open-menu');
  }, [open]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href={toSitePath('/')} aria-label="Shekinah, volver al inicio">
          <img src={toSitePath('/images/brand-horizontal.webp')} alt="Shekinah" width="600" height="162" />
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Cerrar menú' : 'Menú'}
        </button>
        <nav
          id="primary-navigation"
          className={`primary-navigation${open ? ' is-open' : ''}`}
          aria-label="Navegación principal"
        >
          <ul>
            {navigation.map((item) => (
              <li key={item.href}>
                <a
                  href={toSitePath(item.href)}
                  aria-current={isCurrent(currentPath, item.href) ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <section aria-labelledby="footer-brand">
          <img
            className="footer-logo"
            src={toSitePath('/images/brand-horizontal.webp')}
            alt="Shekinah"
            width="600"
            height="162"
            loading="lazy"
          />
          <h2 id="footer-brand" className="sr-only">
            Shekinah
          </h2>
          <p>{site.description}</p>
        </section>
        <nav aria-label="Enlaces útiles">
          <h2>Enlaces útiles</h2>
          <ul>
            <li><a href={toSitePath('/tienda/')}>Ver productos</a></li>
            <li><a href={toSitePath('/nosotros/')}>Conocer Shekinah</a></li>
            <li><a href={toSitePath('/blog/')}>Guías y consejos</a></li>
            <li><a href={toSitePath('/terms-and-conditions/')}>Términos y condiciones</a></li>
          </ul>
        </nav>
        <section aria-labelledby="footer-contact">
          <h2 id="footer-contact">Contacto</h2>
          <p><a href={whatsappHref} target="_blank" rel="noreferrer">WhatsApp {verifiedStore.whatsappVisible}</a></p>
          <p><a href={`mailto:${site.email}`}>{site.email}</a></p>
          <p className="footer-small">{site.address}</p>
        </section>
      </div>
      <div className="container footer-bottom">
        <p>© {new Date().getFullYear()} Shekinah. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}

function Layout({ path, children }: { path: string; children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <Header currentPath={path} />
      <main id="main-content">{children}</main>
      <Footer />
    </>
  );
}

function Hero({
  eyebrow,
  title,
  description,
  image,
  imageAlt,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`page-hero${image ? ' page-hero--with-image' : ''}`}>
      <div className="container page-hero__grid">
        <div className="page-hero__content">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="lead">{description}</p>
          {children}
        </div>
        {image ? (
          <img
            className="page-hero__image"
            src={toSitePath(image)}
            alt={imageAlt ?? ''}
            width="1200"
            height="900"
            fetchPriority="high"
          />
        ) : null}
      </div>
    </section>
  );
}

function imageForEntry(entry: ContentEntry): OriginalImage {
  return getOriginalMedia(entry.path)?.hero ?? { src: entry.image, alt: entry.imageAlt };
}

function ContentCard({ entry }: { entry: ContentEntry }) {
  const image = imageForEntry(entry);
  return (
    <article className="card content-card">
      <a className="content-card__image-link" href={toSitePath(entry.path)} tabIndex={-1} aria-hidden="true">
        <img className="card__media" src={toSitePath(image.src)} alt="" width="1200" height="750" loading="lazy" />
      </a>
      <div className="card__body">
        <p className="card__meta">
          {new Date(`${entry.publishedAt ?? '2026-01-01'}T12:00:00Z`).toLocaleDateString('es-AR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </p>
        <h2><a href={toSitePath(entry.path)}>{entry.title}</a></h2>
        <p>{entry.description}</p>
        <a className="content-card__more" href={toSitePath(entry.path)}>Leer artículo</a>
      </div>
    </article>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'heading') return <h2 key={key}>{block.text}</h2>;
        if (block.type === 'quote') return <blockquote key={key}>{block.text}</blockquote>;
        if (block.type === 'list') {
          return (
            <ul key={key}>
              {block.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          );
        }
        return <p key={key}>{block.text}</p>;
      })}
    </>
  );
}

function Gallery({ images }: { images: OriginalImage[] }) {
  if (images.length === 0) return null;
  return (
    <section className="original-gallery" aria-labelledby="gallery-title">
      <h2 id="gallery-title">Imágenes de Shekinah</h2>
      <div className="original-gallery__grid">
        {images.map((image) => (
          <img key={image.src} src={toSitePath(image.src)} alt={image.alt} width="1200" height="900" loading="lazy" />
        ))}
      </div>
    </section>
  );
}

const featuredCategories = categories
  .map((category) => ({
    ...category,
    count: products.filter((product) => product.categoryIds.includes(category.id)).length,
  }))
  .filter((category) => category.count > 0)
  .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'es'))
  .slice(0, 6);

function Home() {
  const media = getOriginalMedia('/');
  return (
    <>
      <Hero
        eyebrow="Herbolario y tienda gourmet"
        title="Encontrá productos naturales sin complicaciones"
        description="Especias, hierbas, semillas y productos seleccionados. Buscá lo que necesitás y prepará tu consulta por WhatsApp."
        image={media?.hero.src ?? '/images/about-spice-shop.webp'}
        imageAlt={media?.hero.alt ?? 'Selección de especias y productos botánicos.'}
      >
        <div className="hero-actions">
          <a className="button" href={toSitePath('/tienda/')}>Ver productos</a>
          <a className="text-link" href={whatsappHref} target="_blank" rel="noreferrer">Necesito ayuda por WhatsApp</a>
        </div>
      </Hero>

      <section className="section" aria-labelledby="categories-title">
        <div className="container">
          <div className="section-heading section-heading--simple">
            <p className="eyebrow">Elegí una categoría</p>
            <h2 id="categories-title">¿Qué estás buscando?</h2>
            <p className="lead">Podés entrar por categoría o ver el catálogo completo.</p>
          </div>
          <div className="category-grid">
            {featuredCategories.map((category) => (
              <a className="category-link" href={toSitePath(category.path)} key={category.id}>
                <strong>{category.name}</strong>
                <span>{category.count === 1 ? '1 producto' : `${category.count} productos`}</span>
              </a>
            ))}
          </div>
          <p className="section-action"><a className="button button--secondary" href={toSitePath('/tienda/')}>Ver todos los productos</a></p>
        </div>
      </section>

      <section className="section section--muted" aria-labelledby="steps-title">
        <div className="container">
          <div className="section-heading section-heading--simple">
            <p className="eyebrow">Compra orientada</p>
            <h2 id="steps-title">Consultar es simple</h2>
          </div>
          <ol className="steps-grid">
            <li><strong>1. Buscá</strong><span>Usá el nombre del producto o elegí una categoría.</span></li>
            <li><strong>2. Revisá</strong><span>Abrí el detalle y elegí la cantidad que necesitás.</span></li>
            <li><strong>3. Consultá</strong><span>El carrito prepara el mensaje para confirmar precio y disponibilidad por WhatsApp.</span></li>
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="about-title">
        <div className="container simple-split">
          <div>
            <p className="eyebrow">Quiénes somos</p>
            <h2 id="about-title">Productos elegidos con atención al origen</h2>
            <p className="lead">Shekinah reúne hierbas, especias, semillas y productos gourmet para acompañar tu cocina cotidiana.</p>
            <a className="button button--secondary" href={toSitePath('/nosotros/')}>Conocer Shekinah</a>
          </div>
          <img
            src={toSitePath(media?.featured?.src ?? '/images/about-spice-shop.webp')}
            alt={media?.featured?.alt ?? 'Productos botánicos de Shekinah.'}
            width="1200"
            height="900"
            loading="lazy"
          />
        </div>
      </section>

      <ContactCallout />
    </>
  );
}

function ContactCallout() {
  return (
    <section className="section contact-section" aria-labelledby="contact-help-title">
      <div className="container contact-panel">
        <div>
          <p className="eyebrow">Ayuda directa</p>
          <h2 id="contact-help-title">¿Tenés una duda?</h2>
          <p>Escribinos y contanos qué producto buscás. No necesitás completar formularios.</p>
        </div>
        <a className="button" href={whatsappHref} target="_blank" rel="noreferrer">Consultar por WhatsApp</a>
      </div>
    </section>
  );
}

function EntryPage({ entry }: { entry: ContentEntry }) {
  const media = getOriginalMedia(entry.path);
  const heroImage = media?.hero ?? { src: entry.image, alt: entry.imageAlt };
  return (
    <>
      <Hero
        eyebrow={entry.eyebrow}
        title={entry.title}
        description={entry.description}
        image={heroImage.src}
        imageAlt={heroImage.alt}
      />
      <nav className="container breadcrumb-wrap" aria-label="Migas de pan">
        <ol className="breadcrumbs">
          <li><a href={toSitePath('/')}>Inicio</a></li>
          <li>{entry.kind === 'post' ? <a href={toSitePath('/blog/')}>Guías y consejos</a> : 'Información'}</li>
          <li aria-current="page">{entry.title}</li>
        </ol>
      </nav>
      <article className="section">
        <div className="reading prose">
          <Blocks blocks={entry.blocks} />
          {media?.gallery ? <Gallery images={media.gallery} /> : null}
        </div>
      </article>
    </>
  );
}

function BlogPage() {
  const latestPosts = [...posts].sort((left, right) => (right.publishedAt ?? '').localeCompare(left.publishedAt ?? ''));
  const heroImage = latestPosts[0] ? getOriginalMedia(latestPosts[0].path)?.hero : undefined;
  return (
    <>
      <Hero
        eyebrow="Información útil"
        title="Guías y consejos"
        description="Artículos breves sobre hierbas, especias y formas de aprovecharlas en la cocina."
        image={heroImage?.src ?? '/images/about-spice-shop.webp'}
        imageAlt={heroImage?.alt ?? 'Frascos con hierbas y especias.'}
      />
      <section className="section">
        <div className="container">
          <div className="grid grid--2">
            {latestPosts.map((entry) => <ContentCard key={entry.path} entry={entry} />)}
          </div>
        </div>
      </section>
    </>
  );
}

function ContactPage() {
  return (
    <>
      <Hero
        eyebrow="Contacto"
        title="Hablemos"
        description="Elegí el canal que te resulte más cómodo. Para consultar productos, WhatsApp es la opción más directa."
      />
      <section className="section">
        <div className="container contact-grid">
          <article className="contact-card">
            <h2>WhatsApp</h2>
            <p>Consultá disponibilidad, precio o presentación de un producto.</p>
            <a className="button" href={whatsappHref} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
            <p className="contact-detail">{verifiedStore.whatsappVisible}</p>
          </article>
          <article className="contact-card">
            <h2>Correo electrónico</h2>
            <p>Usalo para consultas que necesiten más detalle.</p>
            <a className="button button--secondary" href={`mailto:${site.email}`}>Enviar correo</a>
            <p className="contact-detail">{site.email}</p>
          </article>
          <article className="contact-card">
            <h2>Ubicación</h2>
            <p>{site.address}</p>
            <p className="contact-detail">Coordiná cualquier visita o retiro antes de acercarte.</p>
          </article>
        </div>
      </section>
    </>
  );
}

function LegacyCategory() {
  return (
    <section className="section">
      <div className="reading empty-state">
        <p className="eyebrow">Archivo</p>
        <h1>Archivo sin categoría</h1>
        <p className="lead">Los artículos actuales están organizados en guías y consejos.</p>
        <a className="button" href={toSitePath('/blog/')}>Ver guías y consejos</a>
      </div>
    </section>
  );
}

function NotFound() {
  return (
    <section className="section">
      <div className="reading empty-state">
        <p className="eyebrow">Error 404</p>
        <h1>Página no encontrada</h1>
        <p className="lead">La dirección solicitada no existe o fue movida.</p>
        <a className="button" href={toSitePath('/tienda/')}>Volver a productos</a>
      </div>
    </section>
  );
}

export function App({ path: rawPath }: AppProps) {
  const path = normalizePath(rawPath);
  const entry = findEntry(path);
  let content: ReactNode;
  if (path === '/') content = <Home />;
  else if (path === '/blog/') content = <BlogPage />;
  else if (path === '/contacto/') content = <ContactPage />;
  else if (path === '/category/uncategorized/') content = <LegacyCategory />;
  else if (entry) content = <EntryPage entry={entry} />;
  else content = <NotFound />;

  return <Layout path={path}>{content}</Layout>;
}

export function routeExists(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized === '/' ||
    normalized === '/blog/' ||
    normalized === '/contacto/' ||
    normalized === '/category/uncategorized/' ||
    entries.some((entry) => entry.path === normalized)
  );
}
