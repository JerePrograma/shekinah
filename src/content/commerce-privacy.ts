export const commercePrivacySections = [
  {
    id: 'privacy-commerce',
    title: 'Carrito y pagos',
    description:
      'El carrito se guarda localmente en el navegador sin nombre, celular ni domicilio. Al iniciar un pago, Shekinah envía los productos y los datos necesarios para coordinar la entrega. El servidor normaliza esos datos, recalcula productos, peso, envío y total, y los conserva dentro del pedido para que el personal autorizado pueda prepararlo. El pago se completa por redirección en Mercado Pago y Shekinah no recibe datos de tarjeta.',
  },
  {
    id: 'privacy-analytics',
    title: 'Analítica first-party opcional',
    description:
      'Antes del consentimiento no se envían eventos analíticos. Al aceptar se crea una sesión aleatoria local y se registran únicamente eventos permitidos, ruta sin parámetros, producto opcional y categorías generales de fuente y dispositivo. Nombre, celular, domicilio y datos del pedido no se copian a la analítica.',
  },
  {
    id: 'privacy-retention',
    title: 'Retención y eliminación',
    description:
      'Los eventos analíticos se conservan por un máximo de 730 días y se purgan mensualmente. El consentimiento puede retirarse desde esta página; la aplicación solicita la eliminación de la sesión y mantiene una revocación temporal para impedir que esa misma sesión sea recreada.',
  },
] as const;
