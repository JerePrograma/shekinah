const PRICE_LIST = 'PRECIOS DEL NEGOCIO';

/**
 * Evidence only: preserves observed 1/2 so historical reports can label them
 * placeholders. This value never supplies the public catalog or checkout.
 * The current reader represents a malformed price list as null, and an absent
 * list as []; older exported entries may omit `valid`.
 */
export function readDuxAnalysisPrice(prices) {
  const result = (status, amount = null) => Object.freeze({ status, amount });
  if (prices === undefined) return result('missing_or_zero');
  if (!Array.isArray(prices) || prices.some((price) =>
    typeof price !== 'object' || price === null || Array.isArray(price) ||
    typeof price.name !== 'string' || price.name.trim() === '',
  )) return result('invalid');
  const matches = prices.filter((price) => price.name.trim().toLocaleUpperCase('es-AR') === PRICE_LIST);
  if (matches.length === 0) return result('missing_or_zero');
  if (matches.length !== 1 || matches[0].valid === false ||
    (Object.hasOwn(matches[0], 'id') && (typeof matches[0].id !== 'number' ||
      !Number.isSafeInteger(matches[0].id) || matches[0].id <= 0))) return result('invalid');
  const amount = matches[0].amount;
  if (amount === null || amount === undefined || amount === 0) return result('missing_or_zero');
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return result('invalid');
  if (amount === 1 || amount === 2) return result('placeholder', amount);
  if (amount <= 2 || Number(amount.toFixed(2)) !== amount ||
    !Number.isSafeInteger(Math.round(amount * 100))) return result('invalid');
  return result('usable', amount);
}
