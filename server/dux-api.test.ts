import { describe, expect, it } from 'vitest';

import {
  DUX_API_BASE_URL,
  DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE,
  DUX_MAX_HTTP_ATTEMPTS_PER_SYNC,
  DUX_MAX_ITEMS_PER_SYNC,
  DUX_SYNC_DEADLINE_MS,
  DuxApiClient,
  parseDuxItemPage,
  selectDuxItemStock,
} from './dux-api';
import type {
  DuxApiClientOptions,
  DuxFetch,
} from './dux-api';

const TEST_ACCESS_TOKEN = 'test-only-dux-access-token-not-a-secret';

type TestClientOptions = Omit<DuxApiClientOptions, 'accessToken' | 'fetch'>;

describe('Dux API v2', () => {
  describe('parser de items y stock', () => {
    it('parsea un item normal y conserva separados los stocks informados', () => {
      const item = parseDuxItemPage(duxPage([
        itemPayload([
          stockPayload({
            stock_real: 12,
            stock_reservado: 2,
            stock_disponible: 9,
          }),
        ]),
      ])).data[0];

      expect(item).toEqual(expect.objectContaining({
        code: 'HIERBA-001',
        externalCode: 'SKU-001',
        name: 'Hierba de prueba',
        barcodes: ['779000000001'],
        enabled: true,
        unitsPerPackage: 6.5,
      }));
      expect(item?.stocks[0]).toEqual(expect.objectContaining({
        realQuantity: 12,
        reservedQuantity: 2,
        availableQuantity: 9,
      }));
      expect(item?.stocks[0]?.availableQuantity).not.toBe(
        (item?.stocks[0]?.realQuantity ?? 0) - (item?.stocks[0]?.reservedQuantity ?? 0),
      );
    });

    it('preserva stock cero sin convertirlo en ausencia', () => {
      const item = firstItem(stockPayload({
        stock_real: 0,
        stock_reservado: 0,
        stock_disponible: 0,
      }));

      expect(selectDuxItemStock(item, { warehouseId: 10 }).availableQuantity).toBe(0);
    });

    it.each([738.5, 36.4, 2.44])(
      'preserva exactamente el stock decimal %s sin redondear ni truncar',
      (quantity) => {
        const item = firstItem(stockPayload({
          stock_real: quantity,
          stock_reservado: 0,
          stock_disponible: quantity,
        }));

        const selected = selectDuxItemStock(item, { warehouseId: 10 });
        expect(selected.availableQuantity).toBe(quantity);
        expect(selected.realQuantity).toBe(quantity);
        expect(Number.isInteger(selected.availableQuantity)).toBe(false);
      },
    );

    it('preserva stock negativo tal como lo informa Dux', () => {
      const item = firstItem(stockPayload({
        stock_real: -2.44,
        stock_reservado: 0,
        stock_disponible: -2.44,
      }));

      expect(selectDuxItemStock(item, { warehouseId: 10 }).availableQuantity).toBe(-2.44);
    });

    it('selecciona una variante sólo por depósito e id_det_item exactos', () => {
      const item = firstItem(
        stockPayload({
          id_det_item: 101,
          cod_barra_detalle: '779000000101',
          talle: 'A',
          color: 'Verde',
          stock_disponible: 36.4,
        }),
        stockPayload({
          id_det_item: 102,
          cod_barra_detalle: '779000000102',
          talle: 'B',
          color: 'Azul',
          stock_disponible: 2.44,
        }),
      );

      expect(() => selectDuxItemStock(item, { warehouseId: 10 })).toThrowError(
        expect.objectContaining({ code: 'DUX_STOCK_AMBIGUOUS' }),
      );
      expect(selectDuxItemStock(item, {
        warehouseId: 10,
        variantDetailId: 102,
      })).toEqual(expect.objectContaining({
        availableQuantity: 2.44,
        variantDetailId: 102,
        variantBarcode: '779000000102',
        size: 'B',
        color: 'Azul',
      }));
      expect(() => selectDuxItemStock(item, {
        warehouseId: 10,
        variantDetailId: 999,
      })).toThrowError(expect.objectContaining({ code: 'DUX_STOCK_NOT_FOUND' }));
    });

    it('marca explícitamente las semánticas que GET /v2/items no publica', () => {
      const item = firstItem(stockPayload({ stock_disponible: 1.25 }));
      const selected = selectDuxItemStock(item, { warehouseId: 10 });

      expect(item.inventorySemantics).toEqual({
        unitOfMeasure: DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE,
        weighable: DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE,
        decimalAllowed: DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE,
        divisibility: DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE,
      });
      expect(selected.inventorySemantics).toBe(item.inventorySemantics);
    });

    it.each([
      ['envoltorio ausente', {}],
      ['datos ausentes', { paginacion: pagination(0, 0, 50, false) }],
      ['paginación ausente', { datos: [] }],
      ['código ausente', duxPage([{ ...itemPayload([]), cod_item: undefined }])],
      ['nombre ausente', duxPage([{ ...itemPayload([]), item: undefined }])],
      ['stock ausente', duxPage([{ ...itemPayload([]), stock: undefined }])],
      ['habilitado ausente', duxPage([{ ...itemPayload([]), habilitado: undefined }])],
      ['stock no numérico', duxPage([itemPayload([
        stockPayload({ stock_disponible: '738.5' }),
      ])])],
      ['stock NaN', duxPage([itemPayload([
        stockPayload({ stock_disponible: Number.NaN }),
      ])])],
      ['stock infinito', duxPage([itemPayload([
        stockPayload({ stock_disponible: Number.POSITIVE_INFINITY }),
      ])])],
      ['paginación inválida', {
        datos: [],
        paginacion: pagination(0, 0, 51, false),
      }],
    ])('falla cerrado ante %s', (_caseName, payload) => {
      expect(() => parseDuxItemPage(payload)).toThrowError(
        expect.objectContaining({ code: 'DUX_RESPONSE_INVALID' }),
      );
    });
  });

  describe('cliente HTTP, paginación y rate limit', () => {
    it('usa exclusivamente la base oficial, Bearer y GET', async () => {
      let observedUrl: URL | null = null;
      let observedInit: RequestInit | undefined;
      const fetchImplementation: DuxFetch = (input, init) => {
        observedUrl = inputUrl(input);
        observedInit = init;
        return Promise.resolve(jsonResponse(duxPage([])));
      };
      const client = testClient(fetchImplementation);

      await client.listItemsPage({ warehouseId: 10, limit: 50 });

      const url = requiredObservedUrl(observedUrl);

      expect(url.origin + url.pathname).toBe(
        `${DUX_API_BASE_URL}/v2/items`,
      );
      expect(url.searchParams.get('id_deposito')).toBe('10');
      expect(url.searchParams.get('limit')).toBe('50');
      expect(observedInit?.method).toBe('GET');
      expect(observedInit?.redirect).toBe('manual');
      expect(new Headers(observedInit?.headers).get('authorization')).toBe(
        `Bearer ${TEST_ACCESS_TOKEN}`,
      );
      expect(observedInit?.body).toBeUndefined();
    });

    it('diagnostica un contrato inválido sin registrar valores del proveedor', async () => {
      const providerValueSentinel = 'provider-value-sentinel-never-log';
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const client = testClient(() => Promise.resolve(jsonResponse(duxPage([{
        id_empresa: providerValueSentinel,
        razon_social: providerValueSentinel,
      }]))));

      try {
        await expect(client.listEmpresas()).rejects.toMatchObject({
          code: 'DUX_RESPONSE_INVALID',
        });
        expect(warning).toHaveBeenCalledExactlyOnceWith(
          'dux_api_schema_failure',
          expect.objectContaining({
            version: 1,
            endpoint: '/v2/empresas',
            root: 'object',
            data: 'array',
            dataLength: 1,
            firstData: {
              id_empresa: 'string',
              razon_social: 'string',
            },
          }),
        );
        expect(JSON.stringify(warning.mock.calls)).not.toContain(providerValueSentinel);
      } finally {
        warning.mockRestore();
      }
    });

    it('admite listas de referencia terminales cuando Dux omite paginación', async () => {
      const client = testClient((input) => {
        const path = inputUrl(input).pathname;
        if (path.endsWith('/v2/empresas')) {
          return Promise.resolve(jsonResponse({
            datos: [{ id_empresa: 12862, razon_social: 'Empresa de prueba' }],
            id_solicitud: 'request-company',
          }));
        }
        if (path.endsWith('/v2/sucursales')) {
          return Promise.resolve(jsonResponse({
            datos: [{ id_sucursal: 1, id_empresa: 12862, sucursal: 'Sucursal de prueba' }],
            id_solicitud: 'request-branch',
          }));
        }
        return Promise.resolve(jsonResponse({
          datos: [{
            id_deposito: 25566,
            id_empresa: 12862,
            deposito: 'Depósito de prueba',
            habilitado: true,
          }],
          id_solicitud: 'request-warehouse',
        }));
      });

      await expect(client.listEmpresas()).resolves.toEqual([
        { id: 12862, legalName: 'Empresa de prueba' },
      ]);
      await expect(client.listSucursales(12862)).resolves.toEqual([
        { id: 1, companyId: 12862, name: 'Sucursal de prueba' },
      ]);
      await expect(client.listDepositos(25566)).resolves.toEqual([
        {
          id: 25566,
          companyId: 12862,
          name: 'Depósito de prueba',
          enabled: true,
        },
      ]);
    });

    it.each([300, 302, 399])(
      'rechaza la redirección %s sin seguirla ni leer su cuerpo',
      async (providerStatus) => {
        const redirectSentinel = 'redirect-target-sentinel-never-log';
        const cancel = vi.fn(() => new Promise<void>(() => undefined));
        const getReader = vi.fn(() => {
          throw new Error('El cuerpo de una redirección no debe leerse.');
        });
        const response = {
          status: providerStatus,
          body: { cancel, getReader },
          headers: new Headers({ location: `https://invalid.example/${redirectSentinel}` }),
          get ok() {
            throw new Error('Una redirección debe clasificarse antes de consultar ok.');
          },
        } as unknown as Response;
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchImplementation: DuxFetch = vi.fn(() => Promise.resolve(response));
        const client = testClient(fetchImplementation);

        try {
          await expect(client.listEmpresas()).rejects.toMatchObject({
            status: 502,
            code: 'DUX_PROVIDER_REJECTED',
            providerStatus,
          });
          expect(fetchImplementation).toHaveBeenCalledTimes(1);
          expect(fetchImplementation).toHaveBeenCalledWith(
            expect.any(URL),
            expect.objectContaining({ redirect: 'manual' }),
          );
          expect(cancel).toHaveBeenCalledOnce();
          expect(getReader).not.toHaveBeenCalled();
          expect(warning).toHaveBeenCalledExactlyOnceWith(
            'dux_api_transport_failure',
            {
              version: 2,
              kind: 'provider_redirect',
              endpoint: '/v2/empresas',
              providerStatus,
              attempts: 1,
              phase: 'classify_response',
              errorClass: 'redirect_rejected',
              headersReceived: true,
            },
          );
          expect(JSON.stringify(warning.mock.calls)).not.toContain(redirectSentinel);
        } finally {
          warning.mockRestore();
        }
      },
    );

    it('pagina /v2/items de a 50 sin hacer una llamada por producto', async () => {
      const urls: URL[] = [];
      const beforeRequest = vi.fn(() => Promise.resolve());
      const fetchImplementation: DuxFetch = (input) => {
        const url = inputUrl(input);
        urls.push(url);
        const offset = Number(url.searchParams.get('offset'));
        return Promise.resolve(jsonResponse(offset === 0
          ? duxPage([itemPayload([])], 2, 0, 50, true)
          : duxPage([itemPayload([])], 2, 50, 50, false)));
      };
      const client = testClient(fetchImplementation, { beforeRequest });

      const items = await client.listItems({ warehouseId: 10 });

      expect(items).toHaveLength(2);
      expect(urls).toHaveLength(2);
      expect(urls.map((url) => url.searchParams.get('offset'))).toEqual(['0', '50']);
      expect(urls.map((url) => url.searchParams.get('limit'))).toEqual(['50', '50']);
      expect(beforeRequest).toHaveBeenCalledTimes(2);
    });

    it('rechaza una paginación cuyo total cambia o no coincide con las filas recibidas', async () => {
      const changingTotal = testClient((input) => {
        const offset = Number(inputUrl(input).searchParams.get('offset'));
        return Promise.resolve(jsonResponse(offset === 0
          ? duxPage([itemPayload([])], 2, 0, 50, true)
          : duxPage([itemPayload([])], 3, 50, 50, false)));
      });
      await expect(changingTotal.listItems()).rejects.toMatchObject({
        status: 502,
        code: 'DUX_RESPONSE_INVALID',
      });

      const truncated = testClient(() => Promise.resolve(jsonResponse(
        duxPage([itemPayload([])], 2, 0, 50, false),
      )));
      await expect(truncated.listItems()).rejects.toMatchObject({
        status: 502,
        code: 'DUX_RESPONSE_INVALID',
      });
    });

    it('admite hasta 20 páginas y rechaza un total mayor antes de agotar el scheduler', async () => {
      const offsets: number[] = [];
      const pageItems = Array.from({ length: 50 }, () => itemPayload([]));
      const client = testClient((input) => {
        const offset = Number(inputUrl(input).searchParams.get('offset'));
        offsets.push(offset);
        return Promise.resolve(jsonResponse(duxPage(
          pageItems,
          DUX_MAX_ITEMS_PER_SYNC,
          offset,
          50,
          offset < 950,
        )));
      });

      await expect(client.listItems()).resolves.toHaveLength(DUX_MAX_ITEMS_PER_SYNC);
      expect(offsets).toHaveLength(20);
      expect(offsets.at(-1)).toBe(950);

      let oversizedCalls = 0;
      const oversized = testClient(() => {
        oversizedCalls += 1;
        return Promise.resolve(jsonResponse(duxPage(
          pageItems,
          DUX_MAX_ITEMS_PER_SYNC + 1,
          0,
          50,
          true,
        )));
      });
      await expect(oversized.listItems()).rejects.toMatchObject({
        status: 502,
        code: 'DUX_PAGINATION_LIMIT',
      });
      expect(oversizedCalls).toBe(1);
      expect(DUX_MAX_ITEMS_PER_SYNC).toBe(1_000);
    });

    it('serializa solicitudes concurrentes con un intervalo mínimo de 5000 ms', async () => {
      let now = 0;
      const starts: number[] = [];
      const sleeps: number[] = [];
      const fetchImplementation: DuxFetch = (input) => {
        const url = inputUrl(input);
        starts.push(now);
        if (url.pathname.endsWith('/v2/empresas')) {
          return Promise.resolve(jsonResponse(duxPage([
            { id_empresa: 1, razon_social: 'Shekinah' },
          ])));
        }
        return Promise.resolve(jsonResponse(duxPage([
          {
            id_deposito: 10,
            id_empresa: 1,
            deposito: 'Principal',
            habilitado: true,
          },
        ])));
      };
      const client = new DuxApiClient({
        accessToken: TEST_ACCESS_TOKEN,
        fetch: fetchImplementation,
        clock: () => now,
        sleep: (milliseconds) => {
          sleeps.push(milliseconds);
          now += milliseconds;
          return Promise.resolve();
        },
      });

      await Promise.all([client.listEmpresas(), client.listDepositos()]);

      expect(starts).toEqual([0, 5_000]);
      expect(sleeps).toEqual([5_000]);
    });

    it('mide el intervalo desde el fetch aunque el heartbeat consuma tiempo', async () => {
      let now = 0;
      let heartbeatCalls = 0;
      const starts: number[] = [];
      const sleeps: number[] = [];
      const client = new DuxApiClient({
        accessToken: TEST_ACCESS_TOKEN,
        fetch: () => {
          starts.push(now);
          return Promise.resolve(jsonResponse(duxPage([
            { id_empresa: 1, razon_social: 'Shekinah' },
          ])));
        },
        clock: () => now,
        monotonicClock: () => now,
        beforeRequest: () => {
          heartbeatCalls += 1;
          if (heartbeatCalls === 1) now += 4_000;
          return Promise.resolve();
        },
        sleep: (milliseconds) => {
          sleeps.push(milliseconds);
          now += milliseconds;
          return Promise.resolve();
        },
      });

      await Promise.all([client.listEmpresas(), client.listEmpresas()]);

      expect(starts).toEqual([4_000, 9_000]);
      expect(sleeps).toEqual([5_000]);
    });

    it('reintenta 429 respetando Retry-After', async () => {
      let calls = 0;
      const sleeps: number[] = [];
      const fetchImplementation: DuxFetch = () => {
        calls += 1;
        return Promise.resolve(calls === 1
          ? jsonResponse(
            { error: { codigo: 'RATE_LIMIT', reintentar_en_segundos: 2 } },
            429,
            { 'retry-after': '7' },
          )
          : jsonResponse(duxPage([])));
      };
      const client = testClient(fetchImplementation, {
        sleep: (milliseconds) => {
          sleeps.push(milliseconds);
          return Promise.resolve();
        },
      });

      await expect(client.listItemsPage()).resolves.toEqual(expect.objectContaining({ data: [] }));
      expect(calls).toBe(2);
      expect(sleeps).toEqual([7_000]);
    });

    it('usa error.reintentar_en_segundos cuando Retry-After no está presente', async () => {
      let calls = 0;
      const sleeps: number[] = [];
      const fetchImplementation: DuxFetch = () => {
        calls += 1;
        return Promise.resolve(calls === 1
          ? jsonResponse({ error: { reintentar_en_segundos: 4 } }, 429)
          : jsonResponse(duxPage([])));
      };
      const client = testClient(fetchImplementation, {
        sleep: (milliseconds) => {
          sleeps.push(milliseconds);
          return Promise.resolve();
        },
      });

      await client.listItemsPage();

      expect(sleeps).toEqual([4_000]);
    });

    it('distingue un 5xx terminal de una excepción fetch sin registrar datos sensibles', async () => {
      const tokenSentinel = 'dux-token-sentinel-never-log';
      const bodySentinel = 'provider-body-sentinel-never-log';
      const errorSentinel = 'fetch-error-sentinel-never-log';
      const companyIdSentinel = 987654321;
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const common = {
        accessToken: tokenSentinel,
        maxGetAttempts: 2,
        maxRetryDelayMs: 0,
        minRequestIntervalMs: 0,
        sleep: () => Promise.resolve(),
      };
      const httpFetch = vi.fn(() => Promise.resolve(new Response(
        JSON.stringify({ error: bodySentinel }),
        {
          status: 503,
          headers: { 'content-type': 'application/json' },
        },
      )));
      const failingFetch = vi.fn(() => Promise.reject(new TypeError(errorSentinel)));

      try {
        const httpClient = new DuxApiClient({ ...common, fetch: httpFetch });
        await expect(
          httpClient.listSucursales(companyIdSentinel),
        ).rejects.toMatchObject({
          status: 503,
          code: 'DUX_UNAVAILABLE',
          providerStatus: 503,
        });

        const exceptionClient = new DuxApiClient({ ...common, fetch: failingFetch });
        await expect(
          exceptionClient.listSucursales(companyIdSentinel),
        ).rejects.toMatchObject({
          status: 503,
          code: 'DUX_UNAVAILABLE',
          providerStatus: null,
        });

        expect(warning.mock.calls).toEqual([
          [
            'dux_api_transport_failure',
            {
              version: 2,
              kind: 'upstream_5xx',
              endpoint: '/v2/sucursales',
              providerStatus: 503,
              attempts: 2,
              phase: 'classify_response',
              errorClass: 'http_status',
              headersReceived: true,
            },
          ],
          [
            'dux_api_transport_failure',
            {
              version: 2,
              kind: 'fetch_exception',
              endpoint: '/v2/sucursales',
              providerStatus: null,
              attempts: 2,
              phase: 'fetch_headers',
              errorClass: 'type_error',
              headersReceived: false,
            },
          ],
        ]);
        expect(httpFetch).toHaveBeenCalledTimes(2);
        expect(failingFetch).toHaveBeenCalledTimes(2);
        expect(warning).toHaveBeenCalledTimes(2);

        const serializedDiagnostics = JSON.stringify(warning.mock.calls);
        expect(serializedDiagnostics).not.toContain(tokenSentinel);
        expect(serializedDiagnostics).not.toContain(bodySentinel);
        expect(serializedDiagnostics).not.toContain(errorSentinel);
        expect(serializedDiagnostics).not.toContain(String(companyIdSentinel));
        expect(serializedDiagnostics).not.toContain('id_empresa');
        expect(serializedDiagnostics).not.toContain('Authorization');
        expect(serializedDiagnostics).not.toContain('Bearer');
      } finally {
        warning.mockRestore();
      }
    });

    it('conserva status y fase cuando falla la lectura del cuerpo', async () => {
      const bodyErrorSentinel = 'body-stream-sentinel-never-log';
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fetchImplementation: DuxFetch = vi.fn(() => Promise.resolve(new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new TypeError(`Network connection lost ${bodyErrorSentinel}`));
          },
        }),
        { status: 502 },
      )));
      const client = testClient(fetchImplementation, { maxGetAttempts: 1 });

      try {
        await expect(client.listEmpresas()).rejects.toMatchObject({
          status: 503,
          code: 'DUX_UNAVAILABLE',
          providerStatus: null,
        });
        expect(warning).toHaveBeenCalledExactlyOnceWith(
          'dux_api_transport_failure',
          {
            version: 2,
            kind: 'fetch_exception',
            endpoint: '/v2/empresas',
            providerStatus: 502,
            attempts: 1,
            phase: 'read_body',
            errorClass: 'network_connection_lost',
            headersReceived: true,
          },
        );
        expect(JSON.stringify(warning.mock.calls)).not.toContain(bodyErrorSentinel);
      } finally {
        warning.mockRestore();
      }
    });

    it('sanitiza una excepción durante la clasificación de la respuesta', async () => {
      const classifyErrorSentinel = 'classify-sentinel-never-log';
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const response = {
        status: 418,
        headers: new Headers(),
        body: null,
        get ok(): boolean {
          throw new TypeError(classifyErrorSentinel);
        },
      } as unknown as Response;
      const client = testClient(() => Promise.resolve(response), { maxGetAttempts: 1 });

      try {
        await expect(client.listEmpresas()).rejects.toMatchObject({
          status: 503,
          code: 'DUX_UNAVAILABLE',
          providerStatus: null,
        });
        expect(warning).toHaveBeenCalledExactlyOnceWith(
          'dux_api_transport_failure',
          {
            version: 2,
            kind: 'fetch_exception',
            endpoint: '/v2/empresas',
            providerStatus: 418,
            attempts: 1,
            phase: 'classify_response',
            errorClass: 'type_error',
            headersReceived: true,
          },
        );
        expect(JSON.stringify(warning.mock.calls)).not.toContain(classifyErrorSentinel);
      } finally {
        warning.mockRestore();
      }
    });

    it('reintenta errores de red sólo hasta el límite configurado', async () => {
      let calls = 0;
      const fetchImplementation: DuxFetch = () => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new TypeError('network failed'))
          : Promise.resolve(jsonResponse(duxPage([])));
      };
      const client = testClient(fetchImplementation);

      await expect(client.listItemsPage()).resolves.toEqual(expect.objectContaining({ data: [] }));
      expect(calls).toBe(2);
    });

    it('aplica un presupuesto global de subrequests aun cuando cada lectura reintenta', async () => {
      let calls = 0;
      const beforeRequest = vi.fn(() => Promise.resolve());
      const fetchImplementation: DuxFetch = () => {
        calls += 1;
        if (calls % 2 === 1) return Promise.reject(new TypeError('network failed'));
        return Promise.resolve(jsonResponse(duxPage([
          { id_empresa: 1, razon_social: 'Shekinah' },
        ])));
      };
      const client = testClient(fetchImplementation, {
        beforeRequest,
        maxGetAttempts: 3,
        maxTotalRequestAttempts: 4,
      });

      await expect(client.listEmpresas()).resolves.toHaveLength(1);
      await expect(client.listEmpresas()).resolves.toHaveLength(1);
      await expect(client.listEmpresas()).rejects.toMatchObject({
        status: 503,
        code: 'DUX_SUBREQUEST_BUDGET_EXHAUSTED',
      });
      expect(calls).toBe(4);
      expect(beforeRequest).toHaveBeenCalledTimes(4);
      expect(DUX_MAX_HTTP_ATTEMPTS_PER_SYNC).toBe(45);
    });

    it('falla por deadline antes de una espera que agotaría los siete minutos', async () => {
      let monotonicNow = 0;
      const sleep = vi.fn(() => Promise.resolve());
      const fetchImplementation: DuxFetch = vi.fn(() => Promise.resolve(jsonResponse(duxPage([
        { id_empresa: 1, razon_social: 'Shekinah' },
      ]))));
      const client = testClient(fetchImplementation, {
        minRequestIntervalMs: 2_000,
        monotonicClock: () => monotonicNow,
        sleep,
        syncDeadlineMs: 1_000,
      });

      await expect(client.listEmpresas()).resolves.toHaveLength(1);
      monotonicNow = 1;
      await expect(client.listEmpresas()).rejects.toMatchObject({
        status: 503,
        code: 'DUX_SYNC_DEADLINE_EXCEEDED',
      });
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(DUX_SYNC_DEADLINE_MS).toBe(420_000);
    });

    it('rechaza un retry que no cabe en el deadline sin dormir ni abrir otro fetch', async () => {
      const sleep = vi.fn(() => Promise.resolve());
      const fetchImplementation: DuxFetch = vi.fn(() => Promise.resolve(jsonResponse(
        { error: { codigo: 'RATE_LIMIT' } },
        429,
        { 'retry-after': '2' },
      )));
      const client = testClient(fetchImplementation, {
        monotonicClock: () => 0,
        sleep,
        syncDeadlineMs: 1_000,
      });

      await expect(client.listEmpresas()).rejects.toMatchObject({
        status: 503,
        code: 'DUX_SYNC_DEADLINE_EXCEEDED',
      });
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('revalida el reloj monotónico después del fetch y acota la opción a siete minutos', async () => {
      let monotonicNow = 0;
      const fetchImplementation: DuxFetch = vi.fn(() => {
        monotonicNow = 1_000;
        return Promise.resolve(jsonResponse(duxPage([
          { id_empresa: 1, razon_social: 'Shekinah' },
        ])));
      });
      const client = testClient(fetchImplementation, {
        monotonicClock: () => monotonicNow,
        syncDeadlineMs: 1_000,
      });

      await expect(client.listEmpresas()).rejects.toMatchObject({
        status: 503,
        code: 'DUX_SYNC_DEADLINE_EXCEEDED',
      });
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
      expect(() => testClient(fetchImplementation, {
        syncDeadlineMs: DUX_SYNC_DEADLINE_MS + 1,
      })).toThrow('syncDeadlineMs no es válido');
    });

    it.each([
      [401, 'DUX_AUTH_FAILED'],
      [403, 'DUX_ACCESS_FORBIDDEN'],
    ])('no reintenta respuestas %s', async (status, code) => {
      let calls = 0;
      const fetchImplementation: DuxFetch = () => {
        calls += 1;
        return Promise.resolve(jsonResponse({ error: { codigo: 'DENIED' } }, status));
      };
      const client = testClient(fetchImplementation);

      await expect(client.listEmpresas()).rejects.toMatchObject({ status: 503, code });
      expect(calls).toBe(1);
    });

    it('aborta por timeout y falla cerrado sin esperar tiempos reales largos', async () => {
      let calls = 0;
      const fetchImplementation: DuxFetch = (_input, init) => {
        calls += 1;
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal === undefined || signal === null) {
            reject(new Error('Signal ausente'));
            return;
          }
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      };
      const client = testClient(fetchImplementation, {
        requestTimeoutMs: 1,
        maxGetAttempts: 1,
      });

      await expect(client.listEmpresas()).rejects.toMatchObject({
        status: 503,
        code: 'DUX_TIMEOUT',
      });
      expect(calls).toBe(1);
    });
  });
});

function testClient(
  fetchImplementation: DuxFetch,
  options: TestClientOptions = {},
): DuxApiClient {
  return new DuxApiClient({
    accessToken: TEST_ACCESS_TOKEN,
    fetch: fetchImplementation,
    minRequestIntervalMs: 0,
    sleep: () => Promise.resolve(),
    ...options,
  });
}

function firstItem(...stocks: readonly unknown[]) {
  const item = parseDuxItemPage(duxPage([itemPayload(stocks)])).data[0];
  if (item === undefined) throw new Error('Fixture Dux inválido.');
  return item;
}

function itemPayload(stocks: readonly unknown[]) {
  return {
    cod_item: 'HIERBA-001',
    item: 'Hierba de prueba',
    codigos_barra: ['779000000001'],
    stock: stocks,
    habilitado: true,
    codigo_externo: 'SKU-001',
    ctd_unidades_por_bulto: 6.5,
  };
}

function stockPayload(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: 10,
    nombre: 'Depósito principal',
    stock_real: 10,
    stock_reservado: 0,
    stock_disponible: 10,
    ...overrides,
  };
}

function duxPage(
  data: readonly unknown[],
  total = data.length,
  offset = 0,
  limit = 50,
  hasMore = false,
) {
  return {
    datos: data,
    paginacion: pagination(total, offset, limit, hasMore),
    id_solicitud: 'request-test-1',
  };
}

function pagination(total: number, offset: number, limit: number, hasMore: boolean) {
  return { total, offset, limit, hay_mas: hasMore };
}

function jsonResponse(
  value: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

function inputUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
}

function requiredObservedUrl(value: URL | null): URL {
  if (value === null) throw new Error('La prueba no observó una solicitud Dux.');
  return value;
}
