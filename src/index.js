import { capability, parseSecret } from './crypto.js';

const DECOY = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#222">
<h1>Welcome</h1><p>This site is under construction. Please check back later.</p>
</body></html>`;

const decoy = () => new Response(DECOY, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = parseSecret(env.SECRET);
    const host = url.hostname;

    if (request.method === 'GET' && url.pathname === '/' && url.search === '?bridge=' + (await capability(host, secret.raw))) {
      return new Response('bridge', { status: 501 });
    }
    return decoy();
  },
};
