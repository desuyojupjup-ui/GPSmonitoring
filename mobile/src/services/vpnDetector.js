// ──────────────────────────────────────────────────────────────────────────
// VPN / proxy detection.
//   Primary:  react-native-vpn-detector (native, dev build) — reads the OS
//             network interfaces for tun/ppp/utun adapters.
//   Fallback: IP-geolocation hosting/proxy flag via a public API.
// Returns { active: boolean, reason: string, ip: string|null }.
// ──────────────────────────────────────────────────────────────────────────

// Static require — Metro bundler does NOT support dynamic require(variableName).
let RNVPNDetector = null;
try {
  const mod = require('react-native-vpn-detector');
  RNVPNDetector = mod?.default || mod;
} catch { /* not available outside dev build */ }

async function nativeVpnActive() {
  const mod = RNVPNDetector;
  try {
    if (mod?.isVpnActive) {
      // Some versions export sync, some async — normalize.
      const v = mod.isVpnActive();
      return await Promise.resolve(v);
    }
    if (mod?.default?.isVpnActive) {
      return await Promise.resolve(mod.default.isVpnActive());
    }
  } catch {
    /* ignore */
  }
  return null; // unknown
}

// Heuristic: many IP intelligence endpoints flag proxy/hosting/VPN ranges.
async function ipHeuristic(ip) {
  if (!ip) return null;
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!res.ok) return null;
    const j = await res.json();
    // Datacenter/hosting orgs are a strong proxy/VPN signal for a "field employee".
    const org = `${j.org || ''} ${j.asn || ''}`.toLowerCase();
    const flagged = /(vpn|proxy|hosting|datacenter|cloud|ovh|digitalocean|amazon|google llc|microsoft|m247|nordvpn|expressvpn)/.test(org);
    return flagged;
  } catch {
    return null;
  }
}

/**
 * @param {string|null} ip  public IP already resolved by the caller (optional)
 */
export async function detectVpn(ip = null) {
  const native = await nativeVpnActive();
  if (native === true) {
    return { active: true, reason: 'Active VPN network interface detected on the device.', ip };
  }

  const heuristic = await ipHeuristic(ip);
  if (heuristic === true) {
    return {
      active: true,
      reason: 'Your connection routes through a VPN, proxy, or datacenter network.',
      ip,
    };
  }

  if (native === false) {
    return { active: false, reason: 'No VPN interface detected.', ip };
  }
  // Could not determine natively and heuristic inconclusive → treat as clear but note it.
  return { active: false, reason: 'VPN status could not be fully verified.', ip };
}
