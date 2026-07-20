export const redirects = [
  { from: '/inicio/', to: '/', status: 301 },
  { from: '/terminos-condiciones/', to: '/terms-and-conditions/', status: 301 },
  { from: '/privacy-policy/', to: '/terms-and-conditions/', status: 302 },
  { from: '/hello-world/', to: '/blog/', status: 301 },
] as const;
