import { writeFileSync } from 'node:fs';
const B = 'https://api.dexscreener.com';
const L = { profiles: '/token-profiles/latest/v1', boostsLatest: '/token-boosts/latest/v1', boostsTop: '/token-boosts/top/v1' };
const H = { accept: 'application/json', 'user-agent': 'list-fetcher/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(path, wantList) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(B + path, { headers: H });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j) && (j.length || !wantList)) return j; }
      console.log(path.slice(0, 60), 'status', r.status);
    } catch (e) { console.log(path.slice(0, 60), 'error', String(e).slice(0, 80)); }
    await sleep(4000 * (i + 1));
  }
  return null;
}
const out = { at: Date.now() };
for (const [k, p] of Object.entries(L)) { out[k] = await get(p, true); await sleep(1500); }
if (!out.profiles || !out.boostsLatest || !out.boostsTop) { console.log('Not all lists worked, keeping the previous file'); process.exit(1); }

const NETS = new Set(['solana', 'bsc', 'ethereum', 'base', 'arbitrum']);
const seen = new Set(), byNet = {};
for (const x of [...out.boostsTop, ...out.boostsLatest, ...out.profiles]) {
  if (!x || !NETS.has(x.chainId) || typeof x.tokenAddress !== 'string') continue;
  const k = x.chainId + ':' + (x.chainId === 'solana' ? x.tokenAddress : x.tokenAddress.toLowerCase());
  if (seen.has(k) || seen.size >= 240) continue;
  seen.add(k); (byNet[x.chainId] = byNet[x.chainId] || []).push(x.tokenAddress);
}
out.pairs = {};
for (const [net, addrs] of Object.entries(byNet)) {
  for (let i = 0; i < addrs.length; i += 30) {
    const chunk = addrs.slice(i, i + 30), j = await get('/tokens/v1/' + net + '/' + chunk.join(','), false);
    if (Array.isArray(j)) {
      const by = {};
      for (const p of j) { const t = p && p.baseToken && p.baseToken.address; if (!t) continue; const k = net + ':' + (net === 'solana' ? t : t.toLowerCase()); (by[k] = by[k] || []).push(p); }
      for (const a of chunk) { const k = net + ':' + (net === 'solana' ? a : a.toLowerCase()); out.pairs[k] = (by[k] || []).sort((p, q) => ((q.liquidity && q.liquidity.usd) || 0) - ((p.liquidity && p.liquidity.usd) || 0)).slice(0, 3); }
    }
    await sleep(400);
  }
}
const WANTED_URL = process.env.WANTED_URL || 'https://coinlook-api.trillionman29.workers.dev/wanted';
try {
  const w = await (await fetch(WANTED_URL, { headers: H })).json(); let calls = 0;
  for (const [net, list] of Object.entries((w && w.w) || {})) {
    if (!NETS.has(net) || !Array.isArray(list)) continue;
    const todo = list.filter(a => typeof a === 'string' && /^[A-Za-z0-9]{20,64}$/.test(a) && !out.pairs[net + ':' + (net === 'solana' ? a : a.toLowerCase())]).slice(0, 180);
    for (let i = 0; i < todo.length && calls < 24; i += 30, calls++) {
      const chunk = todo.slice(i, i + 30), j = await get('/tokens/v1/' + net + '/' + chunk.join(','), false);
      if (Array.isArray(j)) {
        const best = {};
        for (const p of j) { const t = p && p.baseToken && p.baseToken.address; if (!t) continue; const k = net + ':' + (net === 'solana' ? t : t.toLowerCase()); if (!best[k] || ((p.liquidity && p.liquidity.usd) || 0) > ((best[k].liquidity && best[k].liquidity.usd) || 0)) best[k] = p; }
        for (const k in best) { const p = best[k]; out.pairs[k] = [{ chainId: p.chainId, dexId: p.dexId, pairAddress: p.pairAddress, baseToken: p.baseToken, quoteToken: p.quoteToken, priceUsd: p.priceUsd, priceNative: p.priceNative, txns: p.txns, volume: p.volume, priceChange: p.priceChange, liquidity: p.liquidity, fdv: p.fdv, marketCap: p.marketCap, pairCreatedAt: p.pairCreatedAt, info: p.info && p.info.imageUrl ? { imageUrl: p.info.imageUrl } : undefined }]; }
      }
      await sleep(400);
    }
  }
} catch (e) { console.log('wanted list not read', String(e).slice(0, 80)); }
writeFileSync('dx-lists.json', JSON.stringify(out));
console.log('saved', out.profiles.length, out.boostsLatest.length, out.boostsTop.length, 'tokens with details:', Object.keys(out.pairs).length);
