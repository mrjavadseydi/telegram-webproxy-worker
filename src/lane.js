import { connect } from 'cloudflare:sockets';
import { clientHandshake, dcHandshake } from './crypto.js';

// Direct DC addresses (no middle proxy). Media DCs use abs(dc).
const DCS = { 1: '149.154.175.50', 2: '149.154.167.51', 3: '149.154.175.100', 4: '149.154.167.91', 5: '149.154.171.5', 203: '91.105.192.100' };
const OPEN = 1, DATA = 2, CLOSE = 3, WINDOW = 4;
const CHUNK = 65536, INITIAL_WINDOW = 4 * 1024 * 1024;

const frame = (type, id, payload = new Uint8Array(0)) => {
  const f = new Uint8Array(8 + payload.length), v = new DataView(f.buffer);
  v.setUint32(0, ((type << 24) | id) >>> 0);
  v.setUint32(4, payload.length);
  f.set(payload, 8);
  return f;
};
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const concat = (a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; };

function parse(buf) {
  const v = new DataView(buf), out = [];
  for (let off = 0; off < buf.byteLength;) {
    if (buf.byteLength - off < 8) throw new Error('bad batch');
    const end = off + 8 + v.getUint32(off + 4);
    if (end > buf.byteLength) throw new Error('bad frame');
    out.push({ type: v.getUint8(off), id: v.getUint32(off) & 0xffffff, payload: new Uint8Array(buf, off + 8, end - off - 8) });
    off = end;
  }
  if (!out.length) throw new Error('empty batch');
  return out;
}

// One WebSocket lane = one Telegram TCP stream = one obfuscated2 connection to a DC.
export function openLane(id, secretKey, protocol) {
  const [client, ws] = Object.values(new WebSocketPair());
  ws.accept();
  ws.binaryType = 'arraybuffer'; // newer compat dates deliver Blob by default
  let opened = false, ended = false, head = new Uint8Array(0), credit = INITIAL_WINDOW, wake = null;
  let socket = null, writer = null, c = null, d = null, chain = Promise.resolve();

  const send = (f) => { try { ws.send(f); } catch {} };
  const end = (notify) => {
    if (ended) return;
    ended = true;
    if (notify) send(frame(CLOSE, id));
    try { ws.close(1000); } catch {}
    if (socket) socket.close().catch(() => {});
    if (wake) wake();
  };

  async function pump() {
    const reader = socket.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || ended) break;
        const out = await c.encrypt.update(await d.decrypt.update(value));
        for (let off = 0; off < out.length;) {
          while (!credit && !ended) await new Promise((r) => (wake = r));
          if (ended) return;
          const n = Math.min(CHUNK, credit, out.length - off);
          send(frame(DATA, id, out.subarray(off, off + n)));
          credit -= n;
          off += n;
        }
      }
    } catch {}
    end(true);
  }

  async function data(p) {
    if (!socket) {
      head = concat(head, p);
      if (head.length < 64) return;
      c = await clientHandshake(head.subarray(0, 64), secretKey);
      const hostname = DCS[Math.abs(c.dc)];
      if (!hostname) throw new Error('unknown dc ' + c.dc);
      d = await dcHandshake(c.tag);
      socket = connect({ hostname, port: 443 });
      writer = socket.writable.getWriter();
      socket.closed.catch(() => {});
      await writer.write(concat(d.header, await d.encrypt.update(await c.decrypt.update(head.subarray(64)))));
      pump();
      send(frame(WINDOW, id, u32(head.length)));
      head = null;
      return;
    }
    await writer.write(await d.encrypt.update(await c.decrypt.update(p)));
    send(frame(WINDOW, id, u32(p.length))); // credit back only once the bytes reached the DC socket
  }

  ws.addEventListener('message', ({ data: buf }) => {
    try {
      if (!(buf instanceof ArrayBuffer)) throw new Error('text message');
      for (const f of parse(buf)) {
        if (f.id !== id || (!opened && f.type !== OPEN) || (opened && f.type === OPEN)) throw new Error('bad frame');
        if (f.type === OPEN) opened = true;
        else if (f.type === WINDOW) { credit += new DataView(f.payload.buffer, f.payload.byteOffset).getUint32(0); if (wake) wake(); }
        else if (f.type === CLOSE) end(false);
        else if (f.type === DATA && f.payload.length) { const p = f.payload.slice(); chain = chain.then(() => !ended && data(p)); }
        else throw new Error('bad frame');
      }
      chain = chain.catch(() => end(true));
    } catch { end(true); }
  });
  ws.addEventListener('close', () => end(false));
  ws.addEventListener('error', () => end(false));

  return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': protocol } });
}
