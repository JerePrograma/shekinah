import { parseAdminRange, toCsv } from './admin';

describe('administración de sólo lectura', () => {
  it('neutraliza fórmulas y escapa celdas CSV', () => {
    const csv = toCsv(
      ['igual', 'más', 'menos', 'arroba', 'tab', 'texto', 'nulo', 'teléfono'],
      [[
        '  =SUM(A1:A2)', '+CMD', '-CMD', '@IMPORT', '\t=SUM(A1:A2)',
        'línea 1\nlínea "2"', null, '+5491155554444',
      ]],
    );
    expect(csv).toContain("\"'  =SUM(A1:A2)\"");
    expect(csv).toContain("\"'+CMD\"");
    expect(csv).toContain("\"'-CMD\"");
    expect(csv).toContain("\"'@IMPORT\"");
    expect(csv).toContain("\"'\t=SUM(A1:A2)\"");
    expect(csv).toContain('"línea 1\nlínea ""2"""');
    expect(csv).toContain(',"","\'+5491155554444"');
  });

  it('limita fechas, filas y paginación', () => {
    const range = parseAdminRange(new Request(
      'https://example.test/api/admin/orders?from=2026-07-01&to=2026-07-31&limit=100&offset=0',
    ));
    expect(range.limit).toBe(100);
    expect(() => parseAdminRange(new Request(
      'https://example.test/api/admin/orders?limit=10000',
    ))).toThrowError(expect.objectContaining({ code: 'INVALID_PAGINATION' }));
  });
});
