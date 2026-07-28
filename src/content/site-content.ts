import { appPaths } from '../routing/routes';

export const navigationItems = [
  { href: appPaths.home, label: 'Inicio' },
  { href: appPaths.approach, label: 'Enfoque' },
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
    title: 'Una experiencia simple para descubrir nuevos sabores.',
    summary:
      'Shekinah presenta un espacio claro y accesible. El catálogo se incorporará únicamente cuando la información comercial esté confirmada.',
    primaryAction: 'Explorar catálogo',
    secondaryAction: 'Ver el enfoque',
    points: ['Lectura simple', 'Navegación directa', 'Datos verificables'],
  },
  approach: {
    eyebrow: 'Enfoque',
    title: 'Diseñado para orientarte con facilidad.',
    summary:
      'La estructura prioriza decisiones simples, información legible y una experiencia consistente en cualquier tamaño de pantalla.',
    principles: [
      {
        number: '01',
        title: 'Orientación inmediata',
        description:
          'Una jerarquía visual clara permite identificar cada sección sin esfuerzo.',
      },
      {
        number: '02',
        title: 'Contenido verificable',
        description:
          'Los datos comerciales se publicarán únicamente después de ser confirmados.',
      },
      {
        number: '03',
        title: 'Experiencia adaptable',
        description:
          'El diseño conserva su legibilidad en escritorio, tablet y teléfono.',
      },
    ],
  },
  catalog: {
    eyebrow: 'Catálogo',
    title: 'Información comercial en preparación.',
    summary:
      'Este espacio está listo para recibir el catálogo cuando sus datos hayan sido revisados y autorizados.',
    emptyTitle: 'Todavía no hay productos publicados',
    emptyDescription:
      'Se incorporarán únicamente nombres, presentaciones, categorías y precios confirmados.',
    searchLabel: 'Buscar productos',
    searchPlaceholder: 'Buscar por nombre, categoría o presentación',
    categoryLabel: 'Filtrar por categoría',
    allCategoriesLabel: 'Todas las categorías',
    noResultsTitle: 'No se encontraron productos',
    noResultsDescription:
      'Probá con otra búsqueda o quitá el filtro de categoría.',
  },
  privacy: {
    eyebrow: 'Privacidad',
    title: 'Privacidad clara, sin funciones ocultas.',
    summary:
      'Esta versión es una aplicación estática y describe únicamente comportamientos comprobables en su código publicado.',
    sections: [
      {
        id: 'privacy-no-collection',
        title: 'Sin recolección desde la aplicación',
        description:
          'No existen formularios, cuentas, carrito, pagos ni una base de datos de la aplicación.',
      },
      {
        id: 'privacy-no-tracking',
        title: 'Sin seguimiento integrado',
        description:
          'La aplicación no integra analítica, publicidad, trackers, iframes ni identificadores de terceros.',
      },
      {
        id: 'privacy-local-resources',
        title: 'Recursos del mismo origen',
        description:
          'No se solicitan APIs externas ni se cargan scripts, fuentes o imágenes remotas.',
      },
    ],
    hostingNote:
      'El proveedor de alojamiento y la red pueden generar registros técnicos propios para operar y proteger el servicio. Esta aplicación estática no consulta esos registros.',
  },
  notFound: {
    eyebrow: 'Error 404',
    title: 'Página no encontrada.',
    description:
      'La dirección solicitada no corresponde a una ruta pública de esta versión de Shekinah.',
    action: 'Volver al inicio',
  },
} as const;
