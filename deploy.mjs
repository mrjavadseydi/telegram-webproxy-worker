// npm run deploy: deploy with wrangler, then print the full URL of the proxy details page.
// SECRET='<password>' npm run deploy  also stores SECRET on the Worker, so the printed URL is complete.
import { spawnSync } from 'node:child_process';
import { parseSecret } from './src/crypto.js';

const secret = process.env.SECRET ? await parseSecret(process.env.SECRET) : null; // validate before deploying

const wrangler = (args, input) => {
  const r = spawnSync('npx', ['wrangler', ...args], { input, encoding: 'utf8', stdio: [input ? 'pipe' : 'inherit', 'pipe', 'inherit'] });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r.stdout;
};

const out = wrangler(['deploy', ...process.argv.slice(2)]);
if (secret) wrangler(['secret', 'put', 'SECRET'], secret.password);

const host = /^\s*https:\/\/([a-z0-9.-]+)/im.exec(out)?.[1];
if (!host) {
  console.log('\nDeployed, but no Worker URL was found in the output above. Your proxy page is https://<worker-host>/<SECRET>');
  process.exit(0);
}
const query = secret && `server=${encodeURIComponent(host)}&secret=${secret.hex}`;
const lines = secret
  ? ['Your proxy details page:', `https://${host}/${encodeURIComponent(secret.password)}`, '', 'Telegram link:', `https://t.me/webproxy?${query}`]
  : ['Your proxy details page:', `https://${host}/<your SECRET>`, '', 'No SECRET set yet? Run:  npx wrangler secret put SECRET'];
const width = Math.max(...lines.map((l) => l.length));
const bar = '═'.repeat(width + 2);
const hl = (s) => (process.stdout.isTTY ? `\x1b[1;32m${s}\x1b[0m` : s);
console.log(`\n╔${bar}╗\n${lines.map((l) => `║ ${hl(l.padEnd(width))} ║`).join('\n')}\n╚${bar}╝\nKeep this URL private: anyone with it can use your proxy.`);
