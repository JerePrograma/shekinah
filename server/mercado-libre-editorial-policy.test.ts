import { admittedEditorialStatus, editorialCandidates, parseEditorialItem, transformEditorialDescription, validateEditorialImageUrl } from './mercado-libre-editorial-policy';

const picture = { id: '123-MLA98765', secure_url: 'https://http2.mlstatic.com/D_123-MLA98765-O.jpg' };
const base = { id: 'MLA12345678', seller_id: 445638367, site_id: 'MLA', title: 'Producto proveedor 100 g', status: 'active',
  attributes: [{ id: 'SELLER_SKU', value_name: 'SKU-123' }], seller_custom_field: null, pictures: [picture], variations: [],
  available_quantity: 999, price: 99999 };

it('acepta activos del vendedor autorizado y excluye campos transaccionales', () => {
  const item = parseEditorialItem(base)[0]!;
  expect(item).toMatchObject({ sku: 'SKU-123', status: 'active', pictures: [{ id: picture.id, url: picture.secure_url }] });
  expect(item).not.toHaveProperty('price'); expect(item).not.toHaveProperty('available_quantity');
  expect(admittedEditorialStatus('active')).toBe(true);
  expect(() => parseEditorialItem({ ...base, seller_id: 123 })).toThrow();
});

it.each(['paused', 'closed', 'under_review', 'inactive', 'deleted', 'unknown', 'ACTIVE', ''])('excluye el estado editorial %s', status => {
  expect(admittedEditorialStatus(status)).toBe(false);
  expect(editorialCandidates([{ code: 'SKU-123', barcodes: [] }], [{ ...parseEditorialItem(base)[0]!, status }])).toEqual([]);
});

it.each(['', '   ', 'x'.repeat(501), 'Producto\ninesperado', 'Producto\u0000', null, 123])('rechaza un título corrupto o fuera de contrato: %s', title => {
  expect(() => parseEditorialItem({ ...base, title })).toThrow();
});

it('conserva el título como texto presentacional validado, sin usarlo como identificador', () => {
  const unit = parseEditorialItem({ ...base, title: '  Producto Ñandú 500 Gr  ', attributes: [] })[0]!;
  expect(unit.title).toBe('Producto Ñandú 500 Gr');
  expect(editorialCandidates([{ code: unit.title, barcodes: [] }], [unit])).toEqual([]);
});

it('usa sólo imágenes y códigos propios de la variante exacta y conserva el orden del proveedor', () => {
  const second = { id: '456-MLA98765', secure_url: 'https://http2.mlstatic.com/D_456-MLA98765-O.jpg' };
  const variants = parseEditorialItem({ ...base, pictures: [picture, second], variations: [
    { id: 1, attributes: [{ id: 'SELLER_SKU', value_name: 'VAR-1' }], picture_ids: [second.id, picture.id, second.id] },
    { id: 2, attributes: [], picture_ids: [picture.id] },
  ] });
  expect(variants[0]?.pictures.map(p => p.id)).toEqual([second.id, picture.id]);
  expect(variants[0]?.sku).toBe('VAR-1'); expect(variants[1]?.sku).toBeNull();
  expect(() => parseEditorialItem({ ...base, variations: [{ id: 1, picture_ids: ['unknown'] }] })).toThrow();
});

it.each(['http://http2.mlstatic.com/image.jpg', 'https://http2.mlstatic.com.evil.test/image.jpg',
  'https://user@http2.mlstatic.com/image.jpg', 'https://http2.mlstatic.com/image.svg',
  'https://http2.mlstatic.com/image.jpg?redirect=https://evil.test', 'https://127.0.0.1/image.jpg'])('rechaza imagen arbitraria %s', value => {
  expect(() => validateEditorialImageUrl(value)).toThrow();
});

it('separa duplicados de SKU de coincidencias únicas sin aprobar por nombre o código solamente', () => {
  const unit = parseEditorialItem(base)[0]!;
  const dux = [{ code: 'SKU-123', barcodes: [] }, { code: 'NO-COINCIDE', barcodes: [] }];
  expect(editorialCandidates(dux, [unit])).toEqual([expect.objectContaining({ unique: true, state: 'pending_review', method: 'exact_sku' })]);
  const duplicate = { ...unit, itemId: 'MLA87654321' };
  expect(editorialCandidates(dux, [unit, duplicate]).every(c => !c.unique && c.state === 'pending_review')).toBe(true);
  expect(editorialCandidates([{ code: 'OTRO', barcodes: [] }], [unit])).toEqual([]);
});

it('mantiene dos variantes con el mismo identificador pendientes de revisión', () => {
  const units = parseEditorialItem({ ...base, variations: [1, 2].map(id => ({
    id, attributes: [{ id: 'SELLER_SKU', value_name: 'SKU-123' }], picture_ids: [picture.id],
  })) });
  expect(editorialCandidates([{ code: 'SKU-123', barcodes: [] }], units)).toEqual([
    expect.objectContaining({ variationId: '1', unique: false, state: 'pending_review' }),
    expect.objectContaining({ variationId: '2', unique: false, state: 'pending_review' }),
  ]);
});

it('retira únicamente líneas comerciales inequívocas sin alterar instrucciones o advertencias', () => {
  const original = 'Mantener el envase cerrado.\nNo usar durante el embarazo.\nAceptamos Mercado Pago.\nEnvíos a todo el país por Mercado Envíos.\nUsar 2 gotas.';
  expect(transformEditorialDescription(original)).toMatchObject({ original, removedLines: [3, 4], reviewLines: [],
    text: 'Mantener el envase cerrado.\nNo usar durante el embarazo.\nUsar 2 gotas.' });
});

it('envía referencias comerciales mezcladas a revisión conservando íntegro el original', () => {
  const original = 'Consultar por Mercado Libre antes de usar con otros productos.';
  expect(transformEditorialDescription(original)).toMatchObject({ original, text: null, reviewLines: [1], removedLines: [] });
  expect(transformEditorialDescription('')).toMatchObject({ text: null, original: '' });
});
