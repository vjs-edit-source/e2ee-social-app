/**
 * Central Engine Connection Manager for CipherSocial
 * Ensures seamless full-stack communication between Android App (Capacitor) & Central Node.js Server
 */

const STORAGE_KEY = 'ciphersocial_engine_url';
export const DEFAULT_PRODUCTION_CLOUD_URL = 'https://e2ee-social-app-production.up.railway.app';
export const DEFAULT_USB_ENGINE_URL = 'http://localhost:4000';
export const DEFAULT_LAN_ENGINE_URL = 'http://192.168.31.232:4000';

export function isCapacitorNative() {
  return typeof window !== 'undefined' && Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/**
 * Returns the currently active HTTP/HTTPS Server Engine URL
 */
export function getEngineUrl() {
  if (typeof window === 'undefined') return DEFAULT_USB_ENGINE_URL;

  // 1. User-customized URL from Settings
  const savedUrl = localStorage.getItem(STORAGE_KEY);
  if (savedUrl && savedUrl.trim()) {
    const clean = savedUrl.trim().replace(/\/+$/, '');
    if (clean.includes('sadisocial-engine.onrender.com')) {
      localStorage.setItem(STORAGE_KEY, DEFAULT_PRODUCTION_CLOUD_URL);
      return DEFAULT_PRODUCTION_CLOUD_URL;
    }
    return clean;
  }

  // 2. Build-time environment variable (e.g. Vercel, Netlify, Cloudflare Pages)
  const envUrl = import.meta.env?.VITE_ENGINE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 3. Native Android / iOS (Capacitor)
  // Default to live Production Cloud Engine so all mobile users connect out of the box
  if (isCapacitorNative()) {
    return DEFAULT_PRODUCTION_CLOUD_URL;
  }

  // 4. Web Browser on LAN
  const hostname = window.location.hostname;
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `${window.location.protocol}//${hostname}:4000`;
  }

  // 5. Default / Localhost Web
  return '';
}

/**
 * Returns the corresponding WebSocket URL for real-time E2EE messaging
 */
export function getEngineWsUrl() {
  const httpUrl = getEngineUrl();

  if (!httpUrl) {
    // Relative in local dev
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' && window.location.host ? window.location.host : 'localhost:5000';
    return `${protocol}//${host}/ws`;
  }

  try {
    const parsed = new URL(httpUrl);
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${parsed.host}`;
  } catch (e) {
    return `ws://192.168.31.232:4000`;
  }
}

/**
 * Save a new Engine URL
 */
export function setEngineUrl(url) {
  if (typeof window === 'undefined') return;
  if (!url || !url.trim()) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/+$/, ''));
  }
}

/**
 * Test ping and latency against the target engine
 */
export async function testEngineHealth(url) {
  const target = (url || getEngineUrl()).replace(/\/+$/, '');
  const testUrl = target ? `${target}/api/health` : '/api/health';
  const startTime = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let res;
    try {
      res = await fetch(testUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
    } catch (fetchErr) {
      // Fallback to /health or /api/users
      const fallbackUrl = target ? `${target}/health` : '/health';
      res = await fetch(fallbackUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
    }
    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - startTime);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        online: true,
        latencyMs,
        usersCount: Array.isArray(data) ? data.length : undefined,
        statusText: `Online (${latencyMs}ms)`
      };
    } else {
      return {
        online: false,
        latencyMs,
        error: `Engine responded with status ${res.status}`,
        statusText: `HTTP Error ${res.status}`
      };
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      online: false,
      latencyMs,
      error: err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Cannot reach engine'),
      statusText: 'Offline / Unreachable'
    };
  }
}
