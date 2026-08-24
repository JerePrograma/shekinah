export type D1Value = string | number | null | ArrayBuffer;

export type D1ResultMeta = Readonly<{
  changes?: number;
  duration?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
}>;

export type D1Result<T = Record<string, unknown>> = Readonly<{
  success: boolean;
  meta: D1ResultMeta;
  results?: readonly T[];
  error?: string;
}>;

export interface D1PreparedStatement {
  bind(...values: readonly D1Value[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(options?: Readonly<{ columnNames?: boolean }>): Promise<readonly T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: readonly D1PreparedStatement[],
  ): Promise<readonly D1Result<T>[]>;
  exec(query: string): Promise<Readonly<{ count: number; duration: number }>>;
}

export type R2HttpMetadata = Readonly<{
  cacheControl?: string;
  contentType?: string;
}>;

export interface R2Object {
  readonly httpEtag: string;
  readonly httpMetadata: R2HttpMetadata;
  readonly key: string;
  readonly size: number;
  writeHttpMetadata(headers: Headers): void;
}

export interface R2ObjectBody extends R2Object {
  readonly body: ReadableStream<Uint8Array>;
}

export interface R2Bucket {
  delete(key: string): Promise<void>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: Readonly<{ httpMetadata?: R2HttpMetadata }>,
  ): Promise<R2Object | null>;
}

export type CommerceMode = 'sandbox' | 'production';

export type Env = Readonly<{
  DB?: D1Database;
  CATALOG_IMAGES?: R2Bucket;
  COMMERCE_ENABLED?: string;
  ANALYTICS_ENABLED?: string;
  PUBLIC_SITE_URL?: string;
  ALLOWED_SITE_ORIGINS?: string;
  MERCADO_PAGO_CHECKOUT_MODE?: string;
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  MERCADO_PAGO_WEBHOOK_SECRET?: string;
  MERCADO_LIBRE_CATALOG_ENABLED?: string;
  MERCADO_LIBRE_CLIENT_ID?: string;
  MERCADO_LIBRE_CLIENT_SECRET?: string;
  MERCADO_LIBRE_EXPECTED_SELLER_ID?: string;
  MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY?: string;
  MERCADO_LIBRE_APPLICATION_ID?: string;
  MERCADO_LIBRE_CATALOG_MAX_AGE_SECONDS?: string;
  MERCADO_LIBRE_SCHEDULER_SECRET?: string;
  ORDER_TOKEN_SECRET?: string;
  ANALYTICS_HMAC_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SESSION_SECRET?: string;
  ADMIN_RATE_LIMIT_SECRET?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  ANALYTICS_RETENTION_DAYS?: string;
}>;

export type PagesFunctionContext<
  Environment extends Env = Env,
  Params extends string = string,
  Data = Record<string, unknown>,
> = Readonly<{
  request: Request;
  env: Environment;
  params: Readonly<Record<Params, string | readonly string[]>>;
  data: Data;
  functionPath?: string;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
}>;

export type PagesFunction<
  Environment extends Env = Env,
  Params extends string = string,
  Data = Record<string, unknown>,
> = (
  context: PagesFunctionContext<Environment, Params, Data>,
) => Response | Promise<Response>;

export type AdminIdentity = Readonly<{
  sub: string;
  actor: string;
  authMethod: 'password' | 'cloudflare-access';
}>;

export type AdminContextData = Record<string, unknown> &
  Readonly<{
    adminIdentity?: AdminIdentity;
    requestId?: string;
  }>;
