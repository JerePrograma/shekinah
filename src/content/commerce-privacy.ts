export const commercePrivacySections = [
  {
    id: 'privacy-commerce',
    title: 'Carrito y pagos',
    description:
      'El carrito se guarda localmente en el navegador sin nombre, celular ni domicilio. En el cobro manual temporal, el sitio abre un Link de Pago de Mercado Pago sin monto predefinido: el comprador ingresa allí el total mostrado y Mercado Pago procesa el pago sin recibir el detalle del carrito desde Shekinah. Los datos de entrega sólo se incluyen en el mensaje de WhatsApp cuando están completos. Cuando el Checkout Pro integrado esté habilitado, Shekinah enviará productos y datos de entrega a su backend, que normaliza esos datos, recalcula productos, peso, envío y total y los conserva dentro del pedido. Shekinah no recibe datos de tarjeta.',
  },
  {
    id: 'privacy-analytics',
    title: 'Analítica first-party opcional',
    description:
      'Antes del consentimiento no se envían eventos analíticos. Al aceptar se crea una sesión aleatoria local y se registran únicamente eventos permitidos, ruta sin parámetros, producto opcional y categorías generales de fuente y dispositivo. El clic en el Link de Pago manual y la apertura de WhatsApp se miden como interacciones, no como pagos, sin monto ni contenido del carrito. Nombre, celular, domicilio y datos del pedido no se copian a la analítica.',
  },
  {
    id: 'privacy-retention',
    title: 'Retención y eliminación',
    description:
      'Los eventos analíticos se conservan por un máximo de 730 días y se purgan mensualmente. El consentimiento puede retirarse desde esta página; la aplicación solicita la eliminación de la sesión y mantiene una revocación temporal para impedir que esa misma sesión sea recreada.',
  },
] as const;
