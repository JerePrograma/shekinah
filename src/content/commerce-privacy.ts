export const commercePrivacySections = [
  {
    id: 'privacy-commerce',
    title: 'Carrito y pagos',
    description:
      'El carrito se guarda localmente en el navegador. Al iniciar un pago, Shekinah envía al servidor sólo identificadores de producto y cantidades; el servidor vuelve a calcular disponibilidad y precios. El pago se completa por redirección en Mercado Pago y Shekinah no recibe datos de tarjeta.',
  },
  {
    id: 'privacy-analytics',
    title: 'Analítica first-party opcional',
    description:
      'Antes del consentimiento no se envían eventos analíticos. Al aceptar se crea una sesión aleatoria local y se registran únicamente eventos permitidos, ruta sin parámetros, producto opcional y categorías generales de fuente y dispositivo. No se almacenan nombre, email, teléfono, documento, IP ni user agent completo desde la aplicación.',
  },
  {
    id: 'privacy-retention',
    title: 'Retención',
    description:
      'La analítica permanece deshabilitada en producción hasta aprobar una política de retención. El consentimiento puede retirarse desde esta página y la aplicación solicitará la eliminación de la sesión y sus eventos.',
  },
] as const;
