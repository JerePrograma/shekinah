import type { AppRoute } from './routing/routes';

const PUBLIC_MAINTENANCE_ENABLED = true;

export function shouldShowPublicMaintenance(
  routeId: AppRoute['id'],
  isProduction = import.meta.env.PROD,
): boolean {
  return PUBLIC_MAINTENANCE_ENABLED && isProduction && routeId !== 'admin';
}
