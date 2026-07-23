export interface OriginalImage {
  src: string;
  alt: string;
}

export interface OriginalMediaSet {
  hero: OriginalImage;
  features?: OriginalImage[];
  featured?: OriginalImage;
  gallery?: OriginalImage[];
  testimonial?: {
    quote: string;
    author: string;
    rating: number;
  };
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
        alt: 'Imagen original vinculada a la presencia comercial de Shekinah.',
      },
    ],
    featured: {
      src: '/images/original/home-essence.png',
      alt: 'Composición botánica original utilizada para representar la esencia de Shekinah.',
    },
  },
  '/nosotros/': {
    hero: {
      src: '/images/original/about-promise.png',
      alt: 'Composición original de especias, hierbas y productos botánicos de Shekinah.',
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
    testimonial: {
      quote: 'Cada especia trae un pedazo de historia en sabores y bienestar, verdaderamente especial.',
      author: 'Ana M.',
      rating: 5,
    },
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
  '/chocolate-casero/': {
    hero: {
      src: '/images/original/recipe-chocolate.jpg',
      alt: 'Tabletas de chocolate casero sobre una mesa rústica.',
    },
    gallery: [
      {
        src: '/images/original/chocolate-finished.jpg',
        alt: 'Porciones de chocolate casero terminadas sobre una mesa de madera.',
      },
      {
        src: '/images/original/chocolate-pour.jpg',
        alt: 'Chocolate derretido siendo vertido en un molde.',
      },
      {
        src: '/images/original/chocolate-wrapped.jpg',
        alt: 'Tabletas de chocolate casero envueltas para regalar.',
      },
    ],
  },
  '/receta-barra-de-cereal/': {
    hero: {
      src: '/images/original/recipe-cereal-bars.jpg',
      alt: 'Barras caseras de cereal con frutos secos sobre una mesa rústica.',
    },
    gallery: [
      {
        src: '/images/original/cereal-closeup.jpg',
        alt: 'Primer plano de una barra de cereal con frutos secos.',
      },
      {
        src: '/images/original/cereal-assortment.jpg',
        alt: 'Surtido de barras de cereal envueltas en papel.',
      },
      {
        src: '/images/original/cereal-tea.jpg',
        alt: 'Barras de cereal apiladas junto a una taza de infusión.',
      },
    ],
    testimonial: {
      quote: 'Estas barras caseras son mi snack favorito, llenas de sabor y energía natural.',
      author: 'Ana M.',
      rating: 5,
    },
  },
};

export function getOriginalMedia(path: string): OriginalMediaSet | undefined {
  return originalMediaByPath[path];
}
