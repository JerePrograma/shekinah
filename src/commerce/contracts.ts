import type { CheckoutFulfillment } from './fulfillment';

export const MAX_CART_LINES = 50;
export const MAX_CART_QUANTITY = 99;
export const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 30 * 60 * 1000;
export const WHATSAPP_RESERVATION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ANALYTICS_CONSENT_VERSION = '1' as const;

export type CheckoutLineRequest = Readonly<{
  productId: string;
  quantity: number;
}>;

export type CheckoutRequest = Readonly<{
  idempotencyKey: string;
  items: readonly CheckoutLineRequest[];
  fulfillment: CheckoutFulfillment;
}>;

export type CheckoutResponse = Readonly<{
  checkoutUrl: string;
  publicToken: string;
}>;

export type WhatsappOrderRequest = Readonly<{
  idempotencyKey: string;
  items: readonly CheckoutLineRequest[];
  fulfillment: CheckoutFulfillment;
  whatsappConsent: true;
}>;

export function formatOrderNumber(orderId: string): string {
  const suffix = orderId.startsWith('ord_') ? orderId.slice(4) : orderId;
  return `SHK-${suffix.slice(-8).toLocaleUpperCase('en')}`;
}

export type WhatsappOrderItem = Readonly<{
  productId: string;
  name: string;
  presentation?: string;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
}>;

export type WhatsappOrderResponse = Readonly<{
  orderId: string;
  status: 'pending';
  currency: 'ARS';
  totalMinor: number;
  itemCount: number;
  createdAt: string;
  items: readonly WhatsappOrderItem[];
}>;

export type PublicOrderStatus =
  | 'preference_pending'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export type PublicOrderStatusResponse = Readonly<{
  status: PublicOrderStatus;
  currency: 'ARS';
  totalMinor: number;
  itemCount: number;
  updatedAt: string;
}>;

export const ANALYTICS_EVENT_NAMES = [
  'page_view',
  'product_view',
  'cart_add',
  'cart_remove',
  'checkout_start',
  'checkout_redirect',
  'manual_payment_click',
  'whatsapp_open',
  'consent_granted',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsSource = 'direct' | 'referral' | 'campaign' | 'unknown';
export type AnalyticsDeviceClass = 'mobile' | 'tablet' | 'desktop' | 'unknown';
