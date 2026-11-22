import { writeFileSync } from 'node:fs';
const B = 'https://api.dexscreener.com';
const L = { profiles: '/token-profiles/latest/v1', boostsLatest: '/token-boosts/latest/v1', boostsTop: '/token-boosts/top/v1' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(path) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(B + path, { headers: { accept: 'application/json', 'user-agent': 'list-fetcher/1.0' } });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) return j; }
      console.log(path, 'status', r.status);
    } catch (e) { console.log(path, 'error', String(e).slice(0, 80)); }
    await sleep(4000 * (i + 1));
  }
  return null;
}
const out = { at: Date.now() };
for (const [k, p] of Object.entries(L)) { out[k] = await get(p); await sleep(1500); }
if (!out.profiles || !out.boostsLatest || !out.boostsTop) { console.log('Not all lists worked, keeping the previous file'); process.exit(1); }
writeFileSync('dx-lists.json', JSON.stringify(out));
console.log('saved', out.profiles.length, out.boostsLatest.length, out.boostsTop.length);
