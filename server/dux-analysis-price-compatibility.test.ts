import { spawnSync } from 'node:child_process';

import { parseDuxCatalogSourceItems } from './dux-catalog';

it('los dos analizadores aceptan el reader actual y conservan los cuatro estados sin precio local/ML', () => {
  const expected = [
    { prices: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 2500.25 }], status: 'usable', amount: 2500.25 },
    { prices: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 1 }], status: 'placeholder', amount: 1 },
    { prices: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 2 }], status: 'placeholder', amount: 2 },
    { prices: [], status: 'missing_or_zero', amount: null },
    { prices: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 0 }], status: 'missing_or_zero', amount: null },
    { prices: [{ id: 2, nombre: 'MERCADO LIBRE', precio: 9999 }], status: 'missing_or_zero', amount: null },
    { prices: 'invalid-list', status: 'invalid', amount: null },
    { prices: [null], status: 'invalid', amount: null },
    { prices: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: '3000' }], status: 'invalid', amount: null },
    { prices: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: -5 }], status: 'invalid', amount: null },
    { prices: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 2.000000001 }], status: 'invalid', amount: null },
    { prices: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: Number.POSITIVE_INFINITY }], status: 'invalid', amount: null },
    { prices: [{ id: 0, nombre: 'PRECIOS DEL NEGOCIO', precio: 3000 }], status: 'invalid', amount: null },
    { prices: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 3000 }, { id: 2, nombre: 'PRECIOS DEL NEGOCIO', precio: 3000 }], status: 'invalid', amount: null },
  ];
  const duxItems = parseDuxCatalogSourceItems({ datos: expected.map(({ prices }, index) => ({
    cod_item: `CODE-${index}`, item: `Producto de prueba ${index}`, habilitado: true, precios: prices,
  })) });
  expect(duxItems[0]?.prices?.[0]).toMatchObject({ id: 1, valid: true });
  const source = { schemaVersion: 1, generatedAt: '2026-09-06T12:00:00.000Z', readOnly: true,
    priceListName: 'PRECIOS DEL NEGOCIO', duxItems,
    localProducts: [{ id: 'local', slug: 'local', path: '/local/', name: 'Producto de prueba 6', sku: 'CODE-6',
      categorySlugs: [], categoryNames: [], price: { amount: 999_999, currency: 'ARS' }, images: [], variants: [] }],
    inventoryUnits: [], mercadoLibre: { units: [], freshByLegacyThreshold: false },
  };
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { buildDuxCatalogMatchingAnalysis } from './scripts/analyze-dux-catalog-matches.mjs';
    import { buildDuxEditorialLinkAnalysis } from './scripts/analyze-dux-editorial-links.mjs';
    const source = JSON.parse(process.argv[1]);
    const base = buildDuxCatalogMatchingAnalysis(source);
    const editorial = buildDuxEditorialLinkAnalysis(source, base);
    process.stdout.write(JSON.stringify({
      base: base.matches.map(({dux}) => ({amount:dux.publicPrice,status:dux.priceStatus})),
      editorial: editorial.proposals.map(({dux}) => ({amount:dux.publicPrice,status:dux.priceQuality})),
      quality:editorial.quality
    }));`, JSON.stringify(source)], { cwd: process.cwd(), encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout) as { base: unknown[]; editorial: unknown[]; quality: unknown };
  const states = expected.map(({ amount, status }) => ({ amount, status }));
  expect(report.base).toEqual(states);
  expect(report.editorial).toEqual(states);
  expect(report.quality).toMatchObject({ usablePublicPrice: 1, placeholderPublicPrice: 2,
    missingOrZeroPublicPrice: 3, invalidPublicPrice: 8, cutoverPriceBlockers: 13 });
});
