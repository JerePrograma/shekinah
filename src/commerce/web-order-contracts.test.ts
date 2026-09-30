import { parseAdminWebRequestDetail, parseDirectReservationReview, parseWebRequestReceipt } from './web-order-contracts';

const receipt = {
  reference: 'WEB-abcdefghijklmnopqrstuvwx',
  status: 'submitted',
  createdAt: '2026-09-08T12:00:00.000Z',
  updatedAt: '2026-09-08T12:00:00.000Z',
  publicToken: 'a'.repeat(64),
  paymentStatus: 'not_requested',
  paymentRequiresReview: false,
  reservationStatus: 'not_reserved',
  checkoutAvailable: false,
  totalMinor: null,
} as const;

it('la respuesta pública sólo reconstruye campos permitidos y no inventa cobro o reserva', () => {
  expect(parseWebRequestReceipt({ ...receipt, phone: '1234567890' })).toEqual(receipt);
  expect(() => parseWebRequestReceipt({ ...receipt, totalMinor: 0 })).toThrow();
  expect(() => parseWebRequestReceipt({ ...receipt, paymentStatus: 'approved' })).toThrow();
  expect(() => parseWebRequestReceipt({ ...receipt, reservationStatus: 'confirmed' })).toThrow();
  expect(() => parseWebRequestReceipt({ ...receipt, checkoutAvailable: true })).toThrow();
  expect(() => parseWebRequestReceipt({ ...receipt, paymentRequiresReview: 'false' })).toThrow();
  expect(() => parseWebRequestReceipt({ ...receipt, publicToken: 'invalid' })).toThrow();
});

it('admite checkout sólo con reserva y total definitivos y nunca durante un pago pendiente o final', () => {
  const ready = {
    ...receipt,
    status: 'accepted',
    reservationStatus: 'confirmed',
    checkoutAvailable: true,
    totalMinor: 123_400,
  } as const;
  expect(parseWebRequestReceipt(ready)).toEqual(ready);
  expect(() => parseWebRequestReceipt({ ...ready, reservationStatus: 'requires_review' })).toThrow();
  for (const paymentStatus of ['pending', 'approved', 'refunded'] as const) {
    expect(() => parseWebRequestReceipt({ ...ready, paymentStatus, checkoutAvailable: true })).toThrow();
  }
  expect(parseWebRequestReceipt({
    ...ready,
    paymentStatus: 'approved',
    paymentRequiresReview: true,
    checkoutAvailable: false,
  })).toMatchObject({ paymentStatus: 'approved', paymentRequiresReview: true, checkoutAvailable: false });
});

it('rechaza detalles administrativos sin snapshot y semántica de solicitud explícitos', () => {
  expect(() => parseAdminWebRequestDetail({ id: 'req_abcdefghijklmnopqrstuvwx', status: 'accepted', snapshot: { totalMinor: 10 } })).toThrow();
});

it('reconstruye sólo el diagnóstico administrativo con stock decimal y rechaza cantidades inválidas', () => {
  const review = { code: 'DUX-1', quantity: 2, duxOrderId: 100, duxOrderNumber: 200,
    before: { realStock: 12.68, reservedStock: 0, availableStock: 12.68 },
    after: { realStock: 10.68, reservedStock: 2, availableStock: 8.68 },
    beforeObservedAt: '2026-09-21T18:58:50.364Z', afterObservedAt: '2026-09-30T13:13:21.000Z' };
  expect(parseDirectReservationReview({ ...review, customer: 'no exponer', after: { ...review.after, token: 'no exponer' } })).toEqual(review);
  for (const invalid of [ { ...review, code: 'DUX\n1' }, { ...review, quantity: 0 }, { ...review, quantity: 1.5 },
    { ...review, duxOrderId: -1 }, { ...review, afterObservedAt: 'invalid' },
    { ...review, after: { ...review.after, realStock: NaN } }, { ...review, before: { ...review.before, reservedStock: -1 } } ]) {
    expect(() => parseDirectReservationReview(invalid)).toThrow();
  }
  expect(parseWebRequestReceipt({ ...receipt, reservationReview: review })).toEqual(receipt);
});
