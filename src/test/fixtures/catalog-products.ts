import { parseProducts } from '../../catalog/model';

export const catalogProductFixtures = parseProducts([
  {
    id: 'menta-seca',
    name: 'Menta seca',
    category: 'Hierbas',
    presentation: 'Bolsa de 50 g',
  },
  {
    id: 'pimenton-dulce',
    name: 'Pimentón dulce',
    category: 'Especias',
    presentation: 'Frasco de 80 g',
    price: {
      amount: 1250,
      currency: 'ARS',
    },
  },
]);
