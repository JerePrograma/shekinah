export const navigation = [
  { href: '/', label: 'Inicio' },
  { href: '/nosotros/', label: 'Nosotros' },
  { href: '/tienda/', label: 'Tienda' },
  { href: '/recetas/', label: 'Recetas' },
  { href: '/blog/', label: 'Blog' },
] as const;

export const footerNavigation = [
  ...navigation,
  { href: '/terms-and-conditions/', label: 'Términos y condiciones' },
] as const;
