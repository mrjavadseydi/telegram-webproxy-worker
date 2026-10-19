import { b64url, capability, checkToken, hmac, mintToken, parseSecret } from './crypto.js';
import { bridgeHeaders, bridgeHtml } from './bridge.js';
import { openLane } from './lane.js';

const BOOTSTRAP = 1, SESSION = 2;
const HELLO = Uint8Array.of(0x10, 0, 0, 0, 0, 0, 0, 1, 1);
const WELCOME = Uint8Array.of(0x11, 0, 0, 0, 0, 0, 0, 0);

const DECOY = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#222">
<h1>Welcome</h1><p>This site is under construction. Please check back later.</p>
</body></html>`;

// Share page: only reachable at /<SECRET>, so it reveals nothing to anyone who doesn't already hold the secret.
const sharePage = (host, secret) => {
  const query = `server=${encodeURIComponent(host)}&secret=${secret}`;
  const rows = [['Server', host], ['Secret', secret], ['Link', `https://t.me/webproxy?${query}`], ['tg:// link', `tg://webproxy?${query}`]];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>WEB proxy link</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--fg:#1c1f23;--muted:#667085;--line:#e3e6ea;--accent:#2481cc}
@media (prefers-color-scheme:dark){:root{--bg:#14171a;--card:#1d2125;--fg:#e8eaed;--muted:#9aa3ad;--line:#2c3237;--accent:#5eaee8}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:44rem;margin:3rem auto;padding:0 16px}
h1{font-size:1.4rem;margin:0 0 .25rem}p{color:var(--muted);margin:0 0 1.5rem}
.row{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.75rem 1rem;margin-bottom:.75rem}
.label{font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.value{display:flex;gap:.75rem;align-items:center}
code{flex:1;word-break:break-all;font:14px/1.4 ui-monospace,monospace}
button{flex:none;border:1px solid var(--line);background:transparent;color:var(--accent);border-radius:6px;padding:.3rem .7rem;font:inherit;cursor:pointer}
a.open{display:inline-block;margin-top:.5rem;background:var(--accent);color:#fff;text-decoration:none;border-radius:8px;padding:.6rem 1.1rem}
</style></head>
<body><main>
<h1>Telegram WEB proxy</h1>
<p>Needs a client with WEB proxy support (Telegram Desktop 7.2+). Keep this page private: the link contains the secret.</p>
${rows.map(([k, v]) => `<div class="row"><div class="label">${k}</div><div class="value"><code>${v}</code><button type="button">Copy</button></div></div>`).join('\n')}
<a class="open" href="tg://webproxy?${query}">Open in Telegram</a>
</main>
<script>
for (const b of document.querySelectorAll('button')) b.onclick = async () => {
  await navigator.clipboard.writeText(b.previousElementSibling.textContent);
  b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200);
};
</script></body></html>`;
};

const decoy = () => new Response(DECOY, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const notFound = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
const isHello = (b) => b.length === HELLO.length && b.every((x, i) => x === HELLO[i]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let secret;
    try { secret = await parseSecret(env.SECRET); } catch (e) { return new Response(e.message + ' (npx wrangler secret put SECRET)', { status: 500 }); }
    const host = url.hostname;
    const key = await hmac(secret.raw, new TextEncoder().encode('tproxy-worker-token-key'));
    let path = '';
    try { path = decodeURIComponent(url.pathname.slice(1)); } catch {}

    if (request.method === 'GET' && (path === secret.password || path === secret.hex)) {
      return new Response(sharePage(host, secret.hex), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
      });
    }

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

    if (url.pathname === '/api/v1/ws' && request.headers.get('Upgrade') === 'websocket') {
      const protocol = request.headers.get('Sec-WebSocket-Protocol') || '';
      const m = /^tproxy-lane-v1\.([A-Za-z0-9_-]{43})\.([1-9]\d{0,7})$/.exec(protocol);
      if (m && +m[2] <= 0xffffff && (await checkToken(key, SESSION, m[1]))) return openLane(+m[2], secret.key, protocol);
    }
    return decoy();
  },
};
