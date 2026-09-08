/** Estado financiero separado de la aceptación y del cumplimiento del pedido. */
export type PaymentState = 'none' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';

export type OrderPaymentState = Readonly<{
  status: PaymentState;
  requiresReview: boolean;
  updatedAt: string | null;
}>;

export function parseOrderPaymentState(value: unknown): OrderPaymentState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('El servidor devolvió un estado financiero inválido.');
  }
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (
    (status !== 'none' && status !== 'pending' && status !== 'approved' &&
      status !== 'rejected' && status !== 'cancelled' && status !== 'refunded') ||
    typeof record.requiresReview !== 'boolean' ||
    (record.updatedAt !== null &&
      (typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))))
  ) {
    throw new Error('El servidor devolvió un estado financiero inválido.');
  }
  return Object.freeze({ status, requiresReview: record.requiresReview, updatedAt: record.updatedAt });
}

export function paymentStateLabel(status: PaymentState): string {
  const labels: Record<PaymentState, string> = {
    none: 'Sin pago confirmado', pending: 'Pago pendiente', approved: 'Pago recibido',
    rejected: 'Pago rechazado', cancelled: 'Pago cancelado', refunded: 'Pago reintegrado o revertido',
  };
  return labels[status];
}

export function paymentStatePresentation(payment: OrderPaymentState): Readonly<{ title: string; message: string }> {
  if (payment.status === 'approved') {
    return payment.requiresReview
      ? { title: 'Pago recibido. Pedido en revisión', message: 'El pago está registrado. El comercio debe revisar el pedido antes de confirmar su preparación. No vuelvas a pagar este pedido.' }
      : { title: 'Pago aprobado', message: 'Mercado Pago confirmó el pago. La preparación y la entrega se gestionan por separado.' };
  }
  if (payment.status === 'refunded') {
    return { title: 'Pago reintegrado o revertido', message: 'El servidor registró el reintegro o la reversión del pago. Esto no confirma una devolución de mercadería ni la liberación de una reserva.' };
  }
  if (payment.status === 'none') {
    return { title: 'Pago no confirmado', message: 'Todavía no hay un pago verificado para este pedido. La aceptación comercial del pedido no significa que esté pagado.' };
  }
  if (payment.status === 'pending') {
    return { title: 'Pago pendiente', message: 'El pago todavía no tiene confirmación definitiva. No inicies otro pago mientras se verifica este intento.' };
  }
  return { title: paymentStateLabel(payment.status), message: 'El proveedor no confirmó un cobro por este intento. El estado del pedido y cualquier reserva se revisan por separado.' };
}
