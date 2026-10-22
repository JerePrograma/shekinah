import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { MarketingCampaign, MarketingCampaignInput } from '../commerce/marketing-contracts';
import { isSafeMarketingHref } from '../commerce/marketing-contracts';
import { loadAdminMarketing, MarketingSessionExpired, saveMarketingCampaign } from '../marketing/api';
import type { ProductInteractionState } from './ProductManager';

type Draft = Readonly<{
  type: MarketingCampaign['type']; code: string; title: string; body: string; ctaLabel: string; href: string;
  placement: MarketingCampaign['placement']; priority: string; enabled: boolean; startsAt: string; endsAt: string;
  percentOff: string; minSubtotal: string; maxDiscount: string; productCodes: string; maxRedemptions: string;
}>;
type Field = keyof Draft;
type Errors = Partial<Record<Field, string>>;
const TYPES = { coupon: 'Cupón', automatic: 'Promoción automática', announcement: 'Anuncio' } as const;
const IDLE: ProductInteractionState = Object.freeze({ dirty: false, busy: false });
const EMPTY_DRAFT: Draft = Object.freeze({ type: 'coupon', code: '', title: '', body: '', ctaLabel: '', href: '',
  placement: 'home', priority: '0', enabled: false, startsAt: '', endsAt: '', percentOff: '',
  minSubtotal: '0', maxDiscount: '', productCodes: '', maxRedemptions: '' });

export function MarketingPanel({ active = true, onUnauthorized, onInteractionStateChange }: Readonly<{
  active?: boolean; onUnauthorized?: (() => void) | undefined;
  onInteractionStateChange?: ((state: ProductInteractionState) => void) | undefined;
}>) {
  const [campaigns, setCampaigns] = useState<readonly MarketingCampaign[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | MarketingCampaign['type']>('all');
  const [pendingEditor, setPendingEditor] = useState<MarketingCampaign | 'new' | 'close' | null>(null);
  const operation = useRef(false);
  const creationKey = useRef<string | undefined>(undefined);
  const loadSequence = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const editorTitleRef = useRef<HTMLHeadingElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(original);
  const interaction = useMemo<ProductInteractionState>(() => ({ dirty, busy, ...(busy ? { operationLabel: 'Guardando campaña' } : {}) }), [dirty, busy]);

  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try {
      const value = await loadAdminMarketing();
      if (sequence !== loadSequence.current) return;
      setCampaigns(value.campaigns);
      setLoaded(true);
    } catch (caught: unknown) {
      if (sequence !== loadSequence.current) return;
      if (caught instanceof MarketingSessionExpired) onUnauthorized?.();
      setError(errorMessage(caught));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    if (active && !loaded) void reload();
    return () => { loadSequence.current += 1; };
  }, [active, loaded, reload]);
  useEffect(() => { onInteractionStateChange?.(interaction); }, [interaction, onInteractionStateChange]);
  useEffect(() => () => { onInteractionStateChange?.(IDLE); }, [onInteractionStateChange]);
  useEffect(() => { if (pendingEditor !== null) confirmCancelRef.current?.focus(); }, [pendingEditor]);

  function openEditor(campaign: MarketingCampaign | 'new' | 'close') {
    setPendingEditor(null);
    setErrors({});
    setError('');
    setMessage('');
    if (campaign === 'close') {
      setDraft(null); setOriginal(null); setEditingId(undefined);
      window.requestAnimationFrame(() => (returnFocusRef.current?.isConnected ? returnFocusRef.current : newButtonRef.current)?.focus());
      return;
    }
    const next = campaign === 'new' ? { ...EMPTY_DRAFT } : toDraft(campaign);
    if (campaign === 'new') creationKey.current = crypto.randomUUID();
    setDraft(next); setOriginal(next); setEditingId(campaign === 'new' ? undefined : campaign.id);
    window.requestAnimationFrame(() => {
      editorTitleRef.current?.focus({ preventScroll: true });
      editorTitleRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    });
  }

  function requestEditor(campaign: MarketingCampaign | 'new' | 'close', trigger?: HTMLElement) {
    if (busy) return;
    if (trigger !== undefined) returnFocusRef.current = trigger;
    if (dirty) { setPendingEditor(campaign); return; }
    openEditor(campaign);
  }

  function update<K extends Field>(key: K, value: Draft[K]) {
    setDraft(current => current === null ? null : { ...current, [key]: value });
    setErrors(current => ({ ...current, [key]: undefined }));
    setError('');
    setMessage('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null || operation.current) return;
    const result = validateDraft(draft);
    setErrors(result.errors);
    if (result.input === null) {
      setError('Revisá los campos indicados antes de guardar.');
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    operation.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const saved = await saveMarketingCampaign(result.input, editingId, creationKey.current);
      setCampaigns(current => [saved, ...current.filter(campaign => campaign.id !== saved.id)]);
      const next = toDraft(saved);
      setDraft(next); setOriginal(next); setEditingId(saved.id);
      setMessage(saved.enabled ? 'Campaña guardada y habilitada según su vigencia.' : 'Borrador guardado. Podés activarlo cuando esté listo.');
    } catch (caught: unknown) {
      if (caught instanceof MarketingSessionExpired) onUnauthorized?.();
      setError(errorMessage(caught));
    } finally { operation.current = false; setBusy(false); }
  }

  async function toggle(campaign: MarketingCampaign) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(''); setMessage('');
    const input: MarketingCampaignInput = { type: campaign.type, code: campaign.code, title: campaign.title, body: campaign.body,
      ctaLabel: campaign.ctaLabel, href: campaign.href, placement: campaign.placement, priority: campaign.priority,
      enabled: !campaign.enabled, startsAt: campaign.startsAt, endsAt: campaign.endsAt, percentOff: campaign.percentOff,
      minSubtotalMinor: campaign.minSubtotalMinor, maxDiscountMinor: campaign.maxDiscountMinor,
      productCodes: [...campaign.productCodes], maxRedemptions: campaign.maxRedemptions };
    try {
      const saved = await saveMarketingCampaign(input, campaign.id);
      setCampaigns(current => current.map(entry => entry.id === saved.id ? saved : entry));
      if (editingId === saved.id && !dirty) { const next = toDraft(saved); setDraft(next); setOriginal(next); }
      setMessage(saved.enabled ? 'Campaña habilitada según su vigencia.' : 'Campaña desactivada.');
    } catch (caught: unknown) {
      if (caught instanceof MarketingSessionExpired) onUnauthorized?.();
      setError(errorMessage(caught));
    } finally { operation.current = false; setBusy(false); }
  }

  const visible = campaigns.filter(campaign => filter === 'all' || campaign.type === filter)
    .sort((left, right) => right.priority - left.priority || right.updatedAt.localeCompare(left.updatedAt));
  return <section className="admin-marketing" aria-labelledby="admin-marketing-title" aria-busy={loading || busy}>
    <header className="admin-page-header"><div><h1 id="admin-marketing-title" tabIndex={-1}>Marketing</h1><p>Gestioná cupones, promociones y anuncios de la tienda.</p></div>
      <div className="admin-marketing-header-actions"><button className="button button-secondary" type="button" disabled={busy || loading || !loaded} onClick={() => void reload()}>Actualizar campañas</button>
        <button ref={newButtonRef} className="button button-primary" type="button" disabled={busy || loading || !loaded} onClick={event => requestEditor('new', event.currentTarget)}>Nueva campaña</button></div>
    </header>
    {error === '' ? null : <p className="form-error" role="alert">{error}</p>}
    {message === '' ? null : <p role="status">{message}</p>}
    {loading ? <p role="status">Cargando campañas…</p> : null}
    {!loaded && !loading ? <button className="button button-secondary" type="button" onClick={() => void reload()}>Reintentar carga de campañas</button> : null}
    {pendingEditor === null ? null : <div className="admin-inline-confirmation" role="dialog" aria-labelledby="marketing-discard-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setPendingEditor(null); editorTitleRef.current?.focus(); }
    }}><h2 id="marketing-discard-title">Hay cambios de campaña sin guardar</h2><p>Si continuás se perderán los cambios de este formulario.</p>
      <button className="button button-secondary" ref={confirmCancelRef} type="button" onClick={() => { setPendingEditor(null); editorTitleRef.current?.focus(); }}>Seguir editando</button>
      <button className="button button-danger" type="button" onClick={() => openEditor(pendingEditor)}>Descartar cambios y continuar</button>
    </div>}
    <div className={`admin-marketing-workspace${draft === null ? '' : ' has-editor'}`}>
      <div className="admin-marketing-list"><label className="admin-marketing-filter">Mostrar campañas<select value={filter} disabled={busy} onChange={event => setFilter(event.currentTarget.value as typeof filter)}>
        <option value="all">Todos los tipos</option>{Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {!loaded || loading ? null : visible.length === 0 ? <div className="admin-marketing-empty"><h2>{campaigns.length === 0 ? 'Todavía no hay campañas' : 'No hay campañas de este tipo'}</h2><p>{campaigns.length === 0 ? 'Creá un cupón, una promoción automática o un anuncio. Las campañas nuevas comienzan como borrador.' : 'Elegí otro tipo para ver las campañas guardadas.'}</p></div> : <ul className="admin-campaigns">{visible.map(campaign => <li className={`admin-campaign${editingId === campaign.id ? ' is-selected' : ''}`} key={campaign.id}>
        <div className="admin-campaign-heading"><span className="admin-campaign-type">{TYPES[campaign.type]}</span><span className="admin-campaign-status">{campaignStatus(campaign)}</span></div>
        <h2>{campaign.title}</h2>{campaign.code === null ? null : <p className="admin-campaign-code">Código: <strong>{campaign.code}</strong></p>}
        <p>{campaign.type === 'announcement' ? campaign.body : `${campaign.percentOff}% de descuento${campaign.minSubtotalMinor > 0 ? ` desde ${money(campaign.minSubtotalMinor)}` : ''}${campaign.maxDiscountMinor === null ? '' : ` · Tope ${money(campaign.maxDiscountMinor)}`}`}</p>
        <p className="admin-campaign-meta">{campaign.startsAt === null ? 'Sin fecha de inicio' : `Desde ${dateLabel(campaign.startsAt)}`}{campaign.endsAt === null ? ' · Sin vencimiento' : ` · Hasta ${dateLabel(campaign.endsAt)}`}</p>
        {campaign.type === 'announcement' ? null : <p className="admin-campaign-meta">Usos: {campaign.redemptionCount}{campaign.maxRedemptions === null ? '' : ` de ${campaign.maxRedemptions}`}</p>}
        <div className="admin-campaign-actions"><button className="button button-secondary" type="button" disabled={busy} aria-label={`Editar ${campaign.title}`} onClick={event => requestEditor(campaign, event.currentTarget)}>Editar</button>
          <button className="text-button" type="button" disabled={busy || (dirty && editingId === campaign.id)} aria-label={`${campaign.enabled ? 'Desactivar' : 'Activar'} ${campaign.title}`} onClick={() => void toggle(campaign)}>{campaign.enabled ? 'Desactivar' : 'Activar'}</button></div>
      </li>)}</ul>}
      </div>
      {draft === null ? null : <form className="admin-marketing-editor" ref={formRef} noValidate onSubmit={event => void save(event)} aria-labelledby="marketing-editor-title">
        <div className="admin-marketing-editor-heading"><h2 id="marketing-editor-title" ref={editorTitleRef} tabIndex={-1}>{editingId === undefined ? 'Nueva campaña' : 'Editar campaña'}</h2><button className="text-button" type="button" disabled={busy} onClick={() => requestEditor('close')}>Cerrar editor</button></div>
        <p>Guardá como borrador o habilitá la campaña. La vigencia se interpreta en la hora local de este dispositivo.</p>
        <label>Tipo de campaña<select value={draft.type} disabled={busy} onChange={event => update('type', event.currentTarget.value as Draft['type'])}>{Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <TextField field="title" label="Título" value={draft.title} errors={errors} disabled={busy} onChange={update} maxLength={140} required />
        {draft.type !== 'coupon' ? null : <TextField field="code" label="Código del cupón" value={draft.code} errors={errors} disabled={busy} onChange={update} maxLength={32} required help="Usá letras, números, guiones o guion bajo. Se guardará en mayúsculas." />}
        <label htmlFor="marketing-body">{draft.type === 'announcement' ? 'Texto del anuncio' : 'Descripción y condiciones'}<textarea id="marketing-body" value={draft.body} disabled={busy} maxLength={1000} rows={4} aria-invalid={errors.body !== undefined} aria-describedby={errors.body === undefined ? undefined : 'marketing-error-body'} onChange={event => update('body', event.currentTarget.value)} /></label><FieldError field="body" errors={errors} />
        {draft.type === 'announcement' ? null : <><div className="admin-marketing-fields">
          <TextField field="percentOff" label="Descuento (%)" value={draft.percentOff} errors={errors} disabled={busy} onChange={update} type="number" min="1" max="90" step="1" required />
          <TextField field="minSubtotal" label="Compra mínima (ARS)" value={draft.minSubtotal} errors={errors} disabled={busy} onChange={update} type="number" min="0" step="0.01" help="Se evalúa sobre el subtotal completo del carrito, antes del envío." />
          <TextField field="maxDiscount" label="Tope de descuento (ARS)" value={draft.maxDiscount} errors={errors} disabled={busy} onChange={update} type="number" min="0.01" step="0.01" help="Dejalo vacío para no fijar un tope." />
          <TextField field="maxRedemptions" label="Límite total de usos" value={draft.maxRedemptions} errors={errors} disabled={busy} onChange={update} type="number" min="1" step="1" help="Dejalo vacío para usos ilimitados." />
        </div><TextField field="productCodes" label="SKU Dux participantes" value={draft.productCodes} errors={errors} disabled={busy} onChange={update} help="Códigos exactos separados por coma. Vacío incluye todos los productos elegibles." /></>}
        {draft.type === 'coupon' ? null : <><div className="admin-marketing-fields"><TextField field="ctaLabel" label="Texto del enlace" value={draft.ctaLabel} errors={errors} disabled={busy} onChange={update} maxLength={60} />
          <TextField field="href" label="Destino del enlace" value={draft.href} errors={errors} disabled={busy} onChange={update} help="Opcional, dentro de la tienda. Por ejemplo: /catalogo." /></div>
          <label>Ubicación<select value={draft.placement} disabled={busy} onChange={event => update('placement', event.currentTarget.value as Draft['placement'])}><option value="home">Sección de novedades en inicio</option><option value="announcement">Franja de anuncios de la tienda</option></select></label></>}
        <div className="admin-marketing-fields"><TextField field="startsAt" label="Inicio (hora local)" value={draft.startsAt} errors={errors} disabled={busy} onChange={update} type="datetime-local" step="0.001" />
          <TextField field="endsAt" label="Fin (hora local)" value={draft.endsAt} errors={errors} disabled={busy} onChange={update} type="datetime-local" step="0.001" />
          <TextField field="priority" label="Prioridad" value={draft.priority} errors={errors} disabled={busy} onChange={update} type="number" min="-1000" max="1000" step="1" help="Un valor mayor tiene prioridad. Los descuentos no se acumulan." /></div>
        <label className="admin-marketing-enabled"><input type="checkbox" checked={draft.enabled} disabled={busy} onChange={event => update('enabled', event.currentTarget.checked)} /><span>Habilitar campaña según su vigencia</span></label>
        <div className="admin-marketing-save"><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Guardando campaña…' : 'Guardar campaña'}</button><span>{dirty ? 'Hay cambios sin guardar' : 'Sin cambios pendientes'}</span></div>
      </form>}
    </div>
  </section>;
}

function TextField({ field, label, value, errors, disabled, onChange, help, ...input }: Readonly<{
  field: Exclude<Field, 'type' | 'placement' | 'enabled'>; label: string; value: string; errors: Errors; disabled: boolean;
  onChange: <K extends Field>(key: K, value: Draft[K]) => void; help?: string; type?: string; min?: string; max?: string; step?: string; maxLength?: number; required?: boolean;
}>) {
  return <div className="admin-marketing-field"><label htmlFor={`marketing-${field}`}>{label}<input id={`marketing-${field}`} value={value} disabled={disabled} {...input}
    aria-invalid={errors[field] !== undefined} aria-describedby={[help === undefined ? '' : `marketing-help-${field}`, errors[field] === undefined ? '' : `marketing-error-${field}`].filter(Boolean).join(' ') || undefined}
    onChange={event => onChange(field, event.currentTarget.value)} /></label>{help === undefined ? null : <small id={`marketing-help-${field}`}>{help}</small>}<FieldError field={field} errors={errors} /></div>;
}

function FieldError({ field, errors }: Readonly<{ field: Field; errors: Errors }>) {
  return errors[field] === undefined ? null : <span className="field-error" id={`marketing-error-${field}`}>{errors[field]}</span>;
}

function toDraft(campaign: MarketingCampaign): Draft {
  return { type: campaign.type, code: campaign.code ?? '', title: campaign.title, body: campaign.body, ctaLabel: campaign.ctaLabel, href: campaign.href,
    placement: campaign.placement, priority: String(campaign.priority), enabled: campaign.enabled, startsAt: localDate(campaign.startsAt), endsAt: localDate(campaign.endsAt),
    percentOff: campaign.percentOff === null ? '' : String(campaign.percentOff), minSubtotal: String(campaign.minSubtotalMinor / 100), maxDiscount: campaign.maxDiscountMinor === null ? '' : String(campaign.maxDiscountMinor / 100),
    productCodes: campaign.productCodes.join(', '), maxRedemptions: campaign.maxRedemptions === null ? '' : String(campaign.maxRedemptions) };
}

function validateDraft(draft: Draft): Readonly<{ errors: Errors; input: MarketingCampaignInput | null }> {
  const errors: Errors = {};
  const title = draft.title.trim();
  if (title === '' || title.length > 140 || hasControls(title)) errors.title = 'Ingresá un título de hasta 140 caracteres, sin caracteres de control.';
  const body = draft.body.trim();
  if (body.length > 1000 || hasControls(body, true)) errors.body = 'Usá hasta 1000 caracteres, sin caracteres de control.';
  const code = draft.type === 'coupon' ? draft.code.trim().toUpperCase() : null;
  if (code !== null && !/^[A-Z0-9][A-Z0-9_-]{2,31}$/u.test(code)) errors.code = 'Usá entre 3 y 32 letras, números, guiones o guion bajo.';
  const percentOff = draft.type === 'announcement' ? null : Number(draft.percentOff);
  if (percentOff !== null && (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 90)) errors.percentOff = 'Elegí un porcentaje entero entre 1 y 90.';
  const minSubtotalMinor = draft.type === 'announcement' ? 0 : amount(draft.minSubtotal);
  if (minSubtotalMinor === null) errors.minSubtotal = 'Ingresá un monto válido con hasta dos decimales.';
  const maxDiscountMinor = draft.type === 'announcement' || draft.maxDiscount.trim() === '' ? null : amount(draft.maxDiscount);
  if (draft.type !== 'announcement' && draft.maxDiscount.trim() !== '' && (maxDiscountMinor === null || maxDiscountMinor <= 0)) errors.maxDiscount = 'Ingresá un tope mayor a cero con hasta dos decimales.';
  const maxRedemptions = draft.type === 'announcement' || draft.maxRedemptions.trim() === '' ? null : Number(draft.maxRedemptions);
  if (maxRedemptions !== null && (!Number.isSafeInteger(maxRedemptions) || maxRedemptions < 1)) errors.maxRedemptions = 'Ingresá un límite entero mayor a cero.';
  const priority = Number(draft.priority);
  if (draft.priority.trim() === '' || !Number.isInteger(priority) || priority < -1000 || priority > 1000) errors.priority = 'Elegí una prioridad entre -1000 y 1000.';
  const startsAt = isoDate(draft.startsAt); const endsAt = isoDate(draft.endsAt);
  if (draft.startsAt !== '' && startsAt === null) errors.startsAt = 'Revisá la fecha de inicio.';
  if (draft.endsAt !== '' && endsAt === null) errors.endsAt = 'Revisá la fecha de fin.';
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) errors.endsAt = 'La fecha de fin debe ser posterior al inicio.';
  const href = draft.type === 'coupon' ? '' : draft.href.trim();
  const ctaLabel = draft.type === 'coupon' ? '' : draft.ctaLabel.trim();
  if ((href === '') !== (ctaLabel === '')) { errors.href = 'Completá el destino y el texto del enlace, o dejá ambos vacíos.'; errors.ctaLabel = errors.href; }
  if (!isSafeMarketingHref(href) || href.length > 500) errors.href = 'Usá una ruta interna de la tienda, como /catalogo.';
  if (ctaLabel.length > 60 || hasControls(ctaLabel)) errors.ctaLabel = 'Usá hasta 60 caracteres, sin caracteres de control.';
  const productCodes = draft.type === 'announcement' ? [] : [...new Set(draft.productCodes.split(',').map(code => code.trim()).filter(Boolean))];
  if (productCodes.length > 500 || productCodes.some(code => code.length > 300 || hasControls(code))) errors.productCodes = 'Ingresá hasta 500 SKU Dux válidos separados por coma.';
  if (Object.keys(errors).length > 0 || minSubtotalMinor === null) return { errors, input: null };
  return { errors, input: { type: draft.type, code, title, body, href, ctaLabel, placement: draft.placement, priority, enabled: draft.enabled,
    startsAt, endsAt, percentOff, minSubtotalMinor, maxDiscountMinor, productCodes, maxRedemptions } };
}

function amount(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(value.trim())) return null;
  const minor = Math.round(Number(value) * 100);
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}
function hasControls(value: string, allowLines = false): boolean {
  return [...value].some(character => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 32 && !(allowLines && (code === 10 || code === 13))) || code === 127;
  });
}
function isoDate(value: string): string | null { if (value === '') return null; const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function localDate(value: string | null): string {
  if (value === null) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
}
function money(value: number) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: value % 100 === 0 ? 0 : 2 }).format(value / 100); }
function dateLabel(value: string) { return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); }
function campaignStatus(campaign: MarketingCampaign) {
  if (!campaign.enabled) return 'Borrador / desactivada';
  const now = Date.now();
  if (campaign.endsAt !== null && Date.parse(campaign.endsAt) <= now) return 'Finalizada';
  if (campaign.startsAt !== null && Date.parse(campaign.startsAt) > now) return 'Programada';
  if (campaign.maxRedemptions !== null && campaign.redemptionCount >= campaign.maxRedemptions) return 'Límite de usos alcanzado';
  return 'Activa';
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'No pudimos completar la operación. Reintentá.'; }
