export const commercePrivacySections = [
  {
    id: 'privacy-commerce',
    title: 'Carrito y pagos',
    description:
      'El carrito se guarda en tu navegador sin nombre, celular ni domicilio. Cuando el pago online está disponible, Shekinah verifica precio y disponibilidad y confirma el total, incluido el envío cuando corresponde, antes de llevarte a Mercado Pago. El pago se realiza allí; volver a la tienda no confirma por sí solo un cobro. Shekinah no recibe datos de tarjeta.',
  },
  {
    id: 'privacy-web-requests',
    title: 'Solicitudes registradas en la web',
    description:
      'Al continuar la compra o enviar una solicitud, se guardan los productos, nombre y celular y, sólo para envío por correo, el domicilio necesario para gestionarla. Estos datos son de acceso administrativo y no se envían a WhatsApp por registrar la solicitud. El navegador conserva una referencia para recuperar la compra, sin guardar los datos de entrega. Registrar o aceptar una solicitud no confirma un cobro ni una reserva de mercadería.',
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
