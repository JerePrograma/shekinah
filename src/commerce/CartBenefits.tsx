import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CartItem } from '../cart/model';
import { parseMarketingQuote } from './marketing-contracts';
import type { MarketingQuote } from './marketing-contracts';

export function CartBenefits({ items, enabled, disabled, onQuoteChange, onCouponChange, onBusyChange, onBlockedChange }: Readonly<{
  items: readonly CartItem[]; enabled: boolean; disabled: boolean;
  onQuoteChange: (quote: MarketingQuote | null) => void;
  onCouponChange: (code: string | null) => void;
  onBusyChange: (busy: boolean) => void;
  onBlockedChange: (blocked: boolean) => void;
}>) {
  const [draft, setDraft] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState<MarketingQuote | null>(null);
  const cart = useMemo(() => JSON.stringify(items.map(({ product, quantity }) => ({
    productId: product.id, quantity, catalogVersion: product.commerce?.catalogVersion,
  }))), [items]);

  useEffect(() => () => { onBusyChange(false); onBlockedChange(false); }, [onBusyChange, onBlockedChange]);

  useEffect(() => {
    if (!enabled) {
      setCode(null); setQuote(null); setError(''); setBusy(false);
      onCouponChange(null); onQuoteChange(null); onBusyChange(false); onBlockedChange(false);
      return;
    }
    if (disabled) { setBusy(false); onBusyChange(false); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    let current = true;
    setBusy(true); setError(''); setQuote(null);
    onBusyChange(true); onBlockedChange(code !== null); onQuoteChange(null); onCouponChange(code);
    void (async () => {
      try {
        const response = await fetch('/api/marketing', {
          method: 'POST', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items: JSON.parse(cart) as unknown, ...(code === null ? {} : { couponCode: code }) }),
        });
        let value: unknown;
        try { value = await response.json(); }
        catch { throw new Error('No pudimos consultar los beneficios. Volvé a intentarlo.'); }
        if (!response.ok) throw new Error(responseMessage(value));
        if (!record(value)) throw new Error('No pudimos comprobar los beneficios del carrito.');
        const result = parseMarketingQuote(value.quote);
        const requested = JSON.parse(cart) as Array<{ productId: string; quantity: number }>;
        if (result.lines.length !== requested.length || requested.some(line =>
          !result.lines.some(actual => actual.productId === line.productId && actual.quantity === line.quantity))) {
          throw new Error('Los productos cambiaron. Volvé a consultar los beneficios.');
        }
        if (current) { setQuote(result); onQuoteChange(result); onBlockedChange(false); }
      } catch (failure: unknown) {
        if (current) {
          setError(failure instanceof Error && failure.name === 'Error'
            ? failure.message : 'No pudimos consultar los beneficios. Volvé a intentarlo.');
          onBlockedChange(code !== null);
        }
      } finally {
        window.clearTimeout(timeout);
        if (current) { setBusy(false); onBusyChange(false); }
      }
    })();
    return () => { current = false; window.clearTimeout(timeout); controller.abort(); };
  }, [cart, code, revision, enabled, disabled, onBusyChange, onBlockedChange, onQuoteChange, onCouponChange]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = draft.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/u.test(normalized)) {
      setError('Ingresá un código de 3 a 32 letras, números, guiones o guiones bajos.');
      return;
    }
    setCode(normalized); setDraft(normalized); setRevision(value => value + 1);
  }

  if (!enabled) return <p className="cart-disclaimer">Los cupones y las promociones se aplican a compras con retiro coordinado.</p>;
  return <div className="cart-benefits" aria-busy={busy}>
    <form onSubmit={apply}>
      <label htmlFor="cart-coupon">¿Tenés un cupón?</label>
      <div className="cart-coupon-controls">
        <input id="cart-coupon" name="coupon" type="text" value={draft} maxLength={32}
          autoComplete="off" autoCapitalize="characters" spellCheck={false}
          aria-describedby="cart-coupon-status" disabled={disabled || busy}
          onChange={event => setDraft(event.currentTarget.value)} />
        <button className="button button-secondary" type="submit" disabled={disabled || busy || draft.trim() === ''}>Aplicar</button>
      </div>
    </form>
    <div id="cart-coupon-status" aria-live="polite">
      {busy ? <p role="status">Consultando beneficios…</p> : error !== '' ? <p className="cart-coupon-error" role="alert">{error}</p>
        : quote !== null && quote.discountMinor > 0 ? <p className="cart-coupon-success">{quote.couponCode ? `Cupón ${quote.couponCode} aplicado.`
          : code ? `Aplicamos ${quote.title}, que ofrece un beneficio igual o mayor que tu cupón.` : `${quote.title} aplicada.`} Los beneficios no se acumulan.</p>
        : <p>Las promociones disponibles se aplican automáticamente.</p>}
    </div>
    {code === null ? null : <button className="text-button" type="button" disabled={disabled || busy}
      onClick={() => { setDraft(''); setCode(null); setRevision(value => value + 1); }}>Quitar cupón</button>}
    {error === '' || busy ? null : <button className="text-button" type="button" disabled={disabled}
      onClick={() => setRevision(value => value + 1)}>Volver a consultar beneficios</button>}
  </div>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function responseMessage(value: unknown): string {
  return record(value) && record(value.error) && typeof value.error.message === 'string'
    ? value.error.message : 'No pudimos consultar los beneficios. Volvé a intentarlo.';
}
