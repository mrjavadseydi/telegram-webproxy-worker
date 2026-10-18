// End-to-end probe: node smoke.mjs <base-url> <secret-hex> [dc]
// Walks bridge -> session -> lane WebSocket -> Telegram DC and expects resPQ for req_pq_multi.
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { capability, fromHex } from './src/crypto.js';

const [base, secretHex, dc = '2'] = process.argv.slice(2);
if (!base || !secretHex) throw new Error('usage: node smoke.mjs <base-url> <secret-hex> [dc]');
const url = new URL(base), raw = fromHex(secretHex.toLowerCase()), secret = raw.subarray(raw.length - 16);

const page = await (await fetch(`${url.origin}/?bridge=${await capability(url.hostname, raw)}`)).text();
const boot = /const boot="([^"]+)"/.exec(page)?.[1];
if (!boot) throw new Error('bridge page not served (wrong host/secret?)');

const hello = Uint8Array.of(0x10, 0, 0, 0, 0, 0, 0, 1, 1);
const res = await fetch(`${url.origin}/api/v1/session`, {
  method: 'POST', body: hello, headers: { Authorization: `Bearer ${boot}`, 'Content-Type': 'application/octet-stream' },
});
const session = res.headers.get('X-Session-Token');
if (res.status !== 200 || !session) throw new Error(`session failed: ${res.status}`);

// App-side obfuscated2 (abridged transport) + unencrypted req_pq_multi
const sha = (...b) => createHash('sha256').update(Buffer.concat(b)).digest();
let h;
do h = randomBytes(64); while (h[0] === 0xef);
h.fill(0xef, 56, 60);
h.writeInt16LE(+dc, 60);
const rev = Buffer.from(h.subarray(8, 56)).reverse();
const enc = createCipheriv('aes-256-ctr', sha(h.subarray(8, 40), secret), h.subarray(40, 56));
const dec = createCipheriv('aes-256-ctr', sha(rev.subarray(0, 32), secret), rev.subarray(32, 48));
const header = Buffer.concat([h.subarray(0, 56), enc.update(h).subarray(56)]);

const msg = Buffer.alloc(40);
msg.writeBigUInt64LE(BigInt(Math.floor(Date.now() / 1000)) << 32n, 8);
msg.writeUInt32LE(20, 16);
msg.writeUInt32LE(0xbe7e8ef1, 20); // req_pq_multi
randomBytes(16).copy(msg, 24);
const payload = Buffer.concat([header, enc.update(Buffer.concat([Buffer.of(msg.length / 4), msg]))]);

const frame = (type, id, p = Buffer.alloc(0)) => {
  const f = Buffer.alloc(8 + p.length);
  f.writeUInt32BE(((type << 24) | id) >>> 0, 0);
  f.writeUInt32BE(p.length, 4);
  p.copy(f, 8);
  return f;
};

const ws = new WebSocket(`${url.origin.replace(/^http/, 'ws')}/api/v1/ws`, `tproxy-lane-v1.${session}.1`);
ws.binaryType = 'arraybuffer';
const timer = setTimeout(() => { console.error('timeout'); process.exit(1); }, 15000);
ws.onopen = () => ws.send(Buffer.concat([frame(1, 1), frame(2, 1, payload)]));
ws.onerror = (e) => { console.error('websocket error', e.message || ''); process.exit(1); };
ws.onclose = (e) => { console.error('lane closed', e.code); process.exit(1); };
let got = Buffer.alloc(0);
ws.onmessage = ({ data }) => {
  for (let b = Buffer.from(data); b.length; b = b.subarray(8 + b.readUInt32BE(4))) {
    if (b[0] === 3) { console.error('relay sent CLOSE'); process.exit(1); }
    if (b[0] === 2) got = Buffer.concat([got, dec.update(b.subarray(8, 8 + b.readUInt32BE(4)))]);
  }
  if (got.length >= 25) {
    const ok = got.readUInt32LE(1 + 20) === 0x05162463; // resPQ
    console.log(ok ? 'resPQ OK' : `unexpected reply ${got.subarray(0, 32).toString('hex')}`);
    clearTimeout(timer);
    ws.onclose = null;
    ws.close();
    process.exit(ok ? 0 : 1);
  }
};
