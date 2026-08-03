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
      'El carrito funciona localmente. Los pagos se procesan por redirección en Mercado Pago y la analítica first-party permanece inactiva hasta un consentimiento explícito.',
    sections: [
      {
        id: 'privacy-personal-data',
        title: 'Datos personales',
        description:
          'El sitio no solicita cuentas, nombre, email, teléfono ni documento. Shekinah no recopila ni procesa datos de tarjeta.',
      },
      {
        id: 'privacy-third-parties',
        title: 'Servicios externos',
        description:
          'Al elegir pagar, el navegador se redirige a Mercado Pago. No se incorporan rastreadores, publicidad, fuentes externas ni analítica de terceros.',
      },
      {
        id: 'privacy-local-resources',
        title: 'Recursos del sitio',
        description:
          'Las imágenes y los recursos comerciales se cargan directamente desde Shekinah. El carrito y las preferencias de consentimiento se guardan en el navegador.',
      },
    ],
    hostingNote:
      'Cloudflare puede generar registros técnicos necesarios para operar y proteger el servicio. La aplicación no guarda direcciones IP ni user agents completos en sus tablas analíticas.',
  },
  notFound: {
    eyebrow: 'Error 404',
    title: 'Página no encontrada.',
    description:
      'La dirección solicitada no corresponde a una página de Shekinah.',
    action: 'Volver al inicio',
  },
} as const;
