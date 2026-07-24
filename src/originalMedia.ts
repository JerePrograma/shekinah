export interface OriginalImage {
  src: string;
  alt: string;
}

export interface OriginalMediaSet {
  hero: OriginalImage;
  features?: OriginalImage[];
  featured?: OriginalImage;
  gallery?: OriginalImage[];
}

const originalMediaByPath: Record<string, OriginalMediaSet> = {
  '/': {
    hero: {
      src: '/images/original/home-spice-chest.jpg',
      alt: 'Especias de colores saliendo de un cofre de madera sobre un mapa antiguo.',
    },
    features: [
      {
        src: '/images/original/home-herb-jars.jpg',
        alt: 'Frascos de vidrio con hierbas de colores sobre una mesa rústica.',
      },
      {
        src: '/images/original/home-gourmet-dish.jpg',
        alt: 'Plato gourmet presentado con hierbas frescas y especias.',
      },
      {
        src: '/images/original/home-storefront.jpg',
        alt: 'Imagen vinculada a la presencia comercial de Shekinah.',
      },
    ],
    featured: {
      src: '/images/original/home-essence.png',
      alt: 'Composición botánica utilizada para representar la esencia de Shekinah.',
    },
  },
  '/nosotros/': {
    hero: {
      src: '/images/original/about-promise.png',
      alt: 'Composición de especias, hierbas y productos botánicos de Shekinah.',
    },
    gallery: [
      {
        src: '/images/original/about-spice-jars.jpg',
        alt: 'Frascos elegantes con especias sobre una mesa de madera.',
      },
      {
        src: '/images/original/about-map.jpg',
        alt: 'Mapa antiguo acompañado por especias e ilustraciones botánicas.',
      },
    ],
  },
  '/el-viaje-de-las-especias-sabor-y-bienestar/': {
    hero: {
      src: '/images/original/post-spice-journey.png',
      alt: 'Frascos de especias y hierbas sobre una mesa antigua con un fragmento de mapa.',
    },
  },
  '/el-poder-del-romero-memoria-milenaria-y-frescura-en-tu-cocina/': {
    hero: {
      src: '/images/original/post-rosemary.png',
      alt: 'Frasco de botica con hierbas y especias sobre un mapa antiguo.',
    },
  },
};

export function getOriginalMedia(path: string): OriginalMediaSet | undefined {
  return originalMediaByPath[path];
}
