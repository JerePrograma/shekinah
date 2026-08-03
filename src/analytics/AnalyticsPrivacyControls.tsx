import { useEffect, useState } from 'react';

import { isAnalyticsClientEnabled } from '../commerce/env';
import {
  getAnalyticsConsent,
  grantAnalyticsConsent,
  rejectAnalyticsConsent,
  subscribeAnalyticsConsent,
  withdrawAnalyticsConsent,
} from './client';
import type { AnalyticsConsent, ConsentWithdrawalResult } from './client';

export function AnalyticsPrivacyControls() {
  const [consent, setConsentState] = useState<AnalyticsConsent>(getAnalyticsConsent);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const enabled = isAnalyticsClientEnabled();

  useEffect(
    () => subscribeAnalyticsConsent(() => setConsentState(getAnalyticsConsent())),
    [],
  );

  async function accept() {
    setPending(true);
    setMessage('');
    try {
      await grantAnalyticsConsent();
      setMessage(
        enabled
          ? 'La analítica opcional quedó habilitada para esta experiencia.'
          : 'Guardamos tu elección, pero la analítica permanece deshabilitada por configuración.',
      );
    } finally {
      setPending(false);
    }
  }

  async function withdraw() {
    setPending(true);
    setMessage('');
    try {
      const result = await withdrawAnalyticsConsent();
      setMessage(withdrawalMessage(result));
    } finally {
      setPending(false);
    }
  }

  async function continueWithoutAnalytics() {
    if (consent === 'accepted') {
      await withdraw();
      return;
    }
    rejectAnalyticsConsent();
    setMessage('La analítica permanece desactivada y no se conserva una sesión analítica local.');
  }

  return (
    <section className="privacy-card privacy-controls" aria-labelledby="privacy-controls-title">
      <h2 id="privacy-controls-title">Tus controles</h2>
      <p>
        Estado actual: <strong>{consentLabel(consent, enabled)}</strong>.
      </p>
      <div className="privacy-control-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={pending}
          onClick={() => void accept()}
        >
          Aceptar analítica opcional
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={pending}
          onClick={() => void continueWithoutAnalytics()}
        >
          Continuar sin analítica
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={pending}
          onClick={() => void withdraw()}
        >
          Retirar consentimiento y eliminar sesión
        </button>
      </div>
      {message === '' ? null : (
        <p className="privacy-control-message" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}

function consentLabel(consent: AnalyticsConsent, enabled: boolean): string {
  if (!enabled) return 'deshabilitada por configuración';
  if (consent === 'accepted') return 'aceptada';
  if (consent === 'rejected') return 'rechazada';
  return 'sin decisión';
}

function withdrawalMessage(result: ConsentWithdrawalResult): string {
  switch (result) {
    case 'remote-deleted':
      return 'Se eliminó la sesión local y el servidor confirmó la eliminación de sus eventos.';
    case 'local-only':
      return 'Se eliminó la sesión local. El servidor no pudo confirmar la eliminación remota; no se enviarán eventos nuevos.';
    case 'no-session':
      return 'No había una sesión analítica local para eliminar. La analítica quedó desactivada.';
  }
}
