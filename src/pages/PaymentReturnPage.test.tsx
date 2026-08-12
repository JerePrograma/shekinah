import {
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

import type { PublicOrderStatusResponse } from '../commerce/contracts';
import { PaymentReturnPage } from './PaymentReturnPage';

const doubles = vi.hoisted(() => ({
  clearCart: vi.fn(),
  clearRememberedCheckoutOrder: vi.fn(),
  getPublicOrderStatus: vi.fn(),
  readRememberedCheckoutOrder: vi.fn(),
  shouldClearCartAfterApproval: vi.fn(),
}));

vi.mock('../cart/CartContext', () => ({
  useCart: () => ({ clear: doubles.clearCart, items: [] }),
}));

vi.mock('../commerce/api', () => ({
  getPublicOrderStatus: doubles.getPublicOrderStatus,
}));

vi.mock('../commerce/checkout-session', () => ({
  clearRememberedCheckoutOrder: doubles.clearRememberedCheckoutOrder,
  readRememberedCheckoutOrder: doubles.readRememberedCheckoutOrder,
  shouldClearCartAfterApproval: doubles.shouldClearCartAfterApproval,
}));

const PUBLIC_TOKEN = 'a'.repeat(64);

describe('retorno verificable de pago', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', `/pago/pendiente?order=${PUBLIC_TOKEN}`);
    doubles.clearCart.mockReset();
    doubles.clearRememberedCheckoutOrder.mockReset();
    doubles.getPublicOrderStatus.mockReset();
    doubles.readRememberedCheckoutOrder.mockReset();
    doubles.shouldClearCartAfterApproval.mockReset();
    doubles.readRememberedCheckoutOrder.mockReturnValue(null);
    doubles.shouldClearCartAfterApproval.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('anuncia la verificación y el resultado aprobado sin cambiar la autoridad de limpieza', async () => {
    const request = deferred<PublicOrderStatusResponse>();
    doubles.getPublicOrderStatus.mockReturnValueOnce(request.promise);
    doubles.shouldClearCartAfterApproval.mockReturnValue(true);

    render(<PaymentReturnPage expected="success" navigate={vi.fn()} />);

    const region = screen.getByRole('region', { name: 'Verificando tu pedido…' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Estamos consultando el estado confirmado por el servidor.',
    );
    expect(screen.queryByRole('button', { name: 'Reintentar verificación' }))
      .not.toBeInTheDocument();

    await act(async () => {
      request.resolve(orderStatus('approved'));
      await request.promise;
    });

    expect(screen.getByRole('heading', { name: 'Pago aprobado' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Mercado Pago confirmó el pago y el pedido quedó aprobado.',
    );
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(doubles.shouldClearCartAfterApproval).toHaveBeenCalledWith([], PUBLIC_TOKEN);
    expect(doubles.clearCart).toHaveBeenCalledTimes(1);
    expect(doubles.clearRememberedCheckoutOrder).toHaveBeenCalledTimes(1);
  });

  it('explica que sigue verificando y permite reintentar al agotar el polling', async () => {
    vi.useFakeTimers();
    doubles.getPublicOrderStatus.mockResolvedValue(orderStatus('pending'));

    render(<PaymentReturnPage expected="pending" navigate={vi.fn()} />);
    await flushMicrotasks();

    const region = screen.getByRole('region', { name: 'Pago pendiente' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Seguimos verificando automáticamente.',
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(doubles.getPublicOrderStatus).toHaveBeenCalledTimes(7);
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Las verificaciones automáticas terminaron por ahora.',
    );
    expect(screen.getByRole('button', { name: 'Reintentar verificación' })).toBeVisible();
    expect(doubles.clearCart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar verificación' }));
    await flushMicrotasks();

    expect(doubles.getPublicOrderStatus).toHaveBeenCalledTimes(8);
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Seguimos verificando automáticamente.',
    );
    expect(screen.queryByRole('button', { name: 'Reintentar verificación' }))
      .not.toBeInTheDocument();
  });

  it('muestra el error como alerta y recupera la consulta mediante un reintento único', async () => {
    const retryRequest = deferred<PublicOrderStatusResponse>();
    doubles.getPublicOrderStatus
      .mockRejectedValueOnce(new Error('No se pudo consultar el pedido ahora.'))
      .mockReturnValueOnce(retryRequest.promise);

    render(<PaymentReturnPage expected="pending" navigate={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo consultar el pedido ahora.',
    );
    const region = screen.getByRole('region', { name: 'No pudimos verificar el pedido' });
    expect(region).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar verificación' }));

    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Estamos consultando el estado confirmado por el servidor.',
    );
    expect(doubles.getPublicOrderStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      retryRequest.resolve(orderStatus('approved'));
      await retryRequest.promise;
    });

    expect(screen.getByRole('heading', { name: 'Pago aprobado' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar verificación' }))
      .not.toBeInTheDocument();
    expect(doubles.clearCart).not.toHaveBeenCalled();
  });
});

function orderStatus(
  status: PublicOrderStatusResponse['status'],
): PublicOrderStatusResponse {
  return Object.freeze({
    status,
    totalMinor: 12_500,
    itemCount: 2,
    currency: 'ARS',
    updatedAt: '2026-08-12T12:00:00.000Z',
  });
}

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error('La promesa no está inicializada.');
      resolvePromise(value);
    },
    reject(reason?: unknown) {
      if (rejectPromise === undefined) throw new Error('La promesa no está inicializada.');
      rejectPromise(reason);
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
