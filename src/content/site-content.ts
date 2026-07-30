import { appPaths } from '../routing/routes';

export const navigationItems = [
  { href: appPaths.home, label: 'Inicio' },
  { href: appPaths.catalog, label: 'Catálogo' },
] as const;

export const footerNavigationItems = [
  ...navigationItems,
  { href: appPaths.privacy, label: 'Privacidad' },
] as const;

export const siteContent = {
  brand: {
    name: 'Shekinah',
    descriptor: 'Hierbas y especias',
  },
  hero: {
    eyebrow: 'Hierbas y especias',
    title: 'Sabores naturales para todos los días.',
    summary:
      'Explorá hierbas, especias, alimentos y productos naturales en un catálogo amplio y fácil de recorrer.',
    primaryAction: 'Ver catálogo',
  },
  catalog: {
    eyebrow: 'Catálogo',
    title: 'Nuestros productos.',
    summary:
      'Buscá por nombre o explorá las categorías para encontrar lo que necesitás.',
    searchLabel: 'Buscar productos',
    searchPlaceholder: 'Buscar por nombre, categoría, presentación o SKU',
    categoryLabel: 'Filtrar por categoría',
    allCategoriesLabel: 'Todas las categorías',
    noResultsTitle: 'No se encontraron productos',
    noResultsDescription:
      'Probá con otra búsqueda o quitá el filtro de categoría.',
  },
  privacy: {
    eyebrow: 'Privacidad',
    title: 'Privacidad.',
    summary:
      'Este sitio no solicita datos personales ni utiliza herramientas de seguimiento.',
    sections: [
      {
        id: 'privacy-personal-data',
        title: 'Datos personales',
        description:
          'No solicitamos registros, cuentas ni información personal mediante este sitio.',
      },
      {
        id: 'privacy-tracking',
        title: 'Sin seguimiento',
        description:
          'No utilizamos analítica, publicidad ni rastreadores de terceros.',
      },
      {
        id: 'privacy-local-resources',
        title: 'Recursos del sitio',
        description:
          'Las imágenes y los recursos necesarios se cargan directamente desde Shekinah.',
      },
    ],
    hostingNote:
      'El proveedor de alojamiento puede generar registros técnicos necesarios para operar y proteger el servicio.',
  },
  notFound: {
    eyebrow: 'Error 404',
    title: 'Página no encontrada.',
    description:
      'La dirección solicitada no corresponde a una página de Shekinah.',
    action: 'Volver al inicio',
  },
} as const;
