import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

    expect(await screen.findByRole('heading', { name: 'Visitas al sitio' })).toBeVisible();
    expect(screen.getByText('No hay pedidos pendientes en este período.')).toBeVisible();
    expect(screen.queryByText(/Link de Pago manual/u)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pedidos y cobros' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Pedidos y cobros' })
      .compareDocumentPosition(screen.getByRole('heading', { name: 'Visitas al sitio' }))
      & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.getByText(/Las visitas, los clics y las aperturas de WhatsApp no confirman pagos/i)).toBeVisible();
    expect(screen.getByText(/Aprobar un pedido de WhatsApp no confirma que esté pagado/i)).toBeVisible();
    expect(screen.getByText('Pagos aprobados')).not.toBeVisible();
    expect(document.body).not.toHaveTextContent(/NaN|Infinity/u);
  });

  it('prioriza pedidos pendientes con una salida directa sin interpretar clics como cobros', async () => {
    const onOpenOrders = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json(summaryFixture({
      pending_count: 2, preference_pending_count: 1, manual_payment_click_count: 500,
    }))));
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminPage navigate={vi.fn()} onOpenOrders={onOpenOrders} section="summary" />);
    expect(await screen.findByText('3 pedidos pendientes en este período.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Para revisar' })
      .compareDocumentPosition(screen.getByRole('heading', { name: 'Pedidos y cobros' }))
      & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.getByText('Pedidos con pago confirmado').nextElementSibling).toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar pedidos' }));
    expect(onOpenOrders).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('quita el filtro de estado anterior al revisar pedidos desde el resumen', async () => {
    const navigate = vi.fn();
    const onOpenOrders = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(input => Promise.resolve(json(
      requestPath(input).startsWith('/api/admin/orders?') ? { rows: [] } : summaryFixture({ pending_count: 1 }),
    )));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<AdminPage navigate={navigate} onOpenOrders={onOpenOrders} section="orders" />);
    await screen.findByRole('table', { name: 'Pedidos del período y pedidos de WhatsApp pendientes' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado de pedidos' }), { target: { value: 'approved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar período' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => requestPath(input).includes('status=approved'))).toBe(true));
    rerender(<AdminPage navigate={navigate} onOpenOrders={onOpenOrders} section="summary" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar pedidos' }));
    rerender(<AdminPage navigate={navigate} onOpenOrders={onOpenOrders} section="orders" />);
    await screen.findByRole('table', { name: 'Pedidos del período y pedidos de WhatsApp pendientes' });
    expect(screen.getByRole('combobox', { name: 'Estado de pedidos' })).toHaveValue('');
    const orderQueries = fetchMock.mock.calls.map(([input]) => requestPath(input)).filter(path => path.startsWith('/api/admin/orders?'));
    expect(orderQueries.at(-1)).not.toContain('status=');
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

    expect(await screen.findByRole('heading', { name: `Detalle de ${ORDER_NUMBER}` })).toHaveFocus();
    expect(detailCalls(fetchMock)).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Contacto y entrega' })).toBeVisible();
    expect(screen.getByText('ID interno')).not.toBeVisible();
    const references = screen.getByText('Información para soporte');
    expect(references.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('table', { name: 'Productos del pedido' })).toHaveTextContent('Producto de prueba');
    expect(screen.getByRole('table', { name: 'Pagos del pedido' })).toHaveTextContent('Mercado Pago');
    expect(screen.getByText(/sólo los pedidos de WhatsApp pendientes admiten aprobación o rechazo/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /aprobar|rechazar|cambiar estado/i })).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('heading', { name: `Detalle de ${ORDER_NUMBER}` }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('heading', { name: `Detalle de ${ORDER_NUMBER}` })).not.toBeInTheDocument();
    await waitFor(() => expect(openDetail).toHaveFocus());

    fireEvent.click(openDetail);
    const reopenedTitle = await screen.findByRole('heading', { name: `Detalle de ${ORDER_NUMBER}` });
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
    expect(await screen.findByText('Unidades reservadas')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Verificar pago' }));

    expect(await screen.findByRole('status')).toHaveTextContent('1 pago verificado');
    expect(screen.getByText(/El reintegro no repone stock automáticamente/i)).toBeVisible();
    expect(fetchMock.mock.calls.filter(([input]) => requestPath(input).endsWith('/reconcile')))
      .toHaveLength(1);
    expect(onOperationStateChange).toHaveBeenCalledWith(true, 'Verificando el pago con Mercado Pago');
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Falta cargar: Dispositivos.');
    expect(screen.getByText('Dispositivos: HTTP 500: Dispositivos no disponibles.')).not.toBeVisible();
    const products = screen.getByRole('table', { name: 'Productos más consultados' });
    expect(within(products).getByText('producto-sin-vistas')).not.toBeVisible();
    expect(products).toHaveTextContent('Producto no disponible');
    expect(products).toHaveTextContent('—');
    expect(screen.getByRole('heading', { name: 'Tendencia diaria' })).toBeVisible();
    expect(document.body).not.toHaveTextContent(/NaN|Infinity/u);
  });

  it.each([
    [404, 'No se encontró el pedido.'],
    [500, 'No se pudo consultar el pedido.'],
  ])('muestra el error %i del detalle sin abandonar el listado', async (status, message) => {
    let failed = false;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const path = requestPath(input);
      if (path.startsWith('/api/admin/orders?')) return Promise.resolve(json(orderListFixture()));
      if (path !== `/api/admin/orders/${ORDER_ID}`) return Promise.resolve(json({ products: [] }));
      if (!failed) { failed = true; return Promise.resolve(json({ error: { message } }, status)); }
      return Promise.resolve(json(orderDetailFixture()));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminPage navigate={vi.fn()} section="orders" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(status === 404
      ? 'No encontramos el pedido. Volvé al listado y actualizalo.'
      : 'No pudimos cargar el detalle del pedido. Volvé a intentarlo.');
    expect(screen.getByText(`HTTP ${status}: ${message}`)).not.toBeVisible();
    expect(screen.getByRole('table', { name: 'Pedidos del período y pedidos de WhatsApp pendientes' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar detalle' }));
    expect(await screen.findByRole('heading', { name: 'Contacto y entrega' })).toBeVisible();
    expect(screen.getByRole('heading', { name: `Detalle de ${ORDER_NUMBER}` })).toHaveFocus();
    expect(detailCalls(fetchMock)).toHaveLength(2);
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
  });

  it('no traslada una confirmación de rechazo al abrir otro pedido', async () => {
    const otherId = 'ord_second_123456789012345678901234';
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input) => {
      const path = requestPath(input);
      if (path.startsWith('/api/admin/orders?')) return Promise.resolve(json({ rows: [
        ...orderListFixture({ channel: 'whatsapp', status: 'pending' }).rows,
        ...orderListFixture({ id: otherId, channel: 'whatsapp', status: 'pending' }).rows,
      ] }));
      return Promise.resolve(json(orderDetailFixture({ id: path.endsWith(otherId) ? otherId : ORDER_ID,
        channel: 'whatsapp', status: 'pending' })));
    }));
    render(<AdminPage navigate={vi.fn()} section="orders" />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver detalle' }))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[1]!);
    expect(await screen.findByRole('button', { name: 'Rechazar' })).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it.each([true, false])('mantiene la operación y su resultado dentro del pedido original (éxito: %s)', async (succeeds) => {
    const otherId = 'ord_second_123456789012345678901234';
    let resolveAction: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>(resolve => { resolveAction = resolve; });
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const path = requestPath(input);
      if (init?.method === 'POST') return pending;
      if (path.startsWith('/api/admin/orders?')) return Promise.resolve(json({ rows: [
        ...orderListFixture().rows, ...orderListFixture({ id: otherId }).rows,
      ] }));
      if (path === '/api/catalog') return Promise.resolve(json({ products: [] }));
      return Promise.resolve(json(orderDetailFixture({ id: path.endsWith(otherId) ? otherId : ORDER_ID })));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminPage navigate={vi.fn()} section="orders" />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver detalle' }))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Verificar pago' }));
    screen.getAllByRole('button', { name: 'Ver detalle' }).forEach(button => expect(button).toBeDisabled());
    await act(async () => {
      resolveAction?.(succeeds ? json({ ...orderDetailFixture(), reconciliation: { checkedPayments: 1 } })
        : json({ error: { message: 'No se pudo comprobar el pago del primer pedido.' } }, 503));
      await pending;
    });
    const result = succeeds ? /1 pago verificado/u
      : 'No pudimos confirmar el resultado de la operación. Revisá el estado del pedido antes de volver a intentarlo.';
    expect(await screen.findByText(result)).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle' })[1]!);
    expect(await screen.findByRole('button', { name: 'Verificar pago' })).toBeVisible();
    expect(screen.queryByText(result)).not.toBeInTheDocument();
  });

  it('distingue la ausencia de pagos de un filtro de fechas', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input) => Promise.resolve(json(
      requestPath(input).startsWith('/api/admin/orders?') ? orderListFixture()
        : { ...orderDetailFixture(), payments: [] },
    ))));
    render(<AdminPage navigate={vi.fn()} section="orders" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByRole('table', { name: 'Pagos del pedido' }))
      .toHaveTextContent('No hay pagos registrados para este pedido.');
  });

  it('explica una incidencia sin exponer códigos ni estados desconocidos fuera de soporte', async () => {
    const detail = orderDetailFixture({ status: 'UNKNOWN_STATE', last_error_code: 'RAW_INCIDENT', stock_reservation_state: 'RAW_RESERVATION' });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(input => Promise.resolve(json(
      requestPath(input).startsWith('/api/admin/orders?') ? orderListFixture({ last_error_code: 'RAW_INCIDENT' }) : detail,
    ))));
    render(<AdminPage navigate={vi.fn()} section="orders" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    const order = await screen.findByRole('article', { name: `Detalle de ${ORDER_NUMBER}` });
    expect(within(order).getByText(/Este pedido tiene una incidencia/u)).toBeVisible();
    for (const code of ['RAW_INCIDENT', 'UNKNOWN_STATE', 'RAW_RESERVATION']) {
      expect(within(order).getByText(code)).not.toBeVisible();
    }
    fireEvent.click(within(order).getByText('Información para soporte'));
    expect(within(order).getByText('RAW_INCIDENT').closest('details')).toHaveAttribute('open');
  });

  it('preserva el diagnóstico de pago y explica qué revisar sin afirmar que se cobró', async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => Promise.resolve(json(
      init?.method === 'POST' ? { error: { code: 'PAYMENT_ORDER_MISMATCH', message: 'payment snapshot mismatch' } }
        : requestPath(input).startsWith('/api/admin/orders?') ? orderListFixture() : orderDetailFixture(),
      init?.method === 'POST' ? 409 : 200,
    )));
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminPage navigate={vi.fn()} section="orders" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Verificar pago' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El pago informado no coincide con este pedido.');
    expect(screen.getByText('PAYMENT_ORDER_MISMATCH: payment snapshot mismatch')).not.toBeVisible();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('usa mensajes seguros cuando estados y errores coinciden con propiedades heredadas', async () => {
    const detail = orderDetailFixture({ status: 'constructor', last_error_code: 'toString', stock_reservation_state: '__proto__' });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input, init) => Promise.resolve(json(
      init?.method === 'POST' ? { error: { code: 'toString', message: 'diagnóstico de prueba' } }
        : requestPath(input).startsWith('/api/admin/orders?') ? orderListFixture({ status: 'constructor', last_error_code: 'toString' }) : detail,
      init?.method === 'POST' ? 503 : 200,
    ))));
    render(<AdminPage navigate={vi.fn()} section="orders" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Verificar pago' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos confirmar el resultado de la operación.');
    expect(screen.getByText('toString: diagnóstico de prueba')).not.toBeVisible();
    expect(screen.getByRole('table', { name: 'Pedidos del período y pedidos de WhatsApp pendientes' }))
      .toHaveTextContent('Requiere revisión');
  });

  it('presenta la actividad con nombres humanos y conserva el resultado técnico bajo soporte', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(json({ rows: [{
      actor_email: 'Cuenta de prueba', action: 'admin.order.reconcile', target_type: 'order',
      target_id: ORDER_ID, outcome_status: 503, created_at: '2026-08-10T12:05:00.000Z',
    }] }))));
    render(<AdminPage navigate={vi.fn()} section="audit" />);
    const table = await screen.findByRole('table', { name: 'Historial de actividad' });
    expect(within(table).getByText('Verificación de pago')).toBeVisible();
    expect(within(table).getByText('No se completó')).toBeVisible();
    expect(within(table).getByText('admin.order.reconcile')).not.toBeVisible();
    expect(within(table).getByText('503')).not.toBeVisible();
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión venció. Ingresá nuevamente.');
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
    const dialog = screen.getByRole('alertdialog', { name: `Rechazar ${ORDER_NUMBER}` });
    expect(dialog).toHaveTextContent('unidades reservadas volverán a estar disponibles');
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar pedido' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Pedido rechazado');
  });
});

const ORDER_ID = 'ord_test_123456789012345678901234';
const ORDER_NUMBER = 'SHK-78901234';

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
