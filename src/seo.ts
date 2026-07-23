import { findEntry, normalizePath, site } from './content';
import { getOriginalMedia } from './originalMedia';

export interface SeoData {
  path: string;
  title: string;
  description: string;
  image: string;
  type: 'website' | 'article';
  noindex: boolean;
  publishedAt?: string;
  jsonLd: Record<string, unknown> | Array<Record<string, unknown>>;
}

const routeDefaults: Record<string, Pick<SeoData, 'title' | 'description' | 'image' | 'type' | 'noindex'>> = {
  '/': {
    title: 'Shekinah — Herbolario & tienda gourmet',
    description: site.description,
    image: '/images/original/home-spice-chest.jpg',
    type: 'website',
    noindex: false,
  },
  '/blog/': {
    title: 'Blog — Shekinah',
    description: 'Historias, usos culinarios y cultura alrededor de hierbas y especias.',
    image: '/images/original/post-spice-journey.png',
    type: 'website',
    noindex: false,
  },
  '/recetas/': {
    title: 'Recetas — Shekinah',
    description: 'Preparaciones recuperadas y documentadas con límites de evidencia explícitos.',
    image: '/images/original/recipe-chocolate.jpg',
    type: 'website',
    noindex: false,
  },
  '/category/uncategorized/': {
    title: 'Archivo sin categoría — Shekinah',
    description: 'Ruta histórica conservada para compatibilidad. El contenido se encuentra en el blog.',
    image: '/images/original/home-spice-chest.jpg',
    type: 'website',
    noindex: true,
  },
};

function absolute(path: string): string {
  return new URL(path, site.origin).toString();
}

export function getSeo(pathValue: string): SeoData {
  const path = normalizePath(pathValue);
  const entry = findEntry(path);
  const base = routeDefaults[path];
  const title = entry ? `${entry.title} — Shekinah` : (base?.title ?? 'Página no encontrada — Shekinah');
  const description = entry?.description ?? base?.description ?? 'La página solicitada no existe.';
  const image = getOriginalMedia(path)?.hero.src ?? entry?.image ?? base?.image ?? '/images/original/home-spice-chest.jpg';
  const type = entry?.kind === 'post' || entry?.kind === 'recipe' ? 'article' : (base?.type ?? 'website');
  const noindex = path === '/404/' || (!entry && !base) || Boolean(base?.noindex);

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    description: site.description,
    email: site.email,
    url: site.origin,
    logo: absolute('/images/brand-emblem.png'),
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Moreno 2575',
      addressLocality: 'Mar del Plata',
      postalCode: '7600',
      addressRegion: 'Buenos Aires',
      addressCountry: 'AR',
    },
  };
  const jsonLd = entry
    ? [
        organization,
        {
          '@context': 'https://schema.org',
          '@type': entry.kind === 'recipe' ? 'Recipe' : entry.kind === 'post' ? 'Article' : 'WebPage',
          name: entry.title,
          headline: entry.title,
          description: entry.description,
          image: absolute(image),
          url: absolute(entry.path),
          ...(entry.publishedAt ? { datePublished: entry.publishedAt } : {}),
          ...(entry.kind === 'recipe' && entry.ingredients
            ? { recipeIngredient: entry.ingredients, recipeInstructions: entry.instructions ?? [] }
            : {}),
        },
      ]
    : organization;

  return {
    path,
    title,
    description,
    image,
    type,
    noindex,
    ...(entry?.publishedAt ? { publishedAt: entry.publishedAt } : {}),
    jsonLd,
  };
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function buildHead(path: string): string {
  const seo = getSeo(path);
  const canonical = absolute(seo.path === '/404/' ? '/' : seo.path);
  const image = absolute(seo.image);
  const robots = seo.noindex ? 'noindex, nofollow' : 'index, follow';
  const published = seo.publishedAt
    ? `<meta property="article:published_time" content="${escapeAttribute(seo.publishedAt)}" />`
    : '';

  return [
    `<title>${escapeAttribute(seo.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(seo.description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${escapeAttribute(canonical)}" />`,
    `<meta property="og:locale" content="es_AR" />`,
    `<meta property="og:type" content="${seo.type}" />`,
    `<meta property="og:site_name" content="Shekinah" />`,
    `<meta property="og:title" content="${escapeAttribute(seo.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(seo.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttribute(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttribute(seo.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(seo.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(image)}" />`,
    published,
    `<script type="application/ld+json" data-shekinah-jsonld>${safeJson(seo.jsonLd)}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');
}

export function applyClientHead(path: string): void {
  const seo = getSeo(path);
  const canonical = absolute(seo.path === '/404/' ? '/' : seo.path);
  const image = absolute(seo.image);
  document.title = seo.title;

  const setMeta = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
    let element = document.head.querySelector<HTMLMetaElement>(selector);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.content = content;
  };
  setMeta('meta[name="description"]', 'name', 'description', seo.description);
  setMeta('meta[name="robots"]', 'name', 'robots', seo.noindex ? 'noindex, nofollow' : 'index, follow');
  setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
  setMeta('meta[property="og:image"]', 'property', 'og:image', image);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);

  let canonicalElement = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonicalElement) {
    canonicalElement = document.createElement('link');
    canonicalElement.rel = 'canonical';
    document.head.append(canonicalElement);
  }
  canonicalElement.href = canonical;

  let jsonLd = document.head.querySelector<HTMLScriptElement>('script[data-shekinah-jsonld]');
  if (!jsonLd) {
    jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.dataset.shekinahJsonld = '';
    document.head.append(jsonLd);
  }
  jsonLd.textContent = JSON.stringify(seo.jsonLd);
}
