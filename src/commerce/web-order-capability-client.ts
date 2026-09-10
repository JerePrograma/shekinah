import { useEffect, useState } from 'react';

export function useWebOrderRegistrationEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/orders/request-capability', {
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const value: unknown = await response.json();
        return isRecord(value) && Object.keys(value).length === 1 && value.enabled === true;
      })
      .then((value) => {
        if (!controller.signal.aborted) setEnabled(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEnabled(false);
      });
    return () => controller.abort();
  }, []);

  return enabled;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
