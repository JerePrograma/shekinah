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
      'Shekinah presenta un espacio claro y accesible para consultar el catálogo comercial recuperado.',
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
          'Los datos comerciales indican su fecha de captura y conservan los faltantes de la fuente.',
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
    title: 'Catálogo de productos.',
    summary:
      'Explorá 510 productos recuperados con sus precios, categorías y datos disponibles.',
    historicalNotice:
      'Información comercial capturada el 23/07/2026. Los precios y la disponibilidad no se actualizan en tiempo real.',
    healthNotice:
      'La información reproduce el catálogo comercial recuperado y no sustituye el asesoramiento de profesionales de la salud. Ante dudas sobre consumo, interacciones o tratamientos, consultá a un profesional.',
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
