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
import { CommerceAttentionPanel } from './CommerceAttentionPanel';
import { CommerceReadinessPanel } from './CommerceReadinessPanel';
import { DuxPanel } from './DuxPanel';
import { ProductManager } from './ProductManager';
import type { ProductInteractionState } from './ProductManager';
import { WebOrderRequestsPanel } from './WebOrderRequestsPanel';
import { AdminShell } from './AdminShell';
import { AppLink } from '../routing/AppLink';
import './admin.css';

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

const LOGIN_ERROR = 'No pudimos iniciar sesión. Revisá el usuario y la contraseña e intentá nuevamente.';
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
            : 'No pudimos comprobar tu sesión. Intentá ingresar nuevamente.',
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

  useEffect(() => {
    const headingId = section === 'products' ? 'backoffice-title'
      : section === 'inventory' ? 'admin-dux-title' : `admin-${section}-title`;
    document.getElementById(headingId)?.focus();
  }, [section]);

  const handleUnauthorized = useCallback(() => {
    setViewState({ status: 'anonymous' });
    setPassword('');
    setError('Tu sesión venció. Ingresá nuevamente.');
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
        'Cerrar sesión\n\nHay cambios de producto sin guardar. Si cerrás sesión ahora, se perderán.',
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
      <section className="admin-auth" aria-labelledby="admin-session-title" aria-busy="true">
        <div className="container admin-shell">
          <h1 id="admin-session-title">Administración de Shekinah</h1>
          <p role="status">Comprobando tu sesión…</p>
        </div>
      </section>
    );
  }

  if (viewState.status === 'anonymous') {
    return (
      <section className="admin-auth" aria-labelledby="admin-login-title">
        <div className="container admin-shell">
          <div className="admin-login-card">
            <AppLink className="admin-brand" navigate={navigate} to="/" aria-label="Shekinah, ir al inicio">
              <img src="/assets/favicon-shekinah.svg" alt="" width="40" height="40" />
              <div><strong>Shekinah</strong><span>Administración</span></div>
            </AppLink>
            <h1 id="admin-login-title">Acceso administrativo</h1>
            <p>Gestioná los pedidos y productos de tu negocio.</p>
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
            <AppLink className="admin-auth-back" navigate={navigate} to="/">Volver al sitio</AppLink>
          </div>
        </div>
      </section>
    );
  }

  return (
    <AdminShell section={section} identity={viewState.identity.label} busy={activeInteraction.busy}
      dirty={productInteraction.dirty} loggingOut={loggingOut} navigate={navigate}
      onLogout={() => void logout()} onSectionChange={next => {
        if (activeInteraction.busy && section !== next) { setError(activeOperationMessage(activeInteraction)); return; }
        setError(''); setSection(next);
      }}>
      {error === '' ? null : (
        <p className="container form-error admin-session-error" role="alert">{error}</p>
      )}
      <div hidden={section !== 'products'}>
        <ProductManager
          onInteractionStateChange={handleProductInteractionChange}
          onUnauthorized={handleUnauthorized}
        />
      </div>
      <div hidden={section !== 'inventory'}>
        <DuxPanel
          onOperationStateChange={handleOrderInteractionChange}
          onUnauthorized={handleUnauthorized}
        />
      </div>
      <AdminPage
        navigate={navigate}
        onOpenOrders={() => setSection('orders')}
        onOperationStateChange={handleOrderInteractionChange}
        onUnauthorized={handleUnauthorized}
        orderOverview={section === 'orders' ? <div className="admin-order-overview">
          <WebOrderRequestsPanel onUnauthorized={handleUnauthorized} onBusyChange={handleOrderInteractionChange} />
          <CommerceAttentionPanel onUnauthorized={handleUnauthorized} />
        </div> : null}
        section={section}
      />
      {section === 'summary' ? <CommerceReadinessPanel onOpenOrders={() => setSection('orders')} onUnauthorized={handleUnauthorized} /> : null}
    </AdminShell>
  );
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function activeOperationMessage(state: ProductInteractionState): string {
  return state.operationLabel === undefined
    ? 'Esperá a que termine la operación del producto antes de continuar.'
    : `Esperá a que termine: ${state.operationLabel}.`;
}
