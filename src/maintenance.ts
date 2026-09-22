import type { AppRoute } from './routing/routes';

export function shouldShowPublicMaintenance(
  routeId: AppRoute['id'],
  isProduction = import.meta.env.PROD,
  configuredValue = import.meta.env.VITE_PUBLIC_MAINTENANCE_ENABLED,
): boolean {
  return configuredValue !== 'false' && isProduction && routeId !== 'admin';
}
