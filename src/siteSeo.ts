import { findCategory, findProduct, formatPrice, products, verifiedStore, type Product } from './catalog';
import { normalizePath, site } from './content';
import { applyClientHead, buildHead } from './seo';

function absolute(path: string): string {
  return new URL(path.replace(/^\/+/, ''), `${site.origin}/`).toString();
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function productDescription(product: Product): string {
  return product.shortDescription ?? product.description ?? `${product.name} en Shekinah.`;
}

function productJsonLd(product: Product): Array<Record<string, unknown>> {
  const category = product.categoryIds.map((id) => id.replace(/^category-/u, '')).join(', ');
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: productDescription(product),
      url: absolute(product.path),
      category,
      ...(product.images[0] ? { image: absolute(product.images[0].src) } : {}),
      ...(product.sku ? { sku: product.sku } : {}),
      ...(product.price !== null && product.currency
        ? {
            additionalProperty: {
              '@type': 'PropertyValue',
              name: 'Precio de referencia',
              value: `${product.currency} ${product.price.toFixed(2)}`,
            },
          }
        : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: absolute('/') },
        { '@type': 'ListItem', position: 2, name: 'Productos', item: absolute('/tienda/') },
        { '@type': 'ListItem', position: 3, name: product.name, item: absolute(product.path) },
      ],
    },
  ];
}

function commerceHead(pathValue: string): string | null {
  const path = normalizePath(pathValue);
  const product = findProduct(path);
  const category = findCategory(path);
  if (!product && !category && path !== '/tienda/') return null;

  const title = product
    ? `${product.name} — Shekinah`
    : category
      ? `${category.name} — Productos Shekinah`
      : 'Productos — Shekinah';
  const description = product
    ? productDescription(product)
    : category
      ? `Productos de ${category.name} disponibles en Shekinah.`
      : 'Catálogo de productos naturales, especias, hierbas y complementos de Shekinah.';
  const canonical = absolute(path);
  const image = product?.images[0]?.src ? absolute(product.images[0].src) : absolute('/images/original/home-herb-jars.jpg');
  const jsonLd = product
    ? productJsonLd(product)
    : [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: canonical,
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: products.length,
            itemListElement: products.map((item, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: absolute(item.path),
              name: item.name,
            })),
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: site.name,
          url: site.origin,
          inLanguage: verifiedStore.locale,
        },
      ];

  return [
    `<title>${escapeAttribute(title)}</title>`,
    `<meta name="description" content="${escapeAttribute(description)}" />`,
    '<meta name="robots" content="index, follow" />',
    `<link rel="canonical" href="${escapeAttribute(canonical)}" />`,
    '<meta property="og:locale" content="es_AR" />',
    `<meta property="og:type" content="${product ? 'product' : 'website'}" />`,
    '<meta property="og:site_name" content="Shekinah" />',
    `<meta property="og:title" content="${escapeAttribute(title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttribute(image)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttribute(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(image)}" />`,
    `<script type="application/ld+json" data-shekinah-jsonld>${safeJson(jsonLd)}</script>`,
  ].join('\n    ');
}

export function buildSiteHead(path: string): string {
  return commerceHead(path) ?? buildHead(path);
}

export function applySiteClientHead(pathValue: string): void {
  const path = normalizePath(pathValue);
  const product = findProduct(path);
  const category = findCategory(path);
  if (!product && !category && path !== '/tienda/') {
    applyClientHead(path);
    return;
  }
  const html = commerceHead(path);
  if (!html) return;
  const template = document.createElement('template');
  template.innerHTML = html;
  const incoming = template.content;
  const title = incoming.querySelector('title')?.textContent;
  if (title) document.title = title;
  for (const selector of [
    'meta[name="description"]',
    'meta[name="robots"]',
    'meta[property="og:type"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:url"]',
    'meta[property="og:image"]',
    'meta[name="twitter:card"]',
    'meta[name="twitter:title"]',
    'meta[name="twitter:description"]',
    'meta[name="twitter:image"]',
  ]) {
    const source = incoming.querySelector<HTMLMetaElement>(selector);
    if (!source) continue;
    let target = document.head.querySelector<HTMLMetaElement>(selector);
    if (!target) {
      target = document.createElement('meta');
      for (const attribute of source.getAttributeNames()) {
        target.setAttribute(attribute, source.getAttribute(attribute) ?? '');
      }
      document.head.append(target);
    } else {
      target.content = source.content;
    }
  }
  const sourceCanonical = incoming.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = sourceCanonical?.href ?? absolute(path);
  const sourceJsonLd = incoming.querySelector<HTMLScriptElement>('script[data-shekinah-jsonld]');
  let jsonLd = document.head.querySelector<HTMLScriptElement>('script[data-shekinah-jsonld]');
  if (!jsonLd) {
    jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.dataset.shekinahJsonld = '';
    document.head.append(jsonLd);
  }
  jsonLd.textContent = sourceJsonLd?.textContent ?? '[]';
}

export function getCommerceSeoSummary(pathValue: string): { title: string; description: string; price?: string } | null {
  const path = normalizePath(pathValue);
  const product = findProduct(path);
  if (product) {
    const price = formatPrice(product);
    return {
      title: `${product.name} — Shekinah`,
      description: productDescription(product),
      ...(price ? { price } : {}),
    };
  }
  const category = findCategory(path);
  if (category) return { title: `${category.name} — Productos Shekinah`, description: `Productos de ${category.name} disponibles en Shekinah.` };
  if (path === '/tienda/') return { title: 'Productos — Shekinah', description: 'Catálogo de productos de Shekinah.' };
  return null;
}
