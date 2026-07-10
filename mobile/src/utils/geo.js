// ──────────────────────────────────────────────────────────────────────────
// Geospatial helpers shared across the anti-spoofing services.
// Pure functions only — no React Native / Firebase imports here.
// ──────────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance between two lat/lng points, in meters (Haversine). */
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ray-casting point-in-polygon test.
 * @param {number} lat
 * @param {number} lng
 * @param {Array<{lat:number,lng:number}>|Array<[number,number]>} polygon
 */
export function pointInPolygon(lat, lng, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const pts = polygon.map((p) =>
    Array.isArray(p) ? { lat: p[0], lng: p[1] } : p
  );
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lng, yi = pts[i].lat;
    const xj = pts[j].lng, yj = pts[j].lat;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Shortest distance (meters) from a point to a polygon edge set. */
export function distanceToPolygonBoundary(lat, lng, polygon) {
  const pts = polygon.map((p) =>
    Array.isArray(p) ? { lat: p[0], lng: p[1] } : p
  );
  let min = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    min = Math.min(min, distancePointToSegment(lat, lng, pts[j], pts[i]));
  }
  return min;
}

// Approximate point-to-segment distance using an equirectangular projection
// (accurate enough at site scale, < a few km).
function distancePointToSegment(lat, lng, a, b) {
  const toXY = (la, lo) => {
    const x = (lo * Math.PI) / 180 * Math.cos((lat * Math.PI) / 180) * EARTH_RADIUS_M;
    const y = (la * Math.PI) / 180 * EARTH_RADIUS_M;
    return { x, y };
  };
  const p = toXY(lat, lng);
  const v = toXY(a.lat, a.lng);
  const w = toXY(b.lat, b.lng);
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

/**
 * Geofence check that supports both a circular site (lat/lng/radius) and a
 * polygon site (site.polygon = [{lat,lng}, ...]).
 * @returns {{ inside:boolean, distanceToBoundary:number, distanceToCenter:number|null }}
 */
export function evaluateGeofence(lat, lng, site) {
  if (site?.polygon && site.polygon.length >= 3) {
    const inside = pointInPolygon(lat, lng, site.polygon);
    const dist = distanceToPolygonBoundary(lat, lng, site.polygon);
    return {
      inside,
      // When inside, "remaining" distance is how far you could move before exiting;
      // when outside, how far you must move to enter. Both are the boundary distance.
      distanceToBoundary: dist,
      distanceToCenter: null,
    };
  }
  // Circular fallback (existing site shape).
  const radius = parseRadius(site?.radius);
  const distanceToCenter = getDistanceMeters(lat, lng, site.lat, site.lng);
  return {
    inside: distanceToCenter <= radius,
    distanceToBoundary: Math.abs(distanceToCenter - radius),
    distanceToCenter,
  };
}

/** Site radius may be stored as 100, "100", or "100m". Defaults to 100. */
export function parseRadius(radius) {
  if (radius == null) return 100;
  const n = parseInt(radius.toString().replace(/[^0-9.]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/**
 * Travel speed in km/h between two timestamped fixes.
 * @param {{latitude,longitude,timestamp}} prev  timestamp = ms since epoch
 * @param {{latitude,longitude,timestamp}} cur
 */
export function speedKmh(prev, cur) {
  const meters = getDistanceMeters(
    prev.latitude, prev.longitude, cur.latitude, cur.longitude
  );
  const seconds = Math.abs(cur.timestamp - prev.timestamp) / 1000;
  if (seconds <= 0) return 0;
  return (meters / seconds) * 3.6;
}
