import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MarketingCampaign, MarketingCampaignInput } from '../commerce/marketing-contracts';
import { MarketingPanel } from './MarketingPanel';

function campaign(overrides: Partial<MarketingCampaign> = {}): MarketingCampaign {
  return { id: 'mkt_0000000000000001', type: 'coupon', code: 'PRUEBA10', title: 'Cupón de prueba local', body: '', ctaLabel: '', href: '',
    placement: 'home', priority: 0, enabled: false, startsAt: null, endsAt: null, percentOff: 10,
    minSubtotalMinor: 0, maxDiscountMinor: null, productCodes: [], maxRedemptions: null, redemptionCount: 0,
    updatedAt: '2026-10-22T12:00:00.000Z', ...overrides };
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function body(init?: RequestInit) { if (typeof init?.body !== 'string') throw new Error('Falta JSON de prueba.'); return JSON.parse(init.body) as MarketingCampaignInput & { id?: string }; }

describe('campañas administrables', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('carga al abrir Marketing, presenta un vacío útil y conserva borradores al ocultarse', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json({ campaigns: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const onInteractionStateChange = vi.fn();
    const { rerender } = render(<MarketingPanel active={false} onInteractionStateChange={onInteractionStateChange} />);
    expect(fetchMock).not.toHaveBeenCalled();
    rerender(<MarketingPanel active onInteractionStateChange={onInteractionStateChange} />);
    expect(await screen.findByText('Todavía no hay campañas')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nueva campaña' })).toHaveFocus());
    change('Título', 'Borrador conservado');
    await waitFor(() => expect(onInteractionStateChange).toHaveBeenLastCalledWith({ dirty: true, busy: false }));
    rerender(<MarketingPanel active={false} onInteractionStateChange={onInteractionStateChange} />);
    rerender(<MarketingPanel active onInteractionStateChange={onInteractionStateChange} />);
    expect(screen.getByLabelText('Título')).toHaveValue('Borrador conservado');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asocia errores a los campos y enfoca el primer dato inválido sin enviar', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json({ campaigns: [] })));
    vi.stubGlobal('fetch', fetchMock);
    render(<MarketingPanel />);
    await screen.findByText('Todavía no hay campañas');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar campaña' }));
    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveFocus());
    expect(screen.getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Código del cupón')).toHaveAccessibleDescription(/entre 3 y 32/u);
    expect(screen.getByLabelText('Descuento (%)')).toHaveAccessibleDescription(/entre 1 y 90/u);
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá los campos indicados');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('crea un cupón con ARS en centavos, SKU exactos y vigencia convertida a ISO', async () => {
    let submitted: ReturnType<typeof body> | undefined;
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (init?.method === 'POST') { submitted = body(init); return Promise.resolve(json({ campaign: campaign(submitted) }, 201)); }
      return Promise.resolve(json({ campaigns: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const interaction = vi.fn();
    render(<MarketingPanel onInteractionStateChange={interaction} />);
    await screen.findByText('Todavía no hay campañas');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    change('Título', 'Cupón de prueba local'); change('Código del cupón', ' prueba_20 '); change('Descuento (%)', '20');
    change('Compra mínima (ARS)', '1234.50'); change('Tope de descuento (ARS)', '250.25'); change('Límite total de usos', '12');
    change('SKU Dux participantes', '00123, ABC-45, 00123');
    change('Inicio (hora local)', '2026-11-01T10:30'); change('Fin (hora local)', '2026-11-15T20:00');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar campaña' }));
    expect(await screen.findByText('Borrador guardado. Podés activarlo cuando esté listo.')).toBeVisible();
    expect(submitted).toMatchObject({ type: 'coupon', code: 'PRUEBA_20', percentOff: 20, enabled: false,
      minSubtotalMinor: 123450, maxDiscountMinor: 25025, maxRedemptions: 12, productCodes: ['00123', 'ABC-45'],
      startsAt: new Date('2026-11-01T10:30').toISOString(), endsAt: new Date('2026-11-15T20:00').toISOString() });
    expect(submitted).not.toHaveProperty('id');
    await waitFor(() => expect(interaction).toHaveBeenLastCalledWith({ dirty: false, busy: false }));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', credentials: 'same-origin', redirect: 'error' });
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('reintenta un alta con la misma clave si se pierde la respuesta de guardado', async () => {
    const keys: Array<string | null> = []; let attempts = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((_input, init) => {
      if (init?.method === 'POST') {
        attempts += 1; keys.push(new Headers(init.headers).get('Idempotency-Key'));
        if (attempts === 1) return Promise.reject(new Error('No pudimos confirmar el guardado. Reintentá.'));
        return Promise.resolve(json({ campaign: campaign(body(init)) }));
      }
      return Promise.resolve(json({ campaigns: [] }));
    }));
    render(<MarketingPanel />); await screen.findByText('Todavía no hay campañas');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    change('Título', 'Campaña única de prueba'); change('Código del cupón', 'UNICA10'); change('Descuento (%)', '10');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar campaña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos confirmar el guardado. Reintentá para recuperar la misma campaña.');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar campaña' }));
    await screen.findByText('Borrador guardado. Podés activarlo cuando esté listo.');
    expect(keys).toHaveLength(2); expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u); expect(keys[1]).toBe(keys[0]);
  });

  it('edita un anuncio, valida enlaces internos y guarda con la misma identidad', async () => {
    let submitted: ReturnType<typeof body> | undefined;
    const saved = campaign({ type: 'announcement', code: null, percentOff: null, title: 'Anuncio de prueba', body: 'Texto autorizado de prueba' });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((_input, init) => {
      if (init?.method === 'PUT') { submitted = body(init); return Promise.resolve(json({ campaign: { ...saved, ...submitted } })); }
      return Promise.resolve(json({ campaigns: [saved] }));
    }));
    render(<MarketingPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Anuncio de prueba' }));
    expect(screen.queryByLabelText('Descuento (%)')).not.toBeInTheDocument();
    change('Texto del enlace', 'Ver productos'); change('Destino del enlace', '//externo.test');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar campaña' }));
    await waitFor(() => expect(screen.getByLabelText('Destino del enlace')).toHaveFocus());
    expect(screen.getByLabelText('Destino del enlace')).toHaveAccessibleDescription(/ruta interna/u);
    change('Destino del enlace', '/catalogo');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar campaña' }));
    await screen.findByText('Borrador guardado. Podés activarlo cuando esté listo.');
    expect(submitted).toMatchObject({ id: saved.id, type: 'announcement', href: '/catalogo', ctaLabel: 'Ver productos', percentOff: null, code: null });
  });

  it('no pierde cambios ante un fallo de guardado y permite reintentar', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((_input, init) => {
      if (init?.method === 'PUT') { attempts += 1; return Promise.resolve(attempts === 1 ? json({ error: { message: 'Conexión de prueba interrumpida.' } }, 503) : json({ campaign: campaign(body(init)) })); }
      return Promise.resolve(json({ campaigns: [campaign()] }));
    }));
    render(<MarketingPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Cupón de prueba local' }));
    change('Título', 'Borrador después del error');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar campaña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conexión de prueba interrumpida.');
    expect(screen.getByLabelText('Título')).toHaveValue('Borrador después del error');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar campaña' }));
    expect(await screen.findByText('Borrador guardado. Podés activarlo cuando esté listo.')).toBeVisible();
    expect(attempts).toBe(2);
  });

  it('confirmación comienza en seguir editando y Escape conserva los cambios', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(json({ campaigns: [campaign()] }))));
    render(<MarketingPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Cupón de prueba local' }));
    change('Título', 'Cambios pendientes');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Seguir editando' })).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Cambios pendientes');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios y continuar' }));
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('bloquea un doble guardado y comunica busy hasta confirmar la respuesta', async () => {
    let resolve: ((response: Response) => void) | undefined;
    let savedInput: ReturnType<typeof body> | undefined;
    const pending = new Promise<Response>(done => { resolve = done; });
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (init?.method === 'PUT') { savedInput = body(init); return pending; }
      return Promise.resolve(json({ campaigns: [campaign()] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const interaction = vi.fn(); render(<MarketingPanel onInteractionStateChange={interaction} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Cupón de prueba local' }));
    change('Título', 'Cambio de prueba');
    const form = screen.getByRole('form', { name: 'Editar campaña' }); fireEvent.submit(form); fireEvent.submit(form);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
    await waitFor(() => expect(interaction).toHaveBeenLastCalledWith({ dirty: true, busy: true, operationLabel: 'Guardando campaña' }));
    expect(screen.getByRole('button', { name: 'Guardando campaña…' })).toBeDisabled();
    await act(async () => { resolve?.(json({ campaign: campaign(savedInput) })); await pending; });
    await waitFor(() => expect(interaction).toHaveBeenLastCalledWith({ dirty: false, busy: false }));
  });

  it('desactiva una campaña sin alterar sus condiciones y detecta sesión vencida', async () => {
    const saved = campaign({ enabled: true, startsAt: '2026-01-01T00:00:30.123Z' });
    let submitted: ReturnType<typeof body> | undefined;
    const unauthorized = vi.fn();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((_input, init) => {
      if (init?.method === 'PUT') { submitted = body(init); return Promise.resolve(json({ error: { message: 'No autorizado.' } }, 401)); }
      return Promise.resolve(json({ campaigns: [saved] }));
    }));
    render(<MarketingPanel onUnauthorized={unauthorized} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar Cupón de prueba local' }));
    await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1));
    expect(submitted).toMatchObject({ id: saved.id, enabled: false, startsAt: saved.startsAt, percentOff: saved.percentOff });
    expect(submitted).not.toHaveProperty('updatedAt'); expect(submitted).not.toHaveProperty('redemptionCount');
  });
});
