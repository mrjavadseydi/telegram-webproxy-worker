const enc = new TextEncoder();

export const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const fromHex = (s) => Uint8Array.from(s.match(/../g), (b) => parseInt(b, 16));

// SECRET is either an MTProxy secret (32 hex chars, optionally "dd"-prefixed) or any password of
// 8+ characters, which becomes one: the first 16 bytes of SHA-256(password).
export async function parseSecret(text) {
  const password = (text || '').trim();
  let raw;
  if (/^(dd)?[0-9a-f]{32}$/i.test(password)) raw = fromHex(password.toLowerCase());
  else if (password.length >= 8) raw = (await sha256(enc.encode(password))).slice(0, 16);
  else throw new Error('SECRET must be a password of at least 8 characters (or 32 hex chars)');
  const hex = [...raw].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { password, hex, raw, key: raw.slice(raw.length - 16) }; // raw feeds the capability, key feeds obfuscated2
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

const MASK128 = (1n << 128n) - 1n;
const toBig = (b) => b.reduce((n, x) => (n << 8n) | BigInt(x), 0n);
const sha256 = async (...parts) => {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((off, p) => (all.set(p, off), off + p.length), 0);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', all));
};

// Streaming AES-256-CTR on top of one-shot WebCrypto: track the byte position, start each call at
// counter iv + pos/16 and pad the partial first block. Position advances synchronously, so calls
// issued in order stay correct even if their promises overlap.
export class CtrStream {
  static async create(key, iv) {
    return new CtrStream(await crypto.subtle.importKey('raw', key, 'AES-CTR', false, ['encrypt']), toBig(iv));
  }
  constructor(key, iv) { this.key = key; this.iv = iv; this.pos = 0; }
  async update(data) {
    const skip = this.pos % 16;
    let n = (this.iv + BigInt(Math.floor(this.pos / 16))) & MASK128;
    const counter = new Uint8Array(16);
    for (let i = 15; i >= 0; i--, n >>= 8n) counter[i] = Number(n & 0xffn);
    const buf = new Uint8Array(skip + data.length);
    buf.set(data, skip);
    this.pos += data.length;
    return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CTR', counter, length: 128 }, this.key, buf)).subarray(skip);
  }
}

const TAGS = [0xef, 0xee, 0xdd];

// Client side of obfuscated2: keys mixed with the proxy secret. Returns protocol tag and DC id.
export async function clientHandshake(h, secretKey) {
  const rev = Uint8Array.from(h.subarray(8, 56)).reverse();
  const decrypt = await CtrStream.create(await sha256(h.subarray(8, 40), secretKey), h.subarray(40, 56));
  const encrypt = await CtrStream.create(await sha256(rev.subarray(0, 32), secretKey), rev.subarray(32, 48));
  const plain = await decrypt.update(h);
  const tag = plain.slice(56, 60);
  if (!TAGS.includes(tag[0]) || !tag.every((x) => x === tag[0])) throw new Error('bad obfuscated2 header (wrong secret?)');
  const dc = new DataView(plain.buffer, plain.byteOffset).getInt16(60, true);
  return { tag, dc, decrypt, encrypt };
}

// Telegram DC side of obfuscated2: fresh random header, keys without a secret.
const BAD_START = ['HEAD', 'POST', 'GET ', 'OPTI'].map((s) => toBig(new TextEncoder().encode(s)))
  .concat([0x16030102n, 0xddddddddn, 0xeeeeeeeen]);
export async function dcHandshake(tag) {
  let h;
  do h = crypto.getRandomValues(new Uint8Array(64));
  while (h[0] === 0xef || BAD_START.includes(toBig(h.subarray(0, 4))) || toBig(h.subarray(4, 8)) === 0n);
  h.set(tag, 56);
  const rev = Uint8Array.from(h.subarray(8, 56)).reverse();
  const encrypt = await CtrStream.create(h.slice(8, 40), h.slice(40, 56));
  const decrypt = await CtrStream.create(rev.subarray(0, 32), rev.subarray(32, 48));
  h.set((await encrypt.update(h)).subarray(56), 56);
  return { header: h, encrypt, decrypt };
}
