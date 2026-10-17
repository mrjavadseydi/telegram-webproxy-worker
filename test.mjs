import assert from 'node:assert/strict';
import { capability, fromHex } from './src/crypto.js';

// Vectors from tproxy-server PROTOCOL.md
assert.equal(await capability('proxy.example.com', fromHex('000102030405060708090a0b0c0d0e0f')),
  'MHLEY5PmW1GWqJkSrlmJpvJUiLhBH_QKy6yKg8a0JPk');
assert.equal(await capability('proxy.example.com', fromHex('dd000102030405060708090a0b0c0d0e0f')),
  'IpJrt3e7sKtzPyoXy6w-Zj6GGEvsvclN66JzQEfPYLA');

console.log('ok');
