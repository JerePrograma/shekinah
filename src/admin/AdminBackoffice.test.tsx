import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { AdminBackoffice } from './AdminBackoffice';

const FIXTURE_USERNAME = 'admin-ficticio';
const FIXTURE_PASSWORD = 'Clave-ficticia-para-pruebas-2026!';

describe('autenticación del backoffice', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('comprueba la sesión antes de montar el contenido protegido', async () => {
    let resolveSession: ((response: Response) => void) | undefined;
    const pendingSession = new Promise<Response>((resolve) => {
      resolveSession = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(() => pendingSession);
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminBackoffice navigate={vi.fn()} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Administración / Backoffice' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Comprobando sesión administrativa…');
    expect(screen.queryByText('Catálogo de productos')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSession?.(json({ authenticated: false }));
      await pendingSession;
    });

    const username = await screen.findByRole('textbox', { name: 'Usuario' });
    await waitFor(() => expect(username).toHaveFocus());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('usa un formulario accesible, evita doble submit y normaliza el rechazo', async () => {
    let resolveLogin: ((response: Response) => void) | undefined;
    const pendingLogin = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const path = requestPath(input);
      if (path === '/api/admin/auth/session') {
        return Promise.resolve(json({ authenticated: false }));
      }
      if (path === '/api/admin/auth/login' && requestMethod(input, init) === 'POST') {
        return pendingLogin;
      }
      return Promise.resolve(json({ error: { message: 'No encontrado.' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminBackoffice navigate={vi.fn()} />);

    const username = await screen.findByRole('textbox', { name: 'Usuario' });
    const password = screen.getByLabelText('Contraseña');
    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    fireEvent.change(username, { target: { value: FIXTURE_USERNAME } });
    fireEvent.change(password, { target: { value: FIXTURE_PASSWORD } });

    const submit = screen.getByRole('button', { name: 'Ingresar' });
    const form = submit.closest('form');
    if (form === null) throw new Error('No se encontró el formulario de acceso.');
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled();
    expect(loginRequests(fetchMock)).toHaveLength(1);

    await act(async () => {
      resolveLogin?.(json({ error: { message: 'El usuario no existe.' } }, 401));
      await pendingLogin;
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo iniciar sesión. Revisá las credenciales e intentá nuevamente.',
    );
    expect(screen.queryByText('El usuario no existe.')).not.toBeInTheDocument();
    expect(password).toHaveValue('');
    expect(storageSnapshot()).not.toContain(FIXTURE_PASSWORD);
  });

  it('navega por secciones, preserva una edición de producto y vuelve al login', async () => {
    let authenticated = false;
    const confirmLogout = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const path = requestPath(input);
      const method = requestMethod(input, init);
      if (path === '/api/admin/auth/session') {
        return Promise.resolve(json({ authenticated: false }));
      }
      if (path === '/api/admin/auth/login' && method === 'POST') {
        expect(readBody(init?.body)).toEqual({
          username: FIXTURE_USERNAME,
          password: FIXTURE_PASSWORD,
        });
        authenticated = true;
        return Promise.resolve(authenticatedSession());
      }
      if (path === '/api/admin/auth/logout' && method === 'POST') {
        authenticated = false;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(authenticated
        ? protectedAdminResponse(path)
        : json({ error: { code: 'ADMIN_UNAUTHORIZED' } }, 401));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminBackoffice navigate={vi.fn()} />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Usuario' }), {
      target: { value: FIXTURE_USERNAME },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: FIXTURE_PASSWORD },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Administración / Backoffice' }),
    ).toBeVisible();
    expect(await screen.findByRole('heading', { level: 2, name: 'Resumen operativo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Resumen' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Productos' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Catálogo de productos' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), {
      target: { value: 'Edición todavía no guardada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analítica' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Analítica first-party' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Analítica' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Productos · cambios sin guardar' }));
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Edición todavía no guardada');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La sesión sigue abierta y los cambios continúan sin guardar.',
    );
    expect(authenticated).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([input]) => requestPath(input) === '/api/admin/auth/logout'),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    const username = await screen.findByRole('textbox', { name: 'Usuario' });
    await waitFor(() => expect(username).toHaveFocus());
    expect(screen.queryByText('Catálogo de productos')).not.toBeInTheDocument();
    expect(authenticated).toBe(false);
    expect(
      fetchMock.mock.calls.filter(([input]) => requestPath(input) === '/api/admin/auth/logout'),
    ).toHaveLength(1);
    expect(confirmLogout).toHaveBeenCalledTimes(2);
    expect(storageSnapshot()).not.toContain(FIXTURE_PASSWORD);
  }, 10_000);

  it('desmonta el contenido protegido cuando una API responde 401', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const path = requestPath(input);
      if (path === '/api/admin/auth/session') return Promise.resolve(authenticatedSession());
      if (path === '/api/admin/products') {
        return Promise.resolve(json({ error: { code: 'ADMIN_UNAUTHORIZED' } }, 401));
      }
      return Promise.resolve(protectedAdminResponse(path));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminBackoffice navigate={vi.fn()} />);

    const username = await screen.findByRole('textbox', { name: 'Usuario' });
    await waitFor(() => expect(username).toHaveFocus());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La sesión administrativa venció. Ingresá nuevamente.',
    );
    expect(screen.queryByText('Catálogo de productos')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });
  });
});

function authenticatedSession(): Response {
  return json({
    authenticated: true,
    identity: { label: 'Administración de prueba', source: 'password' },
  });
}

function protectedAdminResponse(path: string): Response {
  if (path === '/api/admin/products') return json({ products: [], imageStorageConfigured: false });
  if (path === '/api/admin/orders' || path === '/api/admin/audit') return json({ rows: [] });
  if (path.startsWith('/api/admin/orders?') || path.startsWith('/api/admin/audit?')) {
    return json({ rows: [] });
  }
  if (path.startsWith('/api/admin/analytics/')) return json([]);
  if (path.startsWith('/api/admin/summary?')) return json(adminSummary());
  return json({ error: { message: 'No encontrado.' } }, 404);
}

function adminSummary() {
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
    consented_session_count: 0,
    page_view_count: 0,
    page_view_session_count: 0,
    product_view_session_count: 0,
    cart_add_session_count: 0,
    manual_payment_click_count: 0,
    manual_payment_click_session_count: 0,
    whatsapp_open_count: 0,
    whatsapp_open_session_count: 0,
  };
}

function loginRequests(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  return fetchMock.mock.calls.filter(([input]) => requestPath(input) === '/api/admin/auth/login');
}

function requestPath(input: RequestInfo | URL): string {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return value.startsWith('http') ? `${new URL(value).pathname}${new URL(value).search}` : value;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return init?.method ?? (input instanceof Request ? input.method : 'GET');
}

function readBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') throw new Error('La prueba esperaba un cuerpo JSON.');
  return JSON.parse(body) as unknown;
}

function storageSnapshot(): string {
  return JSON.stringify({
    localStorage: { ...window.localStorage },
    sessionStorage: { ...window.sessionStorage },
  });
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
