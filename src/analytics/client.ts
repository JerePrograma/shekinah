import { deleteAnalyticsSessionRemote } from '../commerce/api';
import {
  ANALYTICS_CONSENT_VERSION,
} from '../commerce/contracts';
import type {
  AnalyticsDeviceClass,
  AnalyticsEventName,
  AnalyticsSource,
} from '../commerce/contracts';
import { isAnalyticsClientEnabled } from '../commerce/env';

const CONSENT_KEY = 'shekinah.analytics-consent.v1';
const SESSION_KEY = 'shekinah.analytics-session.v1';
const CONSENT_EVENT = 'shekinah:analytics-consent-change';

export type AnalyticsConsent = 'undecided' | 'accepted' | 'rejected';
export type ConsentWithdrawalResult = 'remote-deleted' | 'local-only' | 'no-session';

export function getAnalyticsConsent(): AnalyticsConsent {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === 'accepted' || value === 'rejected' ? value : 'undecided';
  } catch {
    return 'undecided';
  }
}

export async function grantAnalyticsConsent(): Promise<void> {
  setConsent('accepted');
  if (!isAnalyticsClientEnabled()) return;
  const path = sanitizePath(window.location.pathname);
  if (isAdminPath(path)) return;
  getOrCreateSessionId();
  await trackAnalyticsEvent('consent_granted', { path });
}

export function rejectAnalyticsConsent(): void {
  setConsent('rejected');
  removeSessionId();
}

export async function withdrawAnalyticsConsent(): Promise<ConsentWithdrawalResult> {
  const sessionId = readSessionId();
  setConsent('rejected');
  removeSessionId();
  if (sessionId === null) return 'no-session';
  try {
    await deleteAnalyticsSessionRemote(sessionId);
    return 'remote-deleted';
  } catch {
    return 'local-only';
  }
}

export function subscribeAnalyticsConsent(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(CONSENT_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CONSENT_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export async function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  options: Readonly<{ path?: string; productId?: string }> = {},
): Promise<void> {
  if (!isAnalyticsClientEnabled() || getAnalyticsConsent() !== 'accepted') return;
  const path = sanitizePath(options.path ?? window.location.pathname);
  if (isAdminPath(path)) return;
  const sessionId = getOrCreateSessionId();
  if (sessionId === null) return;
  const payload = {
    eventId: crypto.randomUUID(),
    eventName,
    sessionId,
    consentVersion: ANALYTICS_CONSENT_VERSION,
    path,
    ...(options.productId === undefined ? {} : { productId: options.productId }),
    source: classifySource(),
    deviceClass: classifyDevice(),
  };
  try {
    await fetch('/api/analytics/events', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // La analítica nunca debe interrumpir la experiencia comercial.
  }
}

export function sanitizePath(value: string): string {
  const withoutQuery = value.split(/[?#]/u, 1)[0] ?? '/';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/gu, '/');
  return collapsed.slice(0, 300) || '/';
}

function setConsent(value: Exclude<AnalyticsConsent, 'undecided'>): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // El estado queda efectivo sólo durante la interacción actual.
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

function getOrCreateSessionId(): string | null {
  const existing = readSessionId();
  if (existing !== null) return existing;
  const created = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function readSessionId(): string | null {
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    return value !== null && isUuid(value) ? value : null;
  } catch {
    return null;
  }
}

function removeSessionId(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // No hay persistencia adicional que eliminar.
  }
}

function classifySource(): AnalyticsSource {
  const campaignKeys = new Set(['gclid', 'fbclid']);
  const search = new URLSearchParams(window.location.search);
  if ([...search.keys()].some((key) => key.toLocaleLowerCase('en').startsWith('utm_') || campaignKeys.has(key.toLocaleLowerCase('en')))) {
    return 'campaign';
  }
  if (document.referrer === '') return 'direct';
  try {
    return new URL(document.referrer).origin === window.location.origin ? 'direct' : 'referral';
  } catch {
    return 'unknown';
  }
}

function classifyDevice(): AnalyticsDeviceClass {
  const width = window.innerWidth;
  if (!Number.isFinite(width) || width <= 0) return 'unknown';
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function isAdminPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/');
}
