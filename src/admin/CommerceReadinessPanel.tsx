import { useEffect, useState } from 'react';

type Readiness = Readonly<{
  checkedAt: string;
  webRequests: Readonly<{
    schemaReady: boolean;
    serverEnabled: boolean;
    tokenSecretConfigured: boolean;
    catalogSnapshotAvailable: boolean;
    catalogSnapshotFresh: boolean | null;
    totalCount: number | null;
    submittedCount: number | null;
    blockers: readonly string[];
    warnings: readonly string[];
  }>;
  checkout: Readonly<{
    serverEnabled: boolean;
    duxApiEnabled: boolean;
    paymentMode: string;
    paymentAccessTokenConfigured: boolean;
    webhookSecretConfigured: boolean;
    orderTokenSecretConfigured: boolean;
    publicSiteConfigured: boolean;
    guardCode: string | null;
    automaticDuxMutationAllowed: boolean;
    blockers: readonly string[];
  }>;
  dux: Readonly<{
    schemaReady: boolean;
    apiEnabled: boolean;
    credentialsConfigured: boolean;
    snapshotCollectionEnabled: boolean | null;
    publicCatalogEnabled: boolean | null;
    publicCutoverEnabled: boolean | null;
    snapshotAvailable: boolean;
    snapshotItemCount: number | null;
    snapshotSyncedAt: string | null;
    snapshotFresh: boolean | null;
    lastSyncStatus: string | null;
    lastSyncCompletedAt: string | null;
    linkAttentionCount: number | null;
    operationAttentionCount: number | null;
    orderApiContract: Readonly<{
      reviewedAt: string;
      createEndpoint: string;
      queryEndpoint: string;
      queryByReferenceDocumented: boolean;
      productObjectSchemaVerified: boolean;
      releaseOrFinalizeDocumented: boolean;
    }>;
  }>;
  attention: Readonly<{ paymentIncidentCount: number }>;
}>;

const BLOCKER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  WEB_REQUEST_MIGRATION_REQUIRED: 'Falta aplicar la migración 0020 de solicitudes web en esta D1.',
  WEB_ORDERS_DISABLED: 'Las altas de solicitudes web están cerradas por configuración del servidor.',
  ORDER_TOKEN_SECRET_MISSING: 'Falta la protección server-side para recuperar pedidos o solicitudes.',
  DUX_CATALOG_SNAPSHOT_UNAVAILABLE: 'No hay un snapshot Dux publicable disponible en esta base.',
  DUX_CATALOG_SNAPSHOT_STALE: 'El snapshot Dux superó el umbral de frescura configurado.',
  DUX_PUBLIC_CATALOG_DISABLED: 'El catálogo público Dux permanece cerrado en esta base.',
  COMMERCE_DISABLED: 'Checkout Pro está cerrado por configuración del servidor.',
  DUX_API_DISABLED: 'La API Dux está cerrada por configuración del servidor.',
  DUX_ORDER_LIFECYCLE_UNAVAILABLE: 'El guard actual todavía bloquea el lifecycle transaccional Dux.',
  DUX_ORDER_PRODUCT_SCHEMA_UNVERIFIED: 'El esquema interno de productos de Crear Pedido todavía no está verificado para automatización.',
  DUX_ORDER_REFERENCE_RECOVERY_UNVERIFIED: 'La consulta pública de pedidos no documenta recuperación por referencia ante un POST incierto.',
  DUX_ORDER_RELEASE_FINALIZE_UNVERIFIED: 'Liberación, anulación o finalización segura del pedido Dux todavía no están documentadas y verificadas.',
  PAYMENT_MODE_MISSING: 'Falta configurar el modo de Mercado Pago.',
  PAYMENT_MODE_INVALID: 'El modo configurado de Mercado Pago no es válido.',
  PAYMENT_CREDENTIALS_MISSING: 'Falta una credencial válida de Mercado Pago.',
  PAYMENT_APPLICATION_MISMATCH: 'La credencial productiva no corresponde a la aplicación autorizada.',
  WEBHOOK_SECRET_MISSING: 'Falta la clave server-side de firma de webhooks.',
  SITE_URL_MISSING: 'Falta configurar la URL canónica del sitio.',
  SITE_URL_INVALID: 'La URL canónica configurada no es válida.',
});

export function CommerceReadinessPanel({
  onUnauthorized,
}: Readonly<{ onUnauthorized?: (() => void) | undefined }>) {
  const [requested, setRequested] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const frontendWebRequestsEnabled = import.meta.env.VITE_WEB_ORDERS_ENABLED === 'true';

  useEffect(() => {
    if (!requested) return undefined;
    const controller = new AbortController();
    setReadiness(null);
    setError('');
    void fetch('/api/admin/commerce-readiness', {
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          onUnauthorized?.();
          throw new Error('La sesión administrativa venció.');
        }
        if (!response.ok) throw new Error('No se pudo evaluar la preparación comercial.');
        return parseReadiness(await response.json());
      })
      .then((value) => {
        if (!controller.signal.aborted) setReadiness(value);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo evaluar la preparación comercial.');
        }
      });
    return () => controller.abort();
  }, [onUnauthorized, requested, revision]);

  return (
    <section className="container section" aria-labelledby="commerce-readiness-title" aria-busy={requested && readiness === null && error === ''}>
      <div className="section-heading">
        <p className="eyebrow">Operación</p>
        <h2 id="commerce-readiness-title">Preparación comercial</h2>
        <p>Diagnóstico de sólo lectura del entorno actual. No activa flags, no llama proveedores y no modifica stock.</p>
      </div>
      {!requested ? (
        <button className="button button-secondary" type="button" onClick={() => setRequested(true)}>
          Comprobar preparación comercial
        </button>
      ) : null}
      {error !== '' ? <p className="form-error" role="alert">{error}</p> : null}
      {requested && readiness === null && error === '' ? <p role="status">Comprobando esquema, configuración y pendientes…</p> : null}
      {readiness === null ? null : (
        <>
          <div className="cart-items">
            <article className="cart-line">
              <div className="cart-line-content">
                <h3>Solicitudes desde la página</h3>
                <p>
                  Esquema 0020: {yesNo(readiness.webRequests.schemaReady)} · Backend: {openClosed(readiness.webRequests.serverEnabled)} · Frontend: {openClosed(frontendWebRequestsEnabled)}.
                </p>
                <p>
                  Snapshot Dux: {readiness.webRequests.catalogSnapshotAvailable ? 'disponible' : 'ausente'}{readiness.webRequests.catalogSnapshotFresh === null ? '' : readiness.webRequests.catalogSnapshotFresh ? ' y fresco' : ' pero obsoleto'}.
                  {' '}Protección de token: {yesNo(readiness.webRequests.tokenSecretConfigured)}.
                </p>
                <p>
                  Solicitudes registradas: {readiness.webRequests.totalCount ?? 'no consultable'} · pendientes: {readiness.webRequests.submittedCount ?? 'no consultable'}.
                </p>
                <IssueList title="Bloqueos" codes={readiness.webRequests.blockers} />
                <IssueList title="Advertencias" codes={readiness.webRequests.warnings} />
              </div>
            </article>
            <article className="cart-line">
              <div className="cart-line-content">
                <h3>Checkout Pro</h3>
                <p>
                  Backend: {openClosed(readiness.checkout.serverEnabled)} · Dux API: {openClosed(readiness.checkout.duxApiEnabled)} · modo MP: {readiness.checkout.paymentMode}.
                </p>
                <p>
                  Token MP: {yesNo(readiness.checkout.paymentAccessTokenConfigured)} · webhook: {yesNo(readiness.checkout.webhookSecretConfigured)} · token de pedido: {yesNo(readiness.checkout.orderTokenSecretConfigured)} · sitio canónico: {yesNo(readiness.checkout.publicSiteConfigured)}.
                </p>
                <p>Mutación Dux automática segura: {readiness.checkout.automaticDuxMutationAllowed ? 'habilitada' : 'no habilitada'}.</p>
                <IssueList title="Bloqueos" codes={readiness.checkout.blockers} />
              </div>
            </article>
            <article className="cart-line">
              <div className="cart-line-content">
                <h3>Dux y conciliación</h3>
                <p>
                  Esquema: {yesNo(readiness.dux.schemaReady)} · credenciales server-side: {yesNo(readiness.dux.credentialsConfigured)} · colección snapshot: {nullableState(readiness.dux.snapshotCollectionEnabled)} · catálogo público: {nullableState(readiness.dux.publicCatalogEnabled)} · cutover transaccional: {nullableState(readiness.dux.publicCutoverEnabled)}.
                </p>
                <p>
                  Snapshot: {readiness.dux.snapshotItemCount ?? 'sin conteo'} productos · sincronizado: {readiness.dux.snapshotSyncedAt ?? 'sin publicación'} · último sync: {readiness.dux.lastSyncStatus ?? 'sin dato'}.
                </p>
                <p>
                  Vínculos Dux que requieren atención: {readiness.dux.linkAttentionCount ?? 'no consultable'} · operaciones: {readiness.dux.operationAttentionCount ?? 'no consultable'} · incidencias financieras: {readiness.attention.paymentIncidentCount}.
                </p>
                <p>
                  Contrato Dux revisado {readiness.dux.orderApiContract.reviewedAt}: alta <code>{readiness.dux.orderApiContract.createEndpoint}</code>, consulta <code>{readiness.dux.orderApiContract.queryEndpoint}</code>. Recuperación por referencia: {yesNo(readiness.dux.orderApiContract.queryByReferenceDocumented)}; detalle de productos: {yesNo(readiness.dux.orderApiContract.productObjectSchemaVerified)}; liberar/finalizar: {yesNo(readiness.dux.orderApiContract.releaseOrFinalizeDocumented)}.
                </p>
              </div>
            </article>
          </div>
          <p className="cart-disclaimer">Comprobado por el servidor: {readiness.checkedAt}.</p>
        </>
      )}
      {requested ? (
        <button
          className="button button-secondary"
          type="button"
          disabled={readiness === null && error === ''}
          onClick={() => setRevision((value) => value + 1)}
        >
          {error === '' ? 'Actualizar diagnóstico' : 'Reintentar diagnóstico'}
        </button>
      ) : null}
    </section>
  );
}

function IssueList({ title, codes }: Readonly<{ title: string; codes: readonly string[] }>) {
  if (codes.length === 0) return <p>{title}: ninguno.</p>;
  return (
    <div>
      <p>{title}:</p>
      <ul>
        {codes.map((code) => (
          <li key={code}>{BLOCKER_LABELS[code] ?? code} <code>{code}</code></li>
        ))}
      </ul>
    </div>
  );
}

function parseReadiness(value: unknown): Readiness {
  if (!isRecord(value)) throw invalidResponse();
  const web = record(value.webRequests);
  const checkout = record(value.checkout);
  const dux = record(value.dux);
  const attention = record(value.attention);
  const contract = record(dux.orderApiContract);
  return Object.freeze({
    checkedAt: stringValue(value.checkedAt),
    webRequests: Object.freeze({
      schemaReady: booleanValue(web.schemaReady),
      serverEnabled: booleanValue(web.serverEnabled),
      tokenSecretConfigured: booleanValue(web.tokenSecretConfigured),
      catalogSnapshotAvailable: booleanValue(web.catalogSnapshotAvailable),
      catalogSnapshotFresh: nullableBoolean(web.catalogSnapshotFresh),
      totalCount: nullableNonNegativeInteger(web.totalCount),
      submittedCount: nullableNonNegativeInteger(web.submittedCount),
      blockers: stringArray(web.blockers),
      warnings: stringArray(web.warnings),
    }),
    checkout: Object.freeze({
      serverEnabled: booleanValue(checkout.serverEnabled),
      duxApiEnabled: booleanValue(checkout.duxApiEnabled),
      paymentMode: stringValue(checkout.paymentMode),
      paymentAccessTokenConfigured: booleanValue(checkout.paymentAccessTokenConfigured),
      webhookSecretConfigured: booleanValue(checkout.webhookSecretConfigured),
      orderTokenSecretConfigured: booleanValue(checkout.orderTokenSecretConfigured),
      publicSiteConfigured: booleanValue(checkout.publicSiteConfigured),
      guardCode: nullableString(checkout.guardCode),
      automaticDuxMutationAllowed: booleanValue(checkout.automaticDuxMutationAllowed),
      blockers: stringArray(checkout.blockers),
    }),
    dux: Object.freeze({
      schemaReady: booleanValue(dux.schemaReady),
      apiEnabled: booleanValue(dux.apiEnabled),
      credentialsConfigured: booleanValue(dux.credentialsConfigured),
      snapshotCollectionEnabled: nullableBoolean(dux.snapshotCollectionEnabled),
      publicCatalogEnabled: nullableBoolean(dux.publicCatalogEnabled),
      publicCutoverEnabled: nullableBoolean(dux.publicCutoverEnabled),
      snapshotAvailable: booleanValue(dux.snapshotAvailable),
      snapshotItemCount: nullableNonNegativeInteger(dux.snapshotItemCount),
      snapshotSyncedAt: nullableString(dux.snapshotSyncedAt),
      snapshotFresh: nullableBoolean(dux.snapshotFresh),
      lastSyncStatus: nullableString(dux.lastSyncStatus),
      lastSyncCompletedAt: nullableString(dux.lastSyncCompletedAt),
      linkAttentionCount: nullableNonNegativeInteger(dux.linkAttentionCount),
      operationAttentionCount: nullableNonNegativeInteger(dux.operationAttentionCount),
      orderApiContract: Object.freeze({
        reviewedAt: stringValue(contract.reviewedAt),
        createEndpoint: stringValue(contract.createEndpoint),
        queryEndpoint: stringValue(contract.queryEndpoint),
        queryByReferenceDocumented: booleanValue(contract.queryByReferenceDocumented),
        productObjectSchemaVerified: booleanValue(contract.productObjectSchemaVerified),
        releaseOrFinalizeDocumented: booleanValue(contract.releaseOrFinalizeDocumented),
      }),
    }),
    attention: Object.freeze({
      paymentIncidentCount: nonNegativeInteger(attention.paymentIncidentCount),
    }),
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw invalidResponse();
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function booleanValue(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalidResponse();
  return value;
}
function nullableBoolean(value: unknown): boolean | null {
  if (value === null) return null;
  return booleanValue(value);
}
function stringValue(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) throw invalidResponse();
  return value;
}
function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return stringValue(value);
}
function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalidResponse();
  return value;
}
function nullableNonNegativeInteger(value: unknown): number | null {
  if (value === null) return null;
  return nonNegativeInteger(value);
}
function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 50 || value.some((entry) => typeof entry !== 'string' || entry.length > 128)) {
    throw invalidResponse();
  }
  return Object.freeze([...value]);
}
function invalidResponse(): Error {
  return new Error('El servidor devolvió un diagnóstico comercial inválido.');
}
function yesNo(value: boolean): string {
  return value ? 'sí' : 'no';
}
function openClosed(value: boolean): string {
  return value ? 'abierto' : 'cerrado';
}
function nullableState(value: boolean | null): string {
  return value === null ? 'no verificable' : value ? 'habilitado' : 'cerrado';
}
