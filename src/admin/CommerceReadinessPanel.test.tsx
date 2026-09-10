import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CommerceReadinessPanel } from './CommerceReadinessPanel';

const payload = Object.freeze({
  checkedAt: '2026-09-10T12:00:00.000Z',
  webRequests: {
    schemaReady: true,
    serverEnabled: false,
    tokenSecretConfigured: true,
    catalogSnapshotAvailable: true,
    catalogSnapshotFresh: true,
    totalCount: 3,
    submittedCount: 2,
    blockers: ['WEB_ORDERS_DISABLED'],
    warnings: [],
  },
  checkout: {
    serverEnabled: false,
    duxApiEnabled: false,
    paymentMode: 'production',
    paymentAccessTokenConfigured: true,
    webhookSecretConfigured: true,
    orderTokenSecretConfigured: true,
    publicSiteConfigured: true,
    guardCode: 'DUX_API_DISABLED',
    automaticDuxMutationAllowed: false,
    blockers: [
      'COMMERCE_DISABLED',
      'DUX_API_DISABLED',
      'DUX_ORDER_PRODUCT_SCHEMA_UNVERIFIED',
      'DUX_ORDER_REFERENCE_RECOVERY_UNVERIFIED',
      'DUX_ORDER_RELEASE_FINALIZE_UNVERIFIED',
    ],
  },
  dux: {
    schemaReady: true,
    apiEnabled: false,
    credentialsConfigured: true,
    snapshotCollectionEnabled: true,
    publicCatalogEnabled: true,
    publicCutoverEnabled: false,
    snapshotAvailable: true,
    snapshotItemCount: 749,
    snapshotSyncedAt: '2026-09-10T11:55:00.000Z',
    snapshotFresh: true,
    lastSyncStatus: 'succeeded',
    lastSyncCompletedAt: '2026-09-10T11:55:00.000Z',
    linkAttentionCount: 1,
    operationAttentionCount: 2,
    orderApiContract: {
      reviewedAt: '2026-09-10',
      createEndpoint: '/pedido/nuevopedido',
      queryEndpoint: '/pedidos',
      queryByReferenceDocumented: false,
      productObjectSchemaVerified: false,
      releaseOrFinalizeDocumented: false,
    },
  },
  attention: { paymentIncidentCount: 1 },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('muestra por separado esquema, flags, Dux y bloqueos de Checkout', async () => {
  vi.stubEnv('VITE_WEB_ORDERS_ENABLED', 'false');
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
  vi.stubGlobal('fetch', fetchMock);
  render(<CommerceReadinessPanel />);

  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Comprobar preparación comercial' }));
  expect(await screen.findByText(/Esquema 0020: sí · Backend: cerrado · Frontend: cerrado/)).toBeVisible();
  expect(screen.getByText(/Snapshot Dux: disponible y fresco/)).toBeVisible();
  expect(screen.getByText(/Solicitudes registradas: 3 · pendientes: 2/)).toBeVisible();
  expect(screen.getByText(/Mutación Dux automática segura: no habilitada/)).toBeVisible();
  expect(screen.getByText(/Vínculos Dux que requieren atención: 1 · operaciones: 2 · incidencias financieras: 1/)).toBeVisible();
  expect(screen.getByText(/El esquema interno de productos de Crear Pedido todavía no está verificado/)).toBeVisible();
  expect(screen.getByText(/Recuperación por referencia: no; detalle de productos: no; liberar\/finalizar: no/)).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin', redirect: 'error' });
});

it('actualiza el diagnóstico sin mutaciones', async () => {
  vi.stubEnv('VITE_WEB_ORDERS_ENABLED', 'true');
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(payload))
    .mockResolvedValueOnce(Response.json({
      ...payload,
      webRequests: { ...payload.webRequests, serverEnabled: true, blockers: [] },
    }));
  vi.stubGlobal('fetch', fetchMock);
  render(<CommerceReadinessPanel />);

  fireEvent.click(screen.getByRole('button', { name: 'Comprobar preparación comercial' }));
  await screen.findByText(/Esquema 0020: sí/);
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar diagnóstico' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/Esquema 0020: sí · Backend: abierto · Frontend: abierto/)).toBeVisible();
  expect(fetchMock.mock.calls.every((call) => call[1]?.method === undefined)).toBe(true);
});

it('expulsa la vista ante sesión vencida y no presenta un falso OK', async () => {
  const unauthorized = vi.fn();
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));
  render(<CommerceReadinessPanel onUnauthorized={unauthorized} />);

  fireEvent.click(screen.getByRole('button', { name: 'Comprobar preparación comercial' }));
  await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('alert')).toHaveTextContent('sesión administrativa venció');
  expect(screen.queryByText(/Mutación Dux automática segura/)).not.toBeInTheDocument();
});

it('rechaza respuestas mal formadas', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    ...payload,
    checkout: { ...payload.checkout, automaticDuxMutationAllowed: 'true' },
  })));
  render(<CommerceReadinessPanel />);

  fireEvent.click(screen.getByRole('button', { name: 'Comprobar preparación comercial' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('diagnóstico comercial inválido');
});
