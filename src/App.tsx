import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import {
  entries,
  findEntry,
  navigation,
  normalizePath,
  posts,
  recipes,
  site,
  toSitePath,
  type Block,
  type ContentEntry,
} from './content';
import { getOriginalMedia, type OriginalImage } from './originalMedia';
import './originalMedia.css';

interface AppProps {
  path: string;
}

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
    document.body.classList.toggle('has-open-overlay', open);
    return () => document.body.classList.remove('has-open-overlay');
  }, [open]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href={toSitePath('/')} aria-label="Shekinah, inicio">
          <img src={toSitePath('/images/brand-horizontal.webp')} alt="Shekinah" width="600" height="162" />
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="primary-navigation"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
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
            src={toSitePath('/images/brand-lockup.webp')}
            alt="Shekinah, herbolario y tienda gourmet"
            width="1200"
            height="670"
            loading="lazy"
          />
          <h2 id="footer-brand" className="sr-only">
            Shekinah
          </h2>
          <p>{site.description}</p>
        </section>
        <nav aria-label="Navegación de pie de página">
          <h2>Explorar</h2>
          <ul>
            {[...navigation, { href: '/terms-and-conditions/', label: 'Términos y condiciones' }].map(
              (item) => (
                <li key={item.href}>
                  <a href={toSitePath(item.href)}>{item.label}</a>
                </li>
              ),
            )}
          </ul>
        </nav>
        <section aria-labelledby="footer-contact">
          <h2 id="footer-contact">Contacto</h2>
          <p>
            <a href={`mailto:${site.email}`}>{site.email}</a>
          </p>
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
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
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
        <div>
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
            width="1600"
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

function ContentCard({ entry, meta }: { entry: ContentEntry; meta: string }) {
  const image = imageForEntry(entry);
  return (
    <article className="card content-card">
      <a className="content-card__image-link" href={toSitePath(entry.path)} tabIndex={-1} aria-hidden="true">
        <img
          className="card__media"
          src={toSitePath(image.src)}
          alt=""
          width="1200"
          height="750"
          loading="lazy"
        />
      </a>
      <div className="card__body">
        <p className="card__meta">{meta}</p>
        <h2>
          <a href={toSitePath(entry.path)}>{entry.title}</a>
        </h2>
        <p>{entry.description}</p>
        <a className="content-card__more" href={toSitePath(entry.path)}>
          Leer más <span aria-hidden="true">→</span>
        </a>
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
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={key}>{block.text}</p>;
      })}
    </>
  );
}

function OriginalGallery({ title, images }: { title: string; images: OriginalImage[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (selected === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
      if (event.key === 'ArrowLeft') {
        setSelected((current) => (current === null ? null : (current - 1 + images.length) % images.length));
      }
      if (event.key === 'ArrowRight') {
        setSelected((current) => (current === null ? null : (current + 1) % images.length));
      }
    };
    document.body.classList.add('has-open-overlay');
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('has-open-overlay');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [images.length, selected]);

  if (images.length === 0) return null;
  const activeImage = selected === null ? null : images[selected];
  const currentIndex = selected ?? 0;

  return (
    <section className="original-gallery" aria-labelledby="original-gallery-title">
      <div className="original-gallery__heading">
        <p className="eyebrow">Galería</p>
        <h2 id="original-gallery-title">{title}</h2>
      </div>
      <div className="original-gallery__grid">
        {images.map((image, index) => (
          <button
            className="original-gallery__button"
            type="button"
            key={image.src}
            aria-label={`Ampliar imagen ${index + 1}: ${image.alt}`}
            onClick={() => setSelected(index)}
          >
            <img src={toSitePath(image.src)} alt={image.alt} width="1200" height="900" loading="lazy" />
          </button>
        ))}
      </div>
      {activeImage ? (
        <div className="lightbox" role="presentation" onMouseDown={() => setSelected(null)}>
          <div
            className="lightbox__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Imagen ampliada"
            onMouseDown={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <img className="lightbox__image" src={toSitePath(activeImage.src)} alt={activeImage.alt} />
            <button
              className="lightbox__close"
              type="button"
              aria-label="Cerrar imagen ampliada"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            {images.length > 1 ? (
              <>
                <button
                  className="lightbox__previous"
                  type="button"
                  aria-label="Imagen anterior"
                  onClick={() => setSelected((currentIndex - 1 + images.length) % images.length)}
                >
                  ‹
                </button>
                <button
                  className="lightbox__next"
                  type="button"
                  aria-label="Imagen siguiente"
                  onClick={() => setSelected((currentIndex + 1) % images.length)}
                >
                  ›
                </button>
              </>
            ) : null}
            <p className="lightbox__caption">{activeImage.alt}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Testimonial({ quote, author, rating }: { quote: string; author: string; rating: number }) {
  return (
    <aside className="testimonial-card" aria-label={`Testimonio de ${author}`}>
      <p className="testimonial-card__rating" aria-label={`${rating} de 5 estrellas`}>
        {'★'.repeat(rating)}
      </p>
      <blockquote>{quote}</blockquote>
      <p className="testimonial-card__author">{author}</p>
    </aside>
  );
}

function Home() {
  const latestPosts = [...posts].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const media = getOriginalMedia('/');
  const features = [
    {
      title: 'El mercado del mundo',
      description: 'Familias de especias, hierbas, cacao, semillas y complementos gourmet.',
      href: '/tienda/',
      image: media?.features?.[0],
    },
    {
      title: 'Historias y usos',
      description: 'Contexto cultural y gastronómico para cocinar con más intención.',
      href: '/blog/',
      image: media?.features?.[1],
    },
    {
      title: 'Recetas',
      description: 'Preparaciones artesanales para disfrutar y compartir.',
      href: '/recetas/',
      image: media?.features?.[2],
    },
  ];

  return (
    <>
      <Hero
        eyebrow="Origen, aroma y cocina"
        title="Tesoros botánicos para una cocina con historia"
        description="Especias, hierbas, semillas y recetas para explorar sabores auténticos sin perder de vista su origen."
        image={media?.hero.src ?? '/images/about-spice-shop.webp'}
        imageAlt={media?.hero.alt ?? 'Interior de un herbolario con estantes llenos de frascos de especias.'}
      >
        <div className="cluster hero-actions">
          <a className="button" href={toSitePath('/tienda/')}>
            Explorar el catálogo
          </a>
          <a className="button button--secondary" href={toSitePath('/recetas/')}>
            Ver recetas
          </a>
        </div>
      </Hero>
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Guía del viajero</p>
              <h2>Sabores que conectan territorios</h2>
            </div>
            <p className="lead">
              Shekinah combina herbolario, tienda gourmet y contenidos prácticos para aprender a usar cada ingrediente.
            </p>
          </div>
          <div className="grid grid--3 feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <img
                  src={toSitePath(feature.image?.src ?? '/images/about-spice-shop.webp')}
                  alt={feature.image?.alt ?? ''}
                  width="1024"
                  height="768"
                  loading="lazy"
                />
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <a href={toSitePath(feature.href)}>Conocer más</a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section section--muted">
        <div className="container split">
          <img
            className="split__image"
            src={toSitePath(media?.featured?.src ?? '/images/about-spice-shop.webp')}
            alt={media?.featured?.alt ?? 'Herbolario con frascos ordenados.'}
            width="1800"
            height="870"
            loading="lazy"
          />
          <div>
            <p className="eyebrow">Nuestra esencia</p>
            <h2>Amor por el origen</h2>
            <p className="lead">
              Shekinah propone acercar ingredientes botánicos con respeto por la tierra, atención a la calidad y una mirada que une bienestar y alta cocina.
            </p>
            <p>
              Seleccionamos ingredientes y contenidos que combinan tradición, calidad y una experiencia de compra simple.
            </p>
            <a className="button button--secondary" href={toSitePath('/nosotros/')}>
              Conocer la historia
            </a>
          </div>
        </div>
      </section>
      <ListingSection title="Del herbolario a la mesa" eyebrow="Últimas publicaciones" entries={latestPosts} />
      <ListingSection title="Preparaciones para experimentar" eyebrow="Recetario" entries={recipes} dark />
    </>
  );
}

function ListingSection({
  title,
  eyebrow,
  entries: list,
  dark = false,
}: {
  title: string;
  eyebrow: string;
  entries: ContentEntry[];
  dark?: boolean;
}) {
  return (
    <section className={`section${dark ? ' recipes-band' : ''}`}>
      <div className="container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
        </div>
        <div className="grid grid--2">
          {list.map((entry) => (
            <ContentCard
              key={entry.path}
              entry={entry}
              meta={
                entry.kind === 'recipe'
                  ? 'Receta'
                  : new Date(`${entry.publishedAt ?? '2026-01-01'}T12:00:00Z`).toLocaleDateString('es-AR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })
              }
            />
          ))}
        </div>
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
      <div className="breadcrumb-wrap">
        <nav className="container" aria-label="Migas de pan">
          <ol className="breadcrumbs">
            <li>
              <a href={toSitePath('/')}>Inicio</a>
            </li>
            <li>
              {entry.kind === 'post' ? (
                <a href={toSitePath('/blog/')}>Blog</a>
              ) : entry.kind === 'recipe' ? (
                <a href={toSitePath('/recetas/')}>Recetas</a>
              ) : (
                'Página'
              )}
            </li>
            <li aria-current="page">{entry.title}</li>
          </ol>
        </nav>
      </div>
      <article className="section">
        <div className="reading prose">
          {entry.kind === 'recipe' && entry.ingredients ? (
            <section className="recipe-panel" aria-labelledby="ingredients-title">
              <h2 id="ingredients-title">Ingredientes</h2>
              <ul>
                {entry.ingredients.map((ingredient) => (
                  <li key={ingredient}>{ingredient}</li>
                ))}
              </ul>
              {entry.instructions && entry.instructions.length > 0 ? (
                <>
                  <h2>Procedimiento</h2>
                  <ol>
                    {entry.instructions.map((instruction) => (
                      <li key={instruction}>{instruction}</li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="notice">Consultanos para conocer el procedimiento completo.</p>
              )}
            </section>
          ) : null}
          <Blocks blocks={entry.blocks} />
          {media?.gallery ? <OriginalGallery title="Imágenes" images={media.gallery} /> : null}
          {media?.testimonial ? <Testimonial {...media.testimonial} /> : null}
        </div>
      </article>
    </>
  );
}

function ListingPage({ kind }: { kind: 'blog' | 'recipes' }) {
  const list = kind === 'blog' ? posts : recipes;
  const referenceEntry = kind === 'blog' ? posts[0] : recipes[0];
  const heroImage = referenceEntry ? getOriginalMedia(referenceEntry.path)?.hero : undefined;
  return (
    <>
      <Hero
        eyebrow={kind === 'blog' ? 'Historias y usos' : 'Recetario'}
        title={kind === 'blog' ? 'Blog' : 'Recetas'}
        description={
          kind === 'blog'
            ? 'Cultura gastronómica, perfiles aromáticos y formas responsables de acercarse a hierbas y especias.'
            : 'Preparaciones artesanales, ideas y recetas para disfrutar en casa.'
        }
        image={heroImage?.src ?? (kind === 'blog' ? '/images/about-spice-shop.webp' : '/images/culinary-kitchen.webp')}
        imageAlt={heroImage?.alt ?? (kind === 'blog' ? 'Frascos con hierbas y especias.' : 'Cocina preparada para recetas artesanales.')}
      />
      <ListingSection title={kind === 'blog' ? 'Publicaciones' : 'Preparaciones'} eyebrow="Contenido destacado" entries={list} />
    </>
  );
}

function LegacyCategory() {
  return (
    <section className="section">
      <div className="reading empty-state">
        <p className="eyebrow">Archivo</p>
        <h1>Archivo sin categoría</h1>
        <p className="lead">Las publicaciones actuales están organizadas en el blog.</p>
        <a className="button" href={toSitePath('/blog/')}>
          Abrir el blog
        </a>
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
        <a className="button" href={toSitePath('/')}>
          Volver al inicio
        </a>
      </div>
    </section>
  );
}

export function App({ path: rawPath }: AppProps) {
  const path = normalizePath(rawPath);
  const entry = findEntry(path);
  let content: ReactNode;
  if (path === '/') content = <Home />;
  else if (path === '/blog/') content = <ListingPage kind="blog" />;
  else if (path === '/recetas/') content = <ListingPage kind="recipes" />;
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
    normalized === '/recetas/' ||
    normalized === '/category/uncategorized/' ||
    entries.some((entry) => entry.path === normalized)
  );
}
