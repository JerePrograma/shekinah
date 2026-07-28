export const navigationItems = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#enfoque', label: 'Enfoque' },
  { href: '#catalogo', label: 'Catálogo' },
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
} as const;
