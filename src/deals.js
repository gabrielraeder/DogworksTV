// Current sales for the whole list (one IsThereAnyDeal round trip for many games), and the
// image for games that are not on Steam. Both need ITAD_API_KEY; without it they return nothing.

import { itadFetch } from './prices.js';
import { HttpError, json } from './http.js';

const SHOPS = { 61: 'steam', 16: 'epic' };
const BATCH = 200; // ITAD accepts up to 200 ids per prices request
const DEALS_TTL = 3600; // seconds
const KEY_RE = /^(steam:\d{1,10}|name:[a-z0-9]{1,120})$/;

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// key -> ITAD game id, looking up Steam appids and titles in batches.
async function lookupIds(env, games) {
  const ids = new Map();
  const bySteam = games.filter((g) => g.appid);
  const byTitle = games.filter((g) => !g.appid && g.title);
  for (const part of chunk(bySteam, BATCH)) {
    const found = await itadFetch(env, '/lookup/id/shop/61/v1', {
      method: 'POST',
      body: JSON.stringify(part.map((g) => `app/${g.appid}`)),
    });
    for (const g of part) if (found[`app/${g.appid}`]) ids.set(g.key, found[`app/${g.appid}`]);
  }
  for (const part of chunk(byTitle, BATCH)) {
    const found = await itadFetch(env, '/lookup/id/title/v1', {
      method: 'POST',
      body: JSON.stringify(part.map((g) => g.title)),
    });
    for (const g of part) if (found[g.title]) ids.set(g.key, found[g.title]);
  }
  return ids;
}

const money = (p) => (p ? { amount: p.amount, currency: p.currency } : null);

async function fetchDeals(env, games) {
  const ids = await lookupIds(env, games);
  const keyById = new Map([...ids].map(([key, id]) => [id, key]));
  const deals = {};
  for (const part of chunk([...keyById.keys()], BATCH)) {
    const entries = await itadFetch(env, '/games/prices/v3?country=BR&shops=61,16&deals=true', {
      method: 'POST',
      body: JSON.stringify(part),
    });
    for (const entry of entries) {
      const best = (entry.deals || [])
        .filter((d) => SHOPS[d.shop?.id] && d.cut > 0)
        .sort((a, b) => b.cut - a.cut || a.price.amount - b.price.amount)[0];
      if (!best) continue;
      deals[keyById.get(entry.id)] = {
        cut: best.cut,
        shop: SHOPS[best.shop.id],
        price: money(best.price),
        regular: money(best.regular),
        url: best.url,
        expiry: best.expiry || null,
      };
    }
  }
  return deals;
}

// body: { games: [{ key, appid?, title? }] } -> { itad, deals: { key: { cut, shop, price, regular, url, expiry } } }
// Cached per list of games for an hour (Cache API: works on the custom domain).
export async function getDeals(request, env, ctx, body) {
  if (!env.ITAD_API_KEY) return json({ itad: false, deals: {} });
  const list = Array.isArray(body?.games) ? body.games : null;
  if (!list) throw new HttpError(400, 'Lista inválida');

  const seen = new Set();
  const games = [];
  for (const g of list) {
    if (!g || typeof g.key !== 'string' || !KEY_RE.test(g.key) || seen.has(g.key)) continue;
    seen.add(g.key);
    const appid = /^\d{1,10}$/.test(String(g.appid ?? '')) ? String(g.appid) : null;
    const title = typeof g.title === 'string' ? g.title.trim().slice(0, 120) : '';
    if (appid || title) games.push({ key: g.key, appid, title });
    if (games.length >= 1000) break;
  }
  games.sort((a, b) => a.key.localeCompare(b.key));

  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/api/deals/cache/${await sha256(JSON.stringify(games))}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let deals;
  try {
    deals = await fetchDeals(env, games);
  } catch (e) {
    console.error(e);
    return json({ itad: true, deals: {}, error: 'IsThereAnyDeal indisponível' });
  }
  const res = json({ itad: true, deals }, 200, { 'Cache-Control': `public, max-age=${DEALS_TTL}` });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// Image for a game that is not on Steam (e.g. Epic exclusives), from IsThereAnyDeal.
export async function getItadImage(env, title) {
  if (!env.ITAD_API_KEY) return { image: null };
  const lookup = await itadFetch(env, `/games/lookup/v1?title=${encodeURIComponent(title)}`);
  if (!lookup.found) return { image: null };
  const info = await itadFetch(env, `/games/info/v2?id=${encodeURIComponent(lookup.game.id)}`);
  const a = info.assets || {};
  return { image: a.banner600 || a.banner400 || a.banner300 || null, title: info.title || null };
}
