import { useEffect, useState } from 'react';

import {
  getAnalyticsConsent,
  grantAnalyticsConsent,
  rejectAnalyticsConsent,
  subscribeAnalyticsConsent,
} from './client';

export function AnalyticsConsent() {
  const [consent, setConsent] = useState(getAnalyticsConsent);
  const [pending, setPending] = useState(false);

  useEffect(
    () => subscribeAnalyticsConsent(() => setConsent(getAnalyticsConsent())),
    [],
  );

  if (consent !== 'undecided') return null;

  return (
    <aside className="consent-banner" aria-labelledby="analytics-consent-title">
      <div>
        <h2 id="analytics-consent-title">Analítica opcional</h2>
        <p>
          Shekinah puede medir visitas y uso del catálogo con datos first-party,
          sin publicidad ni identificadores de terceros. No se envía nada hasta que aceptes.
        </p>
      </div>
      <div className="consent-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void grantAnalyticsConsent().finally(() => setPending(false));
          }}
        >
          Aceptar analítica
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={pending}
          onClick={rejectAnalyticsConsent}
        >
          Continuar sin analítica
        </button>
      </div>
    </aside>
  );
}
