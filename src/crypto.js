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
