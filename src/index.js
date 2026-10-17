import { b64url, capability, checkToken, hmac, mintToken, parseSecret } from './crypto.js';
import { bridgeHeaders, bridgeHtml } from './bridge.js';

const BOOTSTRAP = 1, SESSION = 2;
const HELLO = Uint8Array.of(0x10, 0, 0, 0, 0, 0, 0, 1, 1);
const WELCOME = Uint8Array.of(0x11, 0, 0, 0, 0, 0, 0, 0);

const DECOY = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#222">
<h1>Welcome</h1><p>This site is under construction. Please check back later.</p>
</body></html>`;

const decoy = () => new Response(DECOY, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const notFound = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
const isHello = (b) => b.length === HELLO.length && b.every((x, i) => x === HELLO[i]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = parseSecret(env.SECRET);
    const host = url.hostname;
    const key = await hmac(secret.raw, new TextEncoder().encode('tproxy-worker-token-key'));

    if (request.method === 'GET' && url.pathname === '/' && url.search === '?bridge=' + (await capability(host, secret.raw))) {
      const nonce = b64url(crypto.getRandomValues(new Uint8Array(18)));
      const boot = await mintToken(key, BOOTSTRAP, 120);
      return new Response(bridgeHtml(nonce, boot), { headers: bridgeHeaders(nonce, host) });
    }

    if (url.pathname === '/api/v1/session') {
      const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '')?.[1];
      if (request.method === 'POST' && (await checkToken(key, BOOTSTRAP, token))) {
        if (!isHello(new Uint8Array(await request.arrayBuffer()))) return notFound();
        return new Response(WELCOME, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Session-Token': await mintToken(key, SESSION, 86400),
            'X-Down-Cursor': '0',
            'X-Carrier-Mode': 'websocket-lanes',
          },
        });
      }
      if (request.method === 'DELETE' && (await checkToken(key, SESSION, token))) return new Response(null, { status: 204 });
    }
    return decoy();
  },
};
