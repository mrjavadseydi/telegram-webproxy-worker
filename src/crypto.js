const enc = new TextEncoder();

export const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const fromHex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));

// SECRET is 32 hex chars, optionally prefixed with "dd" (padded-intermediate mode).
export function parseSecret(text) {
  const s = (text || '').trim().toLowerCase();
  if (!/^(dd)?[0-9a-f]{32}$/.test(s)) throw new Error('SECRET must be 32 hex chars, optionally dd-prefixed');
  const raw = fromHex(s);
  return { raw, key: raw.slice(raw.length - 16) }; // raw feeds the capability, key feeds obfuscated2
}

export async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

export const capability = async (host, secretRaw) =>
  b64url(await hmac(secretRaw, enc.encode('tdesktop-web-proxy-bridge-v1\n' + host)));

export const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// Stateless token: expiry (u64 BE unix seconds) || HMAC(key, kind || expiry)[0:24], base64url (43 chars).
// ponytail: not one-shot; replay inside the TTL only re-mints access for the same secret holder.
const tokenMac = async (key, kind, expiry) =>
  (await hmac(key, Uint8Array.of(kind, ...expiry))).subarray(0, 24);

export async function mintToken(key, kind, ttl, now = Date.now()) {
  const t = new Uint8Array(32);
  new DataView(t.buffer).setBigUint64(0, BigInt(Math.floor(now / 1000) + ttl));
  t.set(await tokenMac(key, kind, t.subarray(0, 8)), 8);
  return b64url(t);
}

export async function checkToken(key, kind, token, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return false;
  const t = fromB64url(token);
  if (Number(new DataView(t.buffer).getBigUint64(0)) * 1000 < now) return false;
  const mac = await tokenMac(key, kind, t.subarray(0, 8));
  let diff = 0;
  for (let i = 0; i < 24; i++) diff |= mac[i] ^ t[8 + i];
  return diff === 0;
}
