export const commercePrivacySections = [
  {
    id: 'privacy-commerce',
    title: 'Carrito y pagos',
    description:
      'El carrito se guarda localmente en el navegador sin nombre, celular ni domicilio. El sitio no solicita ni copia un importe manual para Mercado Pago: cuando Checkout Pro está habilitado, Shekinah envía identidades y cantidades al backend, que revalida Mercado Libre, calcula productos, envío y total, registra la orden y crea la preferencia antes de redirigir. Los datos de entrega sólo se incluyen en el pedido confirmado por el comprador. Shekinah no recibe datos de tarjeta.',
  },
  {
    id: 'privacy-analytics',
    title: 'Analítica first-party opcional',
    description:
      'Antes del consentimiento no se envían eventos analíticos. Al aceptar se crea una sesión aleatoria local y se registran únicamente eventos permitidos, ruta sin parámetros, producto opcional y categorías generales de fuente y dispositivo. El inicio de Checkout Pro y la apertura de WhatsApp se miden como interacciones, no como pagos, sin monto ni contenido del carrito. Los eventos históricos del flujo manual retirado conservan su significado original. Nombre, celular, domicilio y datos del pedido no se copian a la analítica.',
  },
  {
    id: 'privacy-retention',
    title: 'Retención y eliminación',
    description:
      'Los eventos analíticos se conservan por un máximo de 730 días y se purgan mensualmente. El consentimiento puede retirarse desde esta página; la aplicación solicita la eliminación de la sesión y mantiene una revocación temporal para impedir que esa misma sesión sea recreada.',
  },
] as const;
