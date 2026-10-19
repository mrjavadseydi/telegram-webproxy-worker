# Telegram WEB Proxy for Cloudflare Workers

**English** | [فارسی](README.fa.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mrjavadseydi/telegram-webproxy-worker)

⭐ **If you like this project, please [give it a star](https://github.com/mrjavadseydi/telegram-webproxy-worker) to support me.**

A server for Telegram's new **WEB proxy** type
([`telegramdesktop/tproxy-server`](https://github.com/telegramdesktop/tproxy-server), protocol v1),
running entirely on a Cloudflare Worker. You don't need a VPS or an MTProxy binary.

> [!CAUTION]
> **DISCLAIMER — READ BEFORE USING**
>
> - **This project is published strictly for educational and research purposes only.**
> - **The author does not encourage, endorse, or support any illegal, unauthorized, or abusive use of this project.**
> - **You must not use this project to violate any law, regulation, court order, or terms of service (including those of Cloudflare and Telegram) in your country or any other jurisdiction.**
> - **You alone are fully and solely responsible for how you use this project and for any consequences of that use, including compliance with all applicable laws.**
> - **This software is provided "AS IS", without warranty of any kind, express or implied. The author makes no guarantee about its security, reliability, legality, or fitness for any purpose.**
> - **To the maximum extent permitted by law, the author is not liable for any claim, damage, loss, penalty, or legal consequence arising from the use, misuse, deployment, modification, or distribution of this project, whether by you or by anyone else.**
> - **By using, deploying, copying, or modifying this project, you agree to these terms and agree to hold the author harmless and indemnify the author against any claim arising from your use.**
> - **This project is not affiliated with, endorsed by, or sponsored by Telegram or Cloudflare. All trademarks belong to their respective owners.**
>
> **If you do not agree with these terms, do not use this project.**

```text
Telegram app ──MTProxy (obfuscated2)──> hidden WebView ──wss──> Worker ──TCP──> Telegram DC
```

- `GET /?bridge=<capability>` serves the bridge page. The capability is derived from the hostname
  and the secret. Any other request gets a plain placeholder website.
- The carrier is `websocket-lanes`: one WebSocket per Telegram TCP connection. Each lane runs as
  its own Worker invocation with one outbound socket.
- The Worker acts as the MTProxy itself. It decrypts the app's obfuscated2 stream with the
  secret, re-obfuscates it, and connects straight to the Telegram DC (no middle proxy).
- It is stateless: bootstrap and session tokens are HMAC-signed, so it needs no KV and no Durable
  Objects.

## Deploy

**Easiest — paste one file (no GitHub, no fork, only a browser):**

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Create Worker**, keep the "Hello World" code and press **Deploy**.
2. Press **Edit code**, delete everything, paste the whole content of [`worker.js`](https://raw.githubusercontent.com/mrjavadseydi/telegram-webproxy-worker/main/worker.js), and press **Deploy**.
3. Go to the Worker's **Settings → Variables and Secrets → Add**: type **Secret**, name `SECRET`, value any password of 8+ characters. Save and deploy.
4. Open `https://<your-worker>.<your-subdomain>.workers.dev/<your-password>` to get your proxy link.

To update later, paste the new `worker.js` again. Your `SECRET` stays.

**One click (makes a copy of this repo in your GitHub):** press the button above. Cloudflare copies the repo into your GitHub account,
asks for `SECRET` (**any password of 8+ characters**), and deploys. Then open
`https://<your-worker-host>/<your-password>` to get your proxy link.

`SECRET` can be a password (the Worker turns it into the MTProxy secret with SHA-256) or a raw
32-hex MTProxy secret, for example from `openssl rand -hex 16`.

**With the CLI:**

```bash
npm install
SECRET='your password' npm run deploy   # deploys, stores SECRET, prints your full proxy page URL
```

The end of the output shows the full URL of your proxy details page and the Telegram link in a
highlighted box. Without `SECRET=…` it deploys and prints `https://<your-worker>/<your SECRET>`.

After editing `src/`, run `npm run bundle` to regenerate `worker.js`.

Add a **custom domain** to the Worker (Workers → Settings → Domains & Routes), for example
`proxy.example.com`. `*.workers.dev` also works, but it is blocked in some networks. The
hostname must be dedicated to this Worker, because base paths are not supported.

## Connect a client

You need a Telegram client with WEB proxy support (Telegram Desktop 7.2+). Add a proxy of
type WEB:

```text
Server: proxy.example.com
Secret: 8561944064fc730cbfa4473562d8ec59
```

Or share the link:

```text
https://t.me/webproxy?server=proxy.example.com&secret=8561944064fc730cbfa4473562d8ec59
```

The Worker also serves this at `https://proxy.example.com/<SECRET>` (your password or hex): server, secret, the
`t.me` and `tg://` links with copy buttons, and an "Open in Telegram" button. Every other path
shows the placeholder site, so only someone who already has the secret can find the page.

## Check it

```bash
npm test                                                    # crypto / token / capability self-check
echo 'SECRET=8561944064fc730cbfa4473562d8ec59' > .dev.vars
npm run dev                                                 # local worker on :8787
node smoke.mjs http://localhost:8787 8561944064fc730cbfa4473562d8ec59      # -> resPQ OK
node smoke.mjs https://proxy.example.com 8561944064fc730cbfa4473562d8ec59  # deployed
```

`smoke.mjs` loads the bridge, creates a session, opens a lane, and sends `req_pq_multi`
to a DC through the Worker. It passes if Telegram answers with `resPQ`. An optional third
argument picks the DC (default `2`).

## Limits

- **CPU:** the Free plan nominally allows 10 ms of CPU per invocation. In testing, messages,
  photos and video worked anyway, but if `wrangler tail` shows `Exceeded CPU`, switch to the Paid
  plan and uncomment `[limits] cpu_ms` in `wrangler.toml`.
- Only the `websocket-lanes` carrier is supported. `https`, `https-lanes` and `websocket` would
  need shared session state (Durable Objects).
- The bootstrap token is not single-use. It can be replayed only within its 2-minute lifetime,
  and only by someone who already loaded the bridge.
- Secrets can be plain or `dd` (padded). `ee` (fake-TLS) secrets are not supported.
- The protocol is a Telegram proof of concept and may change.
