import { parseProducts } from '../../catalog/model';

export const catalogProductFixtures = parseProducts([
  {
    id: 'menta-seca',
    slug: 'menta-seca',
    path: '/menta-seca/',
    name: 'Menta seca',
    categorySlugs: ['hierbas'],
    categoryNames: ['Hierbas'],
    presentation: 'Bolsa de 50 g',
    price: { amount: 900, currency: 'ARS' },
    capturedAt: '2026-07-23',
  },
  {
    id: 'pimenton-dulce',
    slug: 'pimenton-dulce',
    path: '/pimenton-dulce/',
    name: 'Pimentón dulce',
    categorySlugs: ['especias'],
    categoryNames: ['Especias'],
    presentation: 'Frasco de 80 g',
    price: { amount: 1250, currency: 'ARS' },
    sku: 'PIM-DULCE',
    shortDescription: 'Especia aromática de sabor suave',
    primaryImage: {
      src: '/images/original/catalog/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
      alt: 'Pimentón dulce',
    },
    capturedAt: '2026-07-23',
  },
]);
