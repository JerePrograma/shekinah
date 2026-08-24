import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FormEvent } from 'react';

import { AdminPage } from '../pages/AdminPage';
import type { AdminSection } from '../pages/AdminPage';
import type { Navigate } from '../routing/routes';
import { ProductManager } from './ProductManager';
import { MercadoLibrePanel } from './MercadoLibrePanel';
import type { ProductInteractionState } from './ProductManager';

type AdminIdentity = Readonly<{
  label: string;
  source: 'password' | 'cloudflare-access';
}>;

type AdminSession =
  | Readonly<{ authenticated: false }>
  | Readonly<{ authenticated: true; identity: AdminIdentity }>;

type AdminViewState =
  | Readonly<{ status: 'checking' }>
  | Readonly<{ status: 'anonymous' }>
  | Readonly<{ status: 'authenticated'; identity: AdminIdentity }>;

const LOGIN_ERROR = 'No se pudo iniciar sesión. Revisá las credenciales e intentá nuevamente.';
const IDLE_PRODUCT_INTERACTION: ProductInteractionState = Object.freeze({
  dirty: false,
  busy: false,
});

export function AdminBackoffice({
  navigate,
  onInteractionStateChange,
}: Readonly<{
  navigate: Navigate;
  onInteractionStateChange?: ((state: ProductInteractionState) => void) | undefined;
}>) {
  const [viewState, setViewState] = useState<AdminViewState>({ status: 'checking' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [section, setSection] = useState<AdminSection>('summary');
  const [productInteraction, setProductInteraction] = useState<ProductInteractionState>(
    IDLE_PRODUCT_INTERACTION,
  );
  const [orderInteraction, setOrderInteraction] = useState<ProductInteractionState>(
    IDLE_PRODUCT_INTERACTION,
  );
  const submittingRef = useRef(false);
  const loggingOutRef = useRef(false);
  const usernameRef = useRef<HTMLInputElement | null>(null);

  const handleProductInteractionChange = useCallback((state: ProductInteractionState) => {
    setProductInteraction(state);
  }, []);

  const handleOrderInteractionChange = useCallback((busy: boolean, operationLabel?: string) => {
    setOrderInteraction(Object.freeze({
      dirty: false,
      busy,
      ...(operationLabel === undefined ? {} : { operationLabel }),
    }));
  }, []);

  const activeInteraction = useMemo<ProductInteractionState>(() => (
    productInteraction.busy
      ? productInteraction
      : orderInteraction.busy
        ? Object.freeze({ ...orderInteraction, dirty: productInteraction.dirty })
        : Object.freeze({ ...productInteraction, busy: false })
  ), [orderInteraction, productInteraction]);

  useEffect(() => {
    onInteractionStateChange?.(activeInteraction);
  }, [activeInteraction, onInteractionStateChange]);

  useEffect(() => () => {
    onInteractionStateChange?.(IDLE_PRODUCT_INTERACTION);
  }, [onInteractionStateChange]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/auth/session', {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(readOptionalSession)
      .then((session) => {
        setViewState(session.authenticated
          ? { status: 'authenticated', identity: session.identity }
          : { status: 'anonymous' });
      })
      .catch((sessionError: unknown) => {
        if (controller.signal.aborted) return;
        setViewState({ status: 'anonymous' });
        setError(
          sessionError instanceof Error && sessionError.name === 'AbortError'
            ? ''
            : 'No se pudo comprobar la sesión administrativa. Intentá ingresar nuevamente.',
        );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (viewState.status === 'anonymous') {
      usernameRef.current?.focus();
    } else if (viewState.status === 'authenticated') {
      document.querySelector<HTMLElement>('#main-content')?.focus();
    }
  }, [viewState.status]);

  const handleUnauthorized = useCallback(() => {
    setViewState({ status: 'anonymous' });
    setPassword('');
    setError('La sesión administrativa venció. Ingresá nuevamente.');
  }, []);

  async function login(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const session = await readRequiredSession(response);
      setPassword('');
      setSection('summary');
      setViewState({ status: 'authenticated', identity: session.identity });
    } catch {
      setPassword('');
      setError(LOGIN_ERROR);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function logout(): Promise<void> {
    if (loggingOutRef.current) return;
    if (activeInteraction.busy) {
      setError(activeOperationMessage(activeInteraction));
      return;
    }
    if (
      activeInteraction.dirty &&
      !window.confirm(
        'Cerrar sesión administrativa\n\nHay cambios de producto sin guardar. Si cerrás sesión ahora, se perderán.',
      )
    ) {
      setError('La sesión sigue abierta y los cambios continúan sin guardar.');
      return;
    }
    loggingOutRef.current = true;
    setLoggingOut(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (response.status !== 204 && response.status !== 401) {
        throw new Error('Logout rechazado.');
      }
      setUsername('');
      setPassword('');
      setSection('summary');
      setViewState({ status: 'anonymous' });
    } catch {
      setError('No se pudo cerrar la sesión. Intentá nuevamente.');
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }

  if (viewState.status === 'checking') {
    return (
      <section className="admin-page section" aria-labelledby="admin-session-title" aria-busy="true">
        <div className="container admin-shell">
          <h1 id="admin-session-title">Administración / Backoffice</h1>
          <p role="status">Comprobando sesión administrativa…</p>
        </div>
      </section>
    );
  }

  if (viewState.status === 'anonymous') {
    return (
      <section className="admin-page section" aria-labelledby="admin-login-title">
        <div className="container admin-shell">
          <div className="admin-login-card">
            <p className="eyebrow">Administración</p>
            <h1 id="admin-login-title">Acceso administrativo</h1>
            <p>Ingresá con la cuenta administrativa autorizada.</p>
            <form
              className="admin-login-form"
              aria-describedby={error === '' ? undefined : 'admin-login-error'}
              onSubmit={(event) => {
                void login(event);
              }}
            >
              <label htmlFor="admin-username">Usuario</label>
              <input
                id="admin-username"
                ref={usernameRef}
                name="username"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={submitting}
                value={username}
                onChange={(event) => setUsername(event.currentTarget.value)}
              />
              <label htmlFor="admin-password">Contraseña</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                disabled={submitting}
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
              <button className="button button-primary" type="submit" disabled={submitting}>
                {submitting ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>
            {error === '' ? null : (
              <p className="form-error" id="admin-login-error" role="alert">{error}</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <h1 className="visually-hidden">Administración / Backoffice</h1>
      <div className="admin-session-bar">
        <div className="container admin-session-bar-inner">
          <p>
            Sesión iniciada como <strong>{viewState.identity.label}</strong>
            {' '}mediante {identitySourceLabel(viewState.identity.source)}.
          </p>
          <button
            className="button button-secondary"
            type="button"
            disabled={loggingOut || activeInteraction.busy}
            onClick={() => {
              void logout();
            }}
          >
            {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
      {error === '' ? null : (
        <p className="container form-error admin-session-error" role="alert">{error}</p>
      )}
      <nav className="admin-section-navigation" aria-label="Secciones administrativas">
        <div className="container">
          <ul>
            {ADMIN_SECTIONS.map((item) => (
              <li key={item.id}>
                <button
                  className="admin-section-navigation-button"
                  type="button"
                  aria-current={section === item.id ? 'page' : undefined}
                  disabled={activeInteraction.busy && section !== item.id}
                  onClick={() => {
                    if (activeInteraction.busy && section !== item.id) {
                      setError(activeOperationMessage(activeInteraction));
                      return;
                    }
                    setError('');
                    setSection(item.id);
                  }}
                >
                  {item.label}
                  {item.id === 'products' && productInteraction.dirty
                    ? ' · cambios sin guardar'
                    : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <div hidden={section !== 'products'}>
        <ProductManager
          onInteractionStateChange={handleProductInteractionChange}
          onUnauthorized={handleUnauthorized}
        />
      </div>
      <div hidden={section !== 'inventory'}>
        <MercadoLibrePanel
          onOperationStateChange={handleOrderInteractionChange}
          onUnauthorized={handleUnauthorized}
        />
      </div>
      <AdminPage
        navigate={navigate}
        onOperationStateChange={handleOrderInteractionChange}
        onUnauthorized={handleUnauthorized}
        section={section}
      />
    </>
  );
}

const ADMIN_SECTIONS: readonly Readonly<{ id: AdminSection; label: string }>[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'products', label: 'Productos' },
  { id: 'inventory', label: 'Mercado Libre' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'analytics', label: 'Analítica' },
  { id: 'audit', label: 'Auditoría' },
];

async function readOptionalSession(response: Response): Promise<AdminSession> {
  if (response.status === 401) return Object.freeze({ authenticated: false });
  if (!response.ok) throw new Error('La sesión no pudo comprobarse.');
  return parseSession(await readJson(response));
}

async function readRequiredSession(response: Response): Promise<Extract<AdminSession, { authenticated: true }>> {
  if (!response.ok) throw new Error('Credenciales rechazadas.');
  const session = parseSession(await readJson(response));
  if (!session.authenticated) throw new Error('Credenciales rechazadas.');
  return session;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error: unknown) {
    throw new Error('Respuesta administrativa inválida.', { cause: error });
  }
}

function parseSession(value: unknown): AdminSession {
  if (!isRecord(value) || typeof value.authenticated !== 'boolean') {
    throw new Error('Respuesta administrativa inválida.');
  }
  if (!value.authenticated) return Object.freeze({ authenticated: false });
  if (
    !isRecord(value.identity) ||
    typeof value.identity.label !== 'string' ||
    value.identity.label.trim() === '' ||
    value.identity.label.length > 320 ||
    (value.identity.source !== 'password' && value.identity.source !== 'cloudflare-access')
  ) {
    throw new Error('Respuesta administrativa inválida.');
  }
  return Object.freeze({
    authenticated: true,
    identity: Object.freeze({
      label: value.identity.label.trim(),
      source: value.identity.source,
    }),
  });
}

function identitySourceLabel(source: AdminIdentity['source']): string {
  return source === 'cloudflare-access' ? 'Cloudflare Access' : 'credencial propia';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function activeOperationMessage(state: ProductInteractionState): string {
  return state.operationLabel === undefined
    ? 'Esperá a que termine la operación del producto antes de continuar.'
    : `Esperá a que termine: ${state.operationLabel}.`;
}
