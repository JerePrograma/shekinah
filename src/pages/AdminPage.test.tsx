import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { AdminPage } from './AdminPage';

describe('Backoffice V2', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('separa interacciones de métricas financieras sin convertir clicks en pagos', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(json(summaryFixture()))));

    render(<AdminPage navigate={vi.fn()} section="summary" />);

    expect(await screen.findByRole('heading', { name: 'Métricas de interacción' })).toBeVisible();
    expect(screen.getByText('Sesiones con clic en Mercado Pago')).toBeVisible();
    expect(screen.getByText('2 clics válidos')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Métricas financieras confirmadas' })).toBeVisible();
    expect(screen.getByText(/no pagos confirmados/i)).toBeVisible();
    expect(screen.getByText(/Checkout Pro integrado continúa deshabilitado/i)).toBeVisible();
    expect(document.body).not.toHaveTextContent(/NaN|Infinity/u);
  });

  it('consulta el detalle sólo al abrir y muestra fulfillment, items y pagos', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const path = requestPath(input);
      if (path.startsWith('/api/admin/orders?')) return Promise.resolve(json(orderListFixture()));
      if (path === `/api/admin/orders/${ORDER_ID}`) return Promise.resolve(json(orderDetailFixture()));
      return Promise.resolve(json({ error: { message: 'No encontrado.' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminPage navigate={vi.fn()} section="orders" />);

    expect(await screen.findByRole('table', { name: 'Pedidos del período y pedidos de WhatsApp pendientes' })).toBeVisible();
    expect(detailCalls(fetchMock)).toHaveLength(0);
    const openDetail = screen.getByRole('button', { name: 'Ver detalle' });
    fireEvent.click(openDetail);

    expect(await screen.findByRole('heading', { name: `Detalle de ${ORDER_ID}` })).toHaveFocus();
    expect(detailCalls(fetchMock)).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Fulfillment' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Items del pedido' })).toHaveTextContent('Producto de prueba');
    expect(screen.getByRole('table', { name: 'Pagos reportados por el proveedor' })).toHaveTextContent('Mercado Pago');
    expect(screen.getByText(/sólo los pedidos de WhatsApp pendientes admiten aprobación o rechazo/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /aprobar|rechazar|cambiar estado/i })).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('heading', { name: `Detalle de ${ORDER_ID}` }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('heading', { name: `Detalle de ${ORDER_ID}` })).not.toBeInTheDocument();
    await waitFor(() => expect(openDetail).toHaveFocus());

    fireEvent.click(openDetail);
    const reopenedTitle = await screen.findByRole('heading', { name: `Detalle de ${ORDER_ID}` });
    openDetail.remove();
    fireEvent.keyDown(reopenedTitle, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pedidos' }))
      .toHaveFocus());
  });

  it('concilia un pedido Checkout Pro y muestra el impacto de reserva y reintegro', async () => {
    const onOperationStateChange = vi.fn();
    let detail = orderDetailFixture({
      status: 'pending',
      approved_at: null,
      stock_consumed_at: null,
      stock_reservation_state: 'reserved',
    });
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const path = requestPath(input);
      if (path.startsWith('/api/admin/orders?')) return Promise.resolve(json(orderListFixture({ status: detail.order.status })));
      if (path === `/api/admin/orders/${ORDER_ID}/reconcile` && init?.method === 'POST') {
        detail = orderDetailFixture({ status: 'refunded', stock_reservation_state: 'consumed' });
        return Promise.resolve(json({ ...detail, reconciliation: { checkedPayments: 1 } }));
      }
      if (path === `/api/admin/orders/${ORDER_ID}`) return Promise.resolve(json(detail));
      if (path === '/api/catalog') return Promise.resolve(json({ products: [] }));
      return Promise.resolve(json({ error: { message: 'No encontrado.' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AdminPage
        navigate={vi.fn()}
        onOperationStateChange={onOperationStateChange}
        section="orders"
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByText('Reservado')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Conciliar con Mercado Pago' }));

    expect(await screen.findByRole('status')).toHaveTextContent('1 pago verificado');
    expect(screen.getByText(/El reintegro no repone stock automáticamente/i)).toBeVisible();
    expect(fetchMock.mock.calls.filter(([input]) => requestPath(input).endsWith('/reconcile')))
      .toHaveLength(1);
    expect(onOperationStateChange).toHaveBeenCalledWith(true, 'Conciliando pedido con Mercado Pago');
  });

  it('mantiene datos parciales, porcentajes seguros y estados vacíos en analítica', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const path = requestPath(input);
      if (path.startsWith('/api/admin/summary?')) return Promise.resolve(json(summaryFixture({
        consented_session_count: 0,
        product_view_session_count: 0,
      })));
      if (path.startsWith('/api/admin/analytics/products?')) {
        return Promise.resolve(json([{
          product_id: 'producto-sin-vistas',
          views: 0,
          cart_adds: 1,
          view_sessions: 0,
          cart_add_sessions: 1,
          converted_sessions: 0,
        }]));
      }
      if (path.startsWith('/api/admin/analytics/devices?')) {
        return Promise.resolve(json({ error: { message: 'Dispositivos no disponibles.' } }, 500));
      }
      if (path.startsWith('/api/admin/analytics/trend?')) {
        return Promise.resolve(json([{
          day: '2026-08-10',
          session_count: 0,
          page_view_count: 0,
          product_view_count: 0,
          cart_add_count: 0,
          manual_payment_click_count: 0,
          whatsapp_open_count: 0,
          checkout_redirect_count: 0,
        }]));
      }
      if (path.startsWith('/api/admin/analytics/')) return Promise.resolve(json([]));
      return Promise.resolve(json({ error: { message: 'No encontrado.' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminPage navigate={vi.fn()} section="analytics" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Dispositivos no disponibles.');
    const products = screen.getByRole('table', { name: 'Ranking de productos por interacción' });
    expect(products).toHaveTextContent('producto-sin-vistas');
    expect(products).toHaveTextContent('—');
    expect(screen.getByRole('heading', { name: 'Tendencia diaria' })).toBeVisible();
    expect(document.body).not.toHaveTextContent(/NaN|Infinity/u);
  });

  it.each([
    [404, 'No se encontró el pedido.'],
    [500, 'No se pudo consultar el pedido.'],
  ])('muestra el error %i del detalle sin abandonar el listado', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input) => {
      const path = requestPath(input);
      if (path.startsWith('/api/admin/orders?')) return Promise.resolve(json(orderListFixture()));
      return Promise.resolve(json({ error: { message } }, status));
    }));

    render(<AdminPage navigate={vi.fn()} section="orders" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('table', { name: 'Pedidos del período y pedidos de WhatsApp pendientes' })).toBeVisible();
  });

  it('notifica y desmonta mediante onUnauthorized cuando vence la sesión del detalle', async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input) => {
      const path = requestPath(input);
      if (path.startsWith('/api/admin/orders?')) return Promise.resolve(json(orderListFixture()));
      return Promise.resolve(json({ error: { message: 'Sesión vencida.' } }, 401));
    }));

    render(
      <AdminPage
        navigate={vi.fn()}
        onUnauthorized={onUnauthorized}
        section="orders"
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('La sesión administrativa venció.');
  });

  it('aprueba un pedido WhatsApp una sola vez y actualiza el detalle', async () => {
    const onOperationStateChange = vi.fn();
    let detail = orderDetailFixture({ channel: 'whatsapp', status: 'pending' });
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const path = requestPath(input);
      if (path.startsWith('/api/admin/orders?')) {
        return Promise.resolve(json(orderListFixture({ channel: 'whatsapp', status: detail.order.status })));
      }
      if (path === `/api/admin/orders/${ORDER_ID}/approve` && init?.method === 'POST') {
        detail = orderDetailFixture({
          channel: 'whatsapp',
          status: 'approved',
          approved_at: '2026-08-10T12:05:00.000Z',
          resolved_at: '2026-08-10T12:05:00.000Z',
          resolved_by: 'admin@example.test',
        });
        return Promise.resolve(json(detail));
      }
      if (path === `/api/admin/orders/${ORDER_ID}`) return Promise.resolve(json(detail));
      if (path === '/api/catalog') return Promise.resolve(json({ products: [] }));
      return Promise.resolve(json({ error: { message: 'No encontrado.' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AdminPage
        navigate={vi.fn()}
        onOperationStateChange={onOperationStateChange}
        section="orders"
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Pedido aprobado');
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => requestPath(input).endsWith('/approve')))
      .toHaveLength(1);
    expect(onOperationStateChange).toHaveBeenCalledWith(true, 'Aprobando pedido');
  });

  it('confirma el rechazo explicando que libera la reserva', async () => {
    let detail = orderDetailFixture({ channel: 'whatsapp', status: 'pending' });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input) => {
      const path = requestPath(input);
      if (path.startsWith('/api/admin/orders?')) {
        return Promise.resolve(json(orderListFixture({ channel: 'whatsapp', status: detail.order.status })));
      }
      if (path === `/api/admin/orders/${ORDER_ID}/reject`) {
        detail = orderDetailFixture({
          channel: 'whatsapp', status: 'rejected', resolved_at: '2026-08-10T12:05:00.000Z', resolved_by: 'admin@example.test',
        });
        return Promise.resolve(json(detail));
      }
      if (path === `/api/admin/orders/${ORDER_ID}`) return Promise.resolve(json(detail));
      if (path === '/api/catalog') return Promise.resolve(json({ products: [] }));
      return Promise.resolve(json({ error: { message: 'No encontrado.' } }, 404));
    }));

    render(<AdminPage navigate={vi.fn()} section="orders" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = screen.getByRole('alertdialog', { name: `Rechazar ${ORDER_ID}` });
    expect(dialog).toHaveTextContent('unidades reservadas volverán a estar disponibles');
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar pedido' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Pedido rechazado');
  });
});

const ORDER_ID = 'ord_test_123456789012345678901234';

function summaryFixture(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    order_count: 0,
    approved_revenue_minor: 0,
    approved_count: 0,
    approved_payment_count: 0,
    preference_pending_count: 0,
    pending_count: 0,
    rejected_count: 0,
    cancelled_count: 0,
    refunded_count: 0,
    failed_count: 0,
    average_ticket_minor: 0,
    consented_session_count: 4,
    page_view_count: 8,
    page_view_session_count: 4,
    product_view_session_count: 3,
    cart_add_session_count: 2,
    manual_payment_click_count: 2,
    manual_payment_click_session_count: 1,
    whatsapp_open_count: 1,
    whatsapp_open_session_count: 1,
    ...overrides,
  };
}

function orderListFixture(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    rows: [{
      id: ORDER_ID,
      channel: 'checkout_pro',
      status: 'approved',
      currency: 'ARS',
      total_minor: 12_500,
      item_count: 2,
      delivery_method: 'correo_argentino',
      full_name: 'Cliente de prueba',
      created_at: '2026-08-10T12:00:00.000Z',
      ...overrides,
    }],
  };
}

function orderDetailFixture(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    order: {
      id: ORDER_ID,
      channel: 'checkout_pro',
      status: 'approved',
      currency: 'ARS',
      total_minor: 12_500,
      products_total_minor: 10_000,
      shipping_minor: 2_500,
      item_count: 2,
      created_at: '2026-08-10T12:00:00.000Z',
      updated_at: '2026-08-10T12:05:00.000Z',
      approved_at: '2026-08-10T12:05:00.000Z',
      resolved_at: null,
      resolved_by: null,
      last_error_code: null,
      mp_preference_id: 'preference-test',
      stock_reserved_at: '2026-08-10T12:00:00.000Z',
      stock_reservation_expires_at: '2026-08-10T12:30:00.000Z',
      stock_consumed_at: '2026-08-10T12:05:00.000Z',
      stock_reservation_state: 'consumed',
      delivery_method: 'correo_argentino',
      full_name: 'Cliente de prueba',
      phone: '5491100000000',
      address: 'Calle de prueba 123',
      locality: 'Mar del Plata',
      province: 'Buenos Aires',
      postal_code: 'B7600',
      total_weight_grams: 500,
      ...overrides,
    },
    items: [{
      product_id: 'producto-prueba',
      name: 'Producto de prueba',
      presentation: '100 g',
      sku: 'SKU-TEST',
      quantity: 2,
      unit_price_minor: 5_000,
      subtotal_minor: 10_000,
      stock_controlled: 1,
    }],
    payments: [{
      provider: 'mercadopago',
      provider_payment_id: 'payment-test',
      mapped_status: 'approved',
      provider_status: 'approved',
      status_detail: 'accredited',
      amount_minor: 12_500,
      currency: 'ARS',
      approved_at: '2026-08-10T12:05:00.000Z',
      provider_updated_at: '2026-08-10T12:05:00.000Z',
      updated_at: '2026-08-10T12:05:00.000Z',
    }],
  };
}

function detailCalls(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchMock.mock.calls.filter(([input]) => requestPath(input) === `/api/admin/orders/${ORDER_ID}`);
}

function requestPath(input: RequestInfo | URL): string {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return value.startsWith('http') ? `${new URL(value).pathname}${new URL(value).search}` : value;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
