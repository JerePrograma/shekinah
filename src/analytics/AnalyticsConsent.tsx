import { useEffect, useState } from 'react';

import {
  getAnalyticsConsent,
  grantAnalyticsConsent,
  rejectAnalyticsConsent,
  subscribeAnalyticsConsent,
} from './client';
import { isAnalyticsClientEnabled } from '../commerce/env';

export function AnalyticsConsent() {
  const [consent, setConsent] = useState(getAnalyticsConsent);
  const [pending, setPending] = useState(false);

  useEffect(
    () => subscribeAnalyticsConsent(() => setConsent(getAnalyticsConsent())),
    [],
  );

  if (!isAnalyticsClientEnabled() || consent !== 'undecided') return null;

  return (
    <aside className="consent-banner" aria-labelledby="analytics-consent-title">
      <div>
        <h2 id="analytics-consent-title">Analítica opcional</h2>
        <p>
          Podemos medir las visitas y el uso del catálogo, sin publicidad ni
          rastreadores de terceros. Es opcional: no enviamos datos de uso hasta que aceptes.
          Podés cambiar tu elección en Privacidad.
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
