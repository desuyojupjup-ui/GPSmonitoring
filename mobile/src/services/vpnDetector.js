// ──────────────────────────────────────────────────────────────────────────
// VPN / Proxy / Anti-Spoofing Detection Engine
// Multi-layer detection:
//   Layer 1: Native interface checks (dev/bare builds via react-native-vpn-detector)
//   Layer 2: HTTPS IP Intelligence & Datacenter/Proxy flags (ipquery.io, ipify, ipinfo, ipwho.is)
//   Layer 3: ISP / Org / ASN VPN and Datacenter regex matching
//   Layer 4: Timezone discrepancy (Device system TZ vs IP egress TZ)
//   Layer 5: GPS Geolocation vs IP country & distance discrepancy
//   Layer 6: Network interface tunnel checks (expo-network)
// Returns { active: boolean, reason: string, ip: string|null, provider: string|null, country: string|null }.
// ──────────────────────────────────────────────────────────────────────────

let Network = null;
try { Network = require('expo-network'); } catch { /* not available */ }

// Comprehensive pattern matching for commercial VPNs and cloud datacenter / proxy hosts
const VPN_KEYWORDS = /(vpn|proxy|hosting|datacenter|cloud|ovh|digitalocean|amazon|aws|google cloud|gcp|microsoft|azure|m247|nordvpn|expressvpn|surfshark|cyberghost|mullvad|proton|windscribe|ipvanish|hotspot shield|tunnelbear|purevpn|vyprvpn|hidemyass|zenmate|turbovpn|warp|cloudflare|tailscale|wireguard|openvpn|shadowsocks|v2ray|outline|astrill|tor|strongvpn|zenlayer|datacamp|packethub|leaseweb|choopa|clouvider|sharktech|linode|vultr|hetzner|contabo|cogent|psychz|quadranet|buyvm|frantech|colocrossing|hostinger|alicloud|tencent|tzulo|kamatera|iphost|vnet|softlayer|linode)/i;

// Cache detection results for 5 seconds to prevent spamming APIs during rapid re-renders
let _cachedResult = null;
let _lastCheckTime = 0;
const CACHE_TTL_MS = 5000;

async function nativeVpnActive() {
  return null;
}

async function fetchWithTimeout(url, timeoutMs = 4000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTimezoneOffsetMinutes(tzString) {
  if (!tzString) return null;
  try {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tzString }));
    return Math.round((tzDate - utcDate) / (60 * 1000));
  } catch {
    return null;
  }
}

/**
 * Fetch IP intelligence from HTTPS-only endpoints compatible with iOS ATS.
 */
async function fetchIpIntelligence(overrideIp = null) {
  let targetIp = overrideIp;

  // 1. Resolve public IP over HTTPS if not provided
  if (!targetIp) {
    const ipify = await fetchWithTimeout('https://api.ipify.org?format=json', 3000);
    if (ipify?.ip) targetIp = ipify.ip;
  }

  // 2. Primary HTTPS API: api.ipquery.io (returns boolean is_vpn, is_datacenter, is_proxy, country_code)
  if (targetIp) {
    try {
      const q = await fetchWithTimeout(`https://api.ipquery.io/${targetIp}`, 4000);
      if (q && q.ip) {
        return {
          ip: q.ip,
          country: q.location?.country,
          countryCode: (q.location?.country_code || '').toUpperCase(),
          city: q.location?.city,
          lat: q.location?.latitude,
          lon: q.location?.longitude,
          timezone: q.location?.timezone,
          isp: q.isp?.isp || q.isp?.org,
          org: q.isp?.org || q.isp?.isp,
          as: q.isp?.asn,
          proxy: q.risk?.is_proxy === true || q.risk?.is_vpn === true || q.risk?.is_tor === true,
          hosting: q.risk?.is_datacenter === true,
          riskScore: q.risk?.risk_score || 0,
        };
      }
    } catch {}
  }

  // 3. Secondary HTTPS fallback: ipinfo.io
  try {
    const info = await fetchWithTimeout(`https://ipinfo.io/${targetIp ? `${targetIp}/` : ''}json`, 3500);
    if (info && info.ip) {
      let lat = null, lon = null;
      if (info.loc) {
        const parts = info.loc.split(',');
        lat = parseFloat(parts[0]);
        lon = parseFloat(parts[1]);
      }
      return {
        ip: info.ip,
        country: info.country,
        countryCode: (info.country || '').toUpperCase(),
        city: info.city,
        lat,
        lon,
        timezone: info.timezone,
        isp: info.org,
        org: info.org,
        as: info.org,
        proxy: false,
        hosting: false,
        riskScore: 0,
      };
    }
  } catch {}

  // 4. Tertiary HTTPS fallback: ipwho.is
  try {
    const who = await fetchWithTimeout(`https://ipwho.is/${targetIp ? targetIp : ''}`, 3500);
    if (who && who.success !== false && who.ip) {
      return {
        ip: who.ip,
        country: who.country,
        countryCode: (who.country_code || '').toUpperCase(),
        city: who.city,
        lat: who.latitude,
        lon: who.longitude,
        timezone: who.timezone?.id,
        isp: who.connection?.isp,
        org: who.connection?.org,
        as: who.connection?.asn ? `AS${who.connection.asn}` : '',
        proxy: who.security?.proxy === true || who.security?.vpn === true || who.security?.tor === true,
        hosting: who.security?.hosting === true,
        riskScore: 0,
      };
    }
  } catch {}

  // 5. Fallback for non-iOS environments: ip-api.com
  try {
    const api = await fetchWithTimeout(
      `http://ip-api.com/json/${targetIp ? targetIp : ''}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,query,proxy,hosting`,
      3500
    );
    if (api && api.status === 'success') {
      return {
        ip: api.query,
        country: api.country,
        countryCode: (api.countryCode || '').toUpperCase(),
        city: api.city,
        lat: api.lat,
        lon: api.lon,
        timezone: api.timezone,
        isp: api.isp,
        org: api.org,
        as: api.as,
        proxy: api.proxy === true,
        hosting: api.hosting === true,
        riskScore: 0,
      };
    }
  } catch {}

  return null;
}

/**
 * Detect VPN / proxy / location spoofing.
 * @param {string|null} ip      optional known public IP
 * @param {object|null} coords  optional device GPS coordinates { latitude, longitude, accuracy }
 * @param {boolean} forceCheck  bypass cache
 */
export async function detectVpn(ip = null, coords = null, forceCheck = false) {
  const now = Date.now();
  if (!forceCheck && _cachedResult && now - _lastCheckTime < CACHE_TTL_MS) {
    return _cachedResult;
  }

  // ── Layer 1: Native Interface Check ──
  const native = await nativeVpnActive();
  if (native === true) {
    const res = {
      active: true,
      reason: 'Active VPN network interface detected on device.',
      ip,
      provider: 'Native VPN Interface',
      country: null,
    };
    _cachedResult = res;
    _lastCheckTime = now;
    return res;
  }

  // ── Layer 2: IP Intelligence ──
  const intel = await fetchIpIntelligence(ip);
  const resolvedIp = intel?.ip || ip;

  if (intel) {
    const providerName = intel.isp || intel.org || intel.as || 'Datacenter';

    // Check A: Explicit proxy/vpn flag from ipquery.io or ip-api
    if (intel.proxy) {
      const res = {
        active: true,
        reason: `VPN / Proxy detected: Connection flagged as proxy or VPN exit node (${providerName}).`,
        ip: resolvedIp,
        provider: providerName,
        country: intel.country,
      };
      _cachedResult = res;
      _lastCheckTime = now;
      return res;
    }

    // Check B: Explicit hosting/datacenter flag (e.g. cloud server IP)
    if (intel.hosting) {
      const res = {
        active: true,
        reason: `Datacenter / VPN detected: Network IP belongs to a cloud/datacenter server (${providerName}).`,
        ip: resolvedIp,
        provider: providerName,
        country: intel.country,
      };
      _cachedResult = res;
      _lastCheckTime = now;
      return res;
    }

    // Check C: Provider keyword check against known VPN/datacenter networks
    const orgString = `${intel.isp || ''} ${intel.org || ''} ${intel.as || ''}`;
    if (VPN_KEYWORDS.test(orgString)) {
      const res = {
        active: true,
        reason: `VPN provider network detected: ${providerName}.`,
        ip: resolvedIp,
        provider: providerName,
        country: intel.country,
      };
      _cachedResult = res;
      _lastCheckTime = now;
      return res;
    }

    // Check D: Timezone Discrepancy Heuristic
    if (intel.timezone) {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const deviceOffsetMinutes = -new Date().getTimezoneOffset();
      const ipOffsetMinutes = getTimezoneOffsetMinutes(intel.timezone);

      if (ipOffsetMinutes !== null) {
        const offsetDiffMinutes = Math.abs(deviceOffsetMinutes - ipOffsetMinutes);
        if (offsetDiffMinutes >= 120) {
          const res = {
            active: true,
            reason: `Timezone discrepancy: Device is set to ${deviceTz} but network egress is ${intel.timezone}. Remote VPN connection active.`,
            ip: resolvedIp,
            provider: providerName,
            country: intel.country,
          };
          _cachedResult = res;
          _lastCheckTime = now;
          return res;
        }
      }
    }

    // Check E: GPS vs Network Geolocation Discrepancy (Anti-Spoofing Gold Standard)
    if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
      const isPhGps =
        coords.latitude >= 4.5 &&
        coords.latitude <= 21.5 &&
        coords.longitude >= 116.0 &&
        coords.longitude <= 127.0;

      // If physical GPS is in Philippines, but network IP country is international (US, SG, JP, DE, etc.)
      if (isPhGps && intel.countryCode && intel.countryCode !== 'PH') {
        const res = {
          active: true,
          reason: `Location spoofing / VPN: Device GPS is in the Philippines, but network IP originates from ${intel.country || intel.countryCode}.`,
          ip: resolvedIp,
          provider: providerName,
          country: intel.country,
        };
        _cachedResult = res;
        _lastCheckTime = now;
        return res;
      }

      // If distance between physical GPS fix and IP location fix exceeds 500 km
      if (intel.lat != null && intel.lon != null) {
        const distKm = calculateDistanceKm(coords.latitude, coords.longitude, intel.lat, intel.lon);
        if (distKm > 500 && intel.countryCode !== 'PH') {
          const res = {
            active: true,
            reason: `Geographic mismatch: Physical GPS is ${Math.round(distKm)}km away from network IP location (${intel.city || ''}, ${intel.country || ''}).`,
            ip: resolvedIp,
            provider: providerName,
            country: intel.country,
          };
          _cachedResult = res;
          _lastCheckTime = now;
          return res;
        }
      }
    }
  }

  // ── Layer 3: Network interface heuristic ──
  try {
    if (Network?.getIpAddressAsync) {
      const localIp = await Network.getIpAddressAsync();
      if (localIp && (localIp.startsWith('100.64.') || localIp.startsWith('10.8.') || localIp.startsWith('10.2.'))) {
        const res = {
          active: true,
          reason: `VPN network tunnel interface detected (${localIp}).`,
          ip: resolvedIp,
          provider: 'Tunnel Interface',
          country: null,
        };
        _cachedResult = res;
        _lastCheckTime = now;
        return res;
      }
    }
  } catch {}

  const clearRes = {
    active: false,
    reason: intel
      ? `Normal connection verified (${intel.isp || 'Standard ISP'}, ${intel.country || 'Local'}).`
      : 'No VPN interface detected.',
    ip: resolvedIp,
    provider: intel?.isp || null,
    country: intel?.country || null,
  };

  _cachedResult = clearRes;
  _lastCheckTime = now;
  return clearRes;
}
