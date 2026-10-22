import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { MarketingCampaign } from '../commerce/marketing-contracts';
import { isSafeMarketingHref } from '../commerce/marketing-contracts';
import { AppLink } from '../routing/AppLink';
import type { Navigate } from '../routing/routes';
import { loadPublicMarketing } from './api';
import '../marketing.css';

type PublicMarketing = Readonly<{ announcements: readonly MarketingCampaign[]; promotions: readonly MarketingCampaign[] }>;
const EMPTY_MARKETING: PublicMarketing = Object.freeze({ announcements: [], promotions: [] });
const MarketingContext = createContext<PublicMarketing>(EMPTY_MARKETING);

export function PublicMarketingProvider({ children, enabled = true }: Readonly<{ children: ReactNode; enabled?: boolean }>) {
  const [content, setContent] = useState<PublicMarketing>(EMPTY_MARKETING);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let pending = false;
    const refresh = () => {
      if (pending) return;
      pending = true;
      void loadPublicMarketing(controller.signal).then(value => {
        if (!controller.signal.aborted) setContent(value);
      }).catch(() => {
        // Optional commercial content must never interrupt catalog or checkout.
        if (!controller.signal.aborted) setContent(EMPTY_MARKETING);
      }).finally(() => { pending = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [enabled]);
  return <MarketingContext.Provider value={content}>{children}</MarketingContext.Provider>;
}

export function Announcements({ placement, navigate }: Readonly<{ placement: MarketingCampaign['placement']; navigate: Navigate }>) {
  const { announcements, promotions } = useContext(MarketingContext);
  const now = Date.now();
  const entries = [...announcements, ...promotions].filter(campaign => campaign.placement === placement && campaign.enabled &&
    (campaign.startsAt === null || Date.parse(campaign.startsAt) <= now) &&
    (campaign.endsAt === null || Date.parse(campaign.endsAt) > now) &&
    (campaign.maxRedemptions === null || campaign.redemptionCount < campaign.maxRedemptions))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  if (entries.length === 0) return null;
  return <aside className={`store-announcements store-announcements-${placement}`} aria-label={placement === 'home' ? 'Novedades y promociones' : 'Anuncios de la tienda'}>
    <div className="container store-announcements-grid">{entries.map(campaign => <article className="store-announcement" key={campaign.id}>
      <div><p className="store-announcement-title">{campaign.title}</p>{campaign.body === '' ? null : <p>{campaign.body}</p>}
        {campaign.type === 'automatic' && campaign.percentOff !== null ? <p className="store-promotion-detail">Hasta {campaign.percentOff}% de descuento{campaign.minSubtotalMinor > 0 ? ` con una compra total mínima de ${money(campaign.minSubtotalMinor)}` : ''}{campaign.maxDiscountMinor === null ? '' : `, hasta ${money(campaign.maxDiscountMinor)} por compra`}. {campaign.productCodes.length === 0 ? 'En productos elegibles.' : 'En los productos seleccionados.'} Sólo para retiro coordinado. El descuento se confirma en el carrito.</p> : null}
      </div>
      {campaign.href !== '' && isSafeMarketingHref(campaign.href) && campaign.ctaLabel !== '' ? <AppLink className="store-announcement-link" navigate={navigate} to={campaign.href}>{campaign.ctaLabel}<span aria-hidden="true"> →</span></AppLink> : null}
    </article>)}</div>
  </aside>;
}

function money(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: value % 100 === 0 ? 0 : 2 }).format(value / 100);
}
