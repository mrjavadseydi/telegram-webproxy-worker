import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { CtrStream, capability, checkToken, clientHandshake, dcHandshake, fromHex, mintToken } from './src/crypto.js';

// Vectors from tproxy-server PROTOCOL.md
assert.equal(await capability('proxy.example.com', fromHex('000102030405060708090a0b0c0d0e0f')),
  'MHLEY5PmW1GWqJkSrlmJpvJUiLhBH_QKy6yKg8a0JPk');
assert.equal(await capability('proxy.example.com', fromHex('dd000102030405060708090a0b0c0d0e0f')),
  'IpJrt3e7sKtzPyoXy6w-Zj6GGEvsvclN66JzQEfPYLA');

// Tokens: valid, wrong kind, wrong key, expired, tampered
const key = new Uint8Array(32).fill(7);
const tok = await mintToken(key, 1, 60);
assert.equal(tok.length, 43);
assert.ok(await checkToken(key, 1, tok));
assert.ok(!(await checkToken(key, 2, tok)));
assert.ok(!(await checkToken(new Uint8Array(32), 1, tok)));
assert.ok(!(await checkToken(key, 1, tok, Date.now() + 61_000)));
assert.ok(!(await checkToken(key, 1, tok.slice(0, 20) + (tok[20] === 'A' ? 'B' : 'A') + tok.slice(21))));
assert.ok(!(await checkToken(key, 1, undefined)));

// CtrStream == node aes-256-ctr across random chunk splits, including 128-bit counter wrap
for (const iv of [randomBytes(16), Buffer.alloc(16, 0xff)]) {
  const k = randomBytes(32), data = randomBytes(5000);
  const expect = createCipheriv('aes-256-ctr', k, iv).update(data);
  const s = await CtrStream.create(k, iv), parts = [];
  for (let off = 0; off < data.length;) {
    const n = 1 + Math.floor(Math.random() * 100);
    parts.push(s.update(data.subarray(off, off + n))); // overlapping promises must still be correct
    off += n;
  }
  assert.deepEqual(Buffer.concat(await Promise.all(parts)), expect);
}

// obfuscated2 round trip: app -> proxy (with secret) -> DC (without), and back
const secret = randomBytes(16), sha = (...b) => createHash('sha256').update(Buffer.concat(b)).digest();
const h = randomBytes(64);
h.fill(0xdd, 56, 60);
h.writeInt16LE(-4, 60);
const rev = Buffer.from(h.subarray(8, 56)).reverse();
const appEnc = createCipheriv('aes-256-ctr', sha(h.subarray(8, 40), secret), h.subarray(40, 56));
const appDec = createCipheriv('aes-256-ctr', sha(rev.subarray(0, 32), secret), rev.subarray(32, 48));
const sent = Buffer.concat([h.subarray(0, 56), appEnc.update(h).subarray(56)]);
const c = await clientHandshake(sent, secret);
assert.equal(c.dc, -4);
assert.deepEqual([...c.tag], [0xdd, 0xdd, 0xdd, 0xdd]);

const d = await dcHandshake(c.tag);
const up = randomBytes(300);
const wire = Buffer.concat([d.header, await d.encrypt.update(await c.decrypt.update(appEnc.update(up)))]);
const dcDec = createCipheriv('aes-256-ctr', wire.subarray(8, 40), wire.subarray(40, 56)).update(wire);
assert.deepEqual([...dcDec.subarray(56, 60)], [0xdd, 0xdd, 0xdd, 0xdd]);
assert.deepEqual(dcDec.subarray(64), up);

const drev = Buffer.from(wire.subarray(8, 56)).reverse();
const down = randomBytes(300);
const fromDc = createCipheriv('aes-256-ctr', drev.subarray(0, 32), drev.subarray(32, 48)).update(down);
assert.deepEqual(appDec.update(await c.encrypt.update(await d.decrypt.update(fromDc))), down);

await assert.rejects(clientHandshake(sent, randomBytes(16)));

console.log('ok');
