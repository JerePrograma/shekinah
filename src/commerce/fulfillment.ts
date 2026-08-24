export const DELIVERY_METHODS = ['coordinated_pickup', 'correo_argentino'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
export type FulfillmentField = 'method' | 'fullName' | 'phone' | 'address' | 'locality' | 'province' | 'postalCode' | 'form';
export type FulfillmentDraft = Readonly<{
  method: DeliveryMethod | '';
  fullName: string;
  phone: string;
  address: string;
  locality: string;
  province: string;
  postalCode: string;
}>;
export type CheckoutFulfillment = Readonly<{
  method: DeliveryMethod;
  fullName: string;
  phone: string;
  address: string;
  locality: string;
  province: string;
  postalCode: string;
}>;
export type FulfillmentValidation = Readonly<{
  value: CheckoutFulfillment | null;
  errors: Readonly<Partial<Record<FulfillmentField, string>>>;
}>;
export type ShippingLine = Readonly<{ name: string; presentation?: string; quantity: number }>;
export type ShippingTier = 'coordinated_pickup' | 'correo_up_to_1kg' | 'correo_up_to_5kg' | 'manual_unknown_weight' | 'manual_over_5kg';
export type ShippingQuote =
  | Readonly<{ kind: 'online'; tier: Exclude<ShippingTier, 'manual_unknown_weight' | 'manual_over_5kg'>; shippingMinor: number; totalWeightGrams: number | null }>
  | Readonly<{ kind: 'manual'; tier: 'manual_unknown_weight' | 'manual_over_5kg'; shippingMinor: 0; totalWeightGrams: number | null }>;

export const CORREO_UP_TO_1KG_MINOR = 1_900_000;
export const CORREO_UP_TO_5KG_MINOR = 2_500_000;
const exactKeys = ['method', 'fullName', 'phone', 'address', 'locality', 'province', 'postalCode'] as const;
const unitPattern = '(?:kg|kgs?|kilogramos?|kilos?|g|gr|grs|gramos?)';

export function validateFulfillment(value: unknown): FulfillmentValidation {
  const errors: Partial<Record<FulfillmentField, string>> = {};
  if (!isRecord(value)) return frozenInvalid({ form: 'Completá los datos de entrega.' });
  if (Object.keys(value).some((key) => !new Set<string>(exactKeys).has(key))) errors.form = 'Los datos de entrega contienen campos no permitidos.';
  const method = readMethod(value.method, errors);
  const fullName = readText(value.fullName, 'fullName', 'nombre completo', 3, 120, errors);
  const phone = readPhone(value.phone, errors);
  const addressRequired = method === 'correo_argentino';
  const address = addressRequired
    ? readText(value.address, 'address', 'dirección', 5, 180, errors)
    : discardOptionalText(value.address, 'address', 'dirección', 180, errors);
  const locality = addressRequired
    ? readText(value.locality, 'locality', 'localidad', 2, 100, errors)
    : discardOptionalText(value.locality, 'locality', 'localidad', 100, errors);
  const province = addressRequired
    ? readText(value.province, 'province', 'provincia', 2, 80, errors)
    : discardOptionalText(value.province, 'province', 'provincia', 80, errors);
  const postalCode = addressRequired
    ? readPostalCode(value.postalCode, errors)
    : discardOptionalText(value.postalCode, 'postalCode', 'código postal', 12, errors);
  if (method === null || fullName === null || phone === null || address === null || locality === null || province === null || postalCode === null || Object.keys(errors).length > 0) {
    return Object.freeze({ value: null, errors: Object.freeze(errors) });
  }
  return Object.freeze({
    value: Object.freeze({ method, fullName, phone, address, locality, province, postalCode }),
    errors: Object.freeze({}),
  });
}

export function fulfillmentCanonicalValue(value: CheckoutFulfillment): string {
  return JSON.stringify([value.method, value.fullName, value.phone, value.address, value.locality, value.province, value.postalCode]);
}

export function deriveUnitWeightGrams(product: Readonly<{ name: string; presentation?: string }>): number | null {
  const nameWeight = parseNameWeight(product.name);
  if (product.presentation === undefined) return nameWeight;
  const presentationWeight = parseExactWeight(product.presentation);
  return presentationWeight !== null && nameWeight !== null && presentationWeight !== nameWeight
    ? null
    : presentationWeight;
}

export function calculateShippingQuote(lines: readonly ShippingLine[], method: DeliveryMethod): ShippingQuote {
  const total = calculateTotalWeight(lines);
  if (method === 'coordinated_pickup') {
    return Object.freeze({ kind: 'online', tier: 'coordinated_pickup', shippingMinor: 0, totalWeightGrams: total });
  }
  if (total === null) return manual('manual_unknown_weight', null);
  if (total > 5_000) return manual('manual_over_5kg', total);
  return total <= 1_000
    ? Object.freeze({ kind: 'online', tier: 'correo_up_to_1kg', shippingMinor: CORREO_UP_TO_1KG_MINOR, totalWeightGrams: total })
    : Object.freeze({ kind: 'online', tier: 'correo_up_to_5kg', shippingMinor: CORREO_UP_TO_5KG_MINOR, totalWeightGrams: total });
}

function calculateTotalWeight(lines: readonly ShippingLine[]): number | null {
  let total = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) return null;
    const unit = deriveUnitWeightGrams(line);
    if (unit === null) return null;
    const lineWeight = unit * line.quantity;
    if (!Number.isSafeInteger(lineWeight) || lineWeight <= 0) return null;
    total += lineWeight;
    if (!Number.isSafeInteger(total) || total <= 0) return null;
  }
  return total > 0 ? total : null;
}

export function deliveryMethodLabel(method: DeliveryMethod): string {
  return method === 'coordinated_pickup' ? 'Retiro o entrega personal coordinada' : 'Correo Argentino';
}

export function requiresDeliveryAddress(method: DeliveryMethod | ''): boolean {
  return method === 'correo_argentino';
}

function manual(tier: 'manual_unknown_weight' | 'manual_over_5kg', totalWeightGrams: number | null): ShippingQuote {
  return Object.freeze({ kind: 'manual', tier, shippingMinor: 0, totalWeightGrams });
}
function frozenInvalid(errors: Partial<Record<FulfillmentField, string>>): FulfillmentValidation {
  return Object.freeze({ value: null, errors: Object.freeze(errors) });
}
function readMethod(value: unknown, errors: Partial<Record<FulfillmentField, string>>): DeliveryMethod | null {
  if (typeof value === 'string' && DELIVERY_METHODS.includes(value as DeliveryMethod)) return value as DeliveryMethod;
  errors.method = 'Elegí una modalidad de entrega.';
  return null;
}
function readText(value: unknown, field: FulfillmentField, label: string, min: number, max: number, errors: Partial<Record<FulfillmentField, string>>): string | null {
  if (typeof value !== 'string' || containsControl(value)) {
    errors[field] = `El campo ${label} no es válido.`;
    return null;
  }
  const normalized = normalizeSpace(value);
  if (normalized.length < min || normalized.length > max) {
    errors[field] = `El campo ${label} debe tener entre ${min} y ${max} caracteres.`;
    return null;
  }
  return normalized;
}
function discardOptionalText(value: unknown, field: FulfillmentField, label: string, max: number, errors: Partial<Record<FulfillmentField, string>>): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || containsControl(value) || value.normalize('NFKC').trim().length > max) {
    errors[field] = `El campo ${label} no es válido.`;
    return null;
  }
  return '';
}
function readPhone(value: unknown, errors: Partial<Record<FulfillmentField, string>>): string | null {
  if (typeof value !== 'string' || containsControl(value) || !/^\+?[\d\s().-]+$/u.test(value.normalize('NFKC').trim())) {
    errors.phone = 'El celular no es válido.';
    return null;
  }
  const digits = value.replace(/\D/gu, '');
  if (!/^\d{8,15}$/u.test(digits)) {
    errors.phone = 'El celular debe contener entre 8 y 15 dígitos.';
    return null;
  }
  return digits;
}
function readPostalCode(value: unknown, errors: Partial<Record<FulfillmentField, string>>): string | null {
  if (typeof value !== 'string' || containsControl(value)) {
    errors.postalCode = 'El código postal no es válido.';
    return null;
  }
  const normalized = normalizeSpace(value).toLocaleUpperCase('es-AR');
  if (!/^[A-Z0-9][A-Z0-9 -]{2,10}[A-Z0-9]$/u.test(normalized)) {
    errors.postalCode = 'Ingresá un código postal de 4 a 12 caracteres.';
    return null;
  }
  return normalized;
}
function parseExactWeight(value: string): number | null {
  const match = new RegExp(`^(?:x\\s*)?(\\d+(?:[.,]\\d{1,3})?)\\s*(${unitPattern})\\.?$`, 'iu').exec(value.normalize('NFKC').trim());
  return match === null ? null : toGrams(match[1], match[2]);
}
function parseNameWeight(value: string): number | null {
  const normalized = value.normalize('NFKC').trim();
  if (new RegExp(`\\b\\d+\\s*[x×]\\s*\\d+(?:[.,]\\d{1,3})?\\s*${unitPattern}\\b`, 'iu').test(normalized)) return null;
  const matches = [...normalized.matchAll(new RegExp(`(?:^|[\\s(,;/-])(?:x\\s*)?(\\d+(?:[.,]\\d{1,3})?)\\s*(${unitPattern})\\.?(?=$|[\\s),;/-])`, 'giu'))];
  return matches.length === 1 ? toGrams(matches[0]?.[1], matches[0]?.[2]) : null;
}
function toGrams(rawAmount: string | undefined, rawUnit: string | undefined): number | null {
  if (rawAmount === undefined || rawUnit === undefined) return null;
  const amount = Number(rawAmount.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const grams = rawUnit.toLocaleLowerCase('es-AR').startsWith('k') ? amount * 1_000 : amount;
  const rounded = Math.round(grams);
  return Number.isSafeInteger(rounded) && rounded > 0 && Math.abs(grams - rounded) < 0.000001 ? rounded : null;
}
function normalizeSpace(value: string): string { return value.normalize('NFKC').trim().replace(/\s+/gu, ' '); }
function containsControl(value: string): boolean {
  if (/\p{Bidi_Control}/u.test(value)) return true;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
