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
/**
 * @param {number} lat
 * @param {number} lng
 * @param {object|Array} site  Single site { lat, lng, radius?, polygon?, name? } or Array of site objects
 * @returns {{ ok:boolean, distanceToBoundary:number, distanceToCenter:number|null, reason:string, matchedSite?:object }}
 */
export function verifyGeofence(lat, lng, site) {
  const sitesList = Array.isArray(site)
    ? site
    : (site?.assignedSitesList && Array.isArray(site.assignedSitesList) ? site.assignedSitesList : [site]);

  const validSites = sitesList.filter(s => s && (s.lat != null || s.latitude != null || s.polygon));

  if (validSites.length === 0) {
    return {
      ok: false,
      distanceToBoundary: 0,
      distanceToCenter: null,
      reason: 'Your assigned site has no geofence configured. Contact your admin.',
    };
  }

  let bestResult = null;

  for (const s of validSites) {
    const sObj = {
      ...s,
      lat: s.lat != null ? Number(s.lat) : (s.latitude != null ? Number(s.latitude) : null),
      lng: s.lng != null ? Number(s.lng) : (s.longitude != null ? Number(s.longitude) : null),
    };
    const r = evaluateGeofence(lat, lng, sObj);
    if (r.inside) {
      return {
        ...r,
        ok: true,
        matchedSite: sObj,
        reason: `Inside the geofence for "${sObj.name || 'your site'}".`,
      };
    }
    if (!bestResult || r.distanceToBoundary < bestResult.distanceToBoundary) {
      bestResult = { ...r, siteName: sObj.name || 'your site', matchedSite: sObj };
    }
  }

  return {
    ...bestResult,
    ok: false,
    reason: `You are ${Math.round(bestResult.distanceToBoundary)}m outside the allowed area for "${
      bestResult.siteName
    }". Move closer and try again.`,
  };
}
