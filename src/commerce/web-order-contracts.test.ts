import { parseAdminWebRequestDetail, parseWebRequestReceipt } from './web-order-contracts';

const receipt = { reference: 'WEB-abcdefghijklmnopqrstuvwx', status: 'submitted', createdAt: '2026-09-08T12:00:00.000Z',
  updatedAt: '2026-09-08T12:00:00.000Z', publicToken: 'a'.repeat(64), paymentStatus: 'not_requested', reservationStatus: 'not_reserved', totalMinor: null };
it('la respuesta pública sólo admite una solicitud, sin inventar cobro o reserva', () => {
  expect(parseWebRequestReceipt({ ...receipt, phone: '1234567890' })).toEqual(receipt);
  expect(() => parseWebRequestReceipt({ ...receipt, totalMinor: 0 })).toThrow();
  expect(() => parseWebRequestReceipt({ ...receipt, paymentStatus: 'approved' })).toThrow();
  expect(() => parseWebRequestReceipt({ ...receipt, reservationStatus: 'confirmed' })).toThrow();
  expect(() => parseWebRequestReceipt({ ...receipt, publicToken: 'invalid' })).toThrow();
});
it('rechaza detalles administrativos sin snapshot y semántica de solicitud explícitos', () => {
  expect(() => parseAdminWebRequestDetail({ id: 'req_abcdefghijklmnopqrstuvwx', status: 'accepted', snapshot: { totalMinor: 10 } })).toThrow();
});
