// ──────────────────────────────────────────────────────────────────────────
// Geofence verification wrapper. Supports circular + polygon sites and returns
// an employee-friendly message including remaining distance to the boundary.
// ──────────────────────────────────────────────────────────────────────────
import { evaluateGeofence } from '../utils/geo';

/**
 * @param {number} lat
 * @param {number} lng
 * @param {object} site  { lat, lng, radius?, polygon?, name? }
 * @returns {{ ok:boolean, distanceToBoundary:number, distanceToCenter:number|null, reason:string }}
 */
export function verifyGeofence(lat, lng, site) {
  if (!site || (site.lat == null && !site.polygon)) {
    return {
      ok: false,
      distanceToBoundary: 0,
      distanceToCenter: null,
      reason: 'Your assigned site has no geofence configured. Contact your admin.',
    };
  }
  const r = evaluateGeofence(lat, lng, site);
  if (r.inside) {
    return { ...r, ok: true, reason: `Inside the geofence for "${site.name || 'your site'}".` };
  }
  return {
    ...r,
    ok: false,
    reason: `You are ${Math.round(r.distanceToBoundary)}m outside the allowed area for "${
      site.name || 'your site'
    }". Move closer and try again.`,
  };
}
