import wordpressOriginal from './generated/wordpress-original-content.json';

export const site = {
  name: 'Shekinah',
  tagline: 'Herbolario & tienda gourmet',
  description:
    'Especias, hierbas, semillas, productos naturales y recetas recuperados de las fuentes originales de Shekinah.',
  locale: 'es-AR',
  origin: 'https://shekinah-7dl.pages.dev',
  email: 'german.gauna@yahoo.com.ar',
  legalName: 'Germán Ignacio Gauna',
  legalIdentifier: '20-25957366-2',
  address: 'Moreno 2575, Mar del Plata Norte (7600), Buenos Aires, Argentina',
} as const;

export const navigation = [
  { href: '/', label: 'Inicio' },
  { href: '/nosotros/', label: 'Nosotros' },
  { href: '/tienda/', label: 'Tienda' },
  { href: '/recetas/', label: 'Recetas' },
  { href: '/blog/', label: 'Blog' },
] as const;

export type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; text: string };

export interface ContentEntry {
  path: string;
  kind: 'page' | 'post' | 'recipe';
  title: string;
  description: string;
  eyebrow: string;
  image: string;
  imageAlt: string;
  publishedAt?: string;
  categories?: string[];
  ingredients?: string[];
  instructions?: string[];
  blocks: Block[];
}

interface WordPressOriginalContent {
  entries: ContentEntry[];
  source: {
    archiveFile: string;
    archiveSha256: string;
    archiveBytes: number;
    wxrFile: string;
    wxrSha256: string;
    capturedDate: string;
  };
}

const recovered = wordpressOriginal as unknown as WordPressOriginalContent;

/**
 * Contenido editorial recuperado de la extracción WordPress original.
 * La tienda y el catálogo se obtienen por separado desde Hostinger Ecommerce.
 */
export const entries: ContentEntry[] = recovered.entries;
export const wordpressOriginalSource = recovered.source;

export const posts = entries.filter((entry) => entry.kind === 'post');
export const recipes = entries.filter((entry) => entry.kind === 'recipe');

const editorialRoutes = [
  '/nosotros/',
  '/el-viaje-de-las-especias-sabor-y-bienestar/',
  '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/',
  '/chocolate-casero/',
  '/receta-barra-de-cereal/',
  '/terms-and-conditions/',
] as const;

export const canonicalRoutes: string[] = [
  ...new Set([
    '/',
    '/tienda/',
    '/blog/',
    '/recetas/',
    ...editorialRoutes,
    ...entries.map((entry) => entry.path),
    '/category/uncategorized/',
  ]),
];

export const redirects = [
  { from: '/inicio/', to: '/', status: 301 },
  { from: '/terminos-condiciones/', to: '/terms-and-conditions/', status: 301 },
] as const;

export function normalizePath(value: string): string {
  const path = value.split(/[?#]/u)[0] || '/';
  if (path === '/') return '/';
  return `/${path.replace(/^\/+|\/+$/gu, '')}/`;
}

export function findEntry(path: string): ContentEntry | undefined {
  const normalized = normalizePath(path);
  return entries.find((entry) => entry.path === normalized);
}
