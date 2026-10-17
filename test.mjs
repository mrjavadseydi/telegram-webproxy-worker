import assert from 'node:assert/strict';
import { capability, checkToken, fromHex, mintToken } from './src/crypto.js';

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

console.log('ok');
