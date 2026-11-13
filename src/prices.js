// Prices: Steam store (always) + IsThereAnyDeal (Steam and Epic in BRL, history low) when ITAD_API_KEY is set.

import { getSteamDetails } from '../lib/steam.js';

const ITAD = 'https://api.isthereanydeal.com';
const SHOPS = { 61: 'steam', 16: 'epic' };
const COUNTRY = 'BR';

export async function itadFetch(env, path, init = {}) {
  const res = await fetch(`${ITAD}${path}`, {
    ...init,
    headers: {
      'ITAD-API-Key': env.ITAD_API_KEY,
      'User-Agent': 'dogworks-games/1.0',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`IsThereAnyDeal respondeu ${res.status}`);
  return res.json();
}

const money = (p) => (p ? { amount: p.amount, currency: p.currency } : null);

async function itadPrices(env, { appid, title }) {
  const lookup = appid
    ? await itadFetch(env, `/games/lookup/v1?appid=${encodeURIComponent(appid)}`)
    : await itadFetch(env, `/games/lookup/v1?title=${encodeURIComponent(title)}`);
  if (!lookup.found) return null;

  const [entry] = await itadFetch(env, `/games/prices/v3?country=${COUNTRY}&shops=61,16`, {
    method: 'POST',
    body: JSON.stringify([lookup.game.id]),
  });
  const deals = {};
  for (const d of entry?.deals || []) {
    const store = SHOPS[d.shop.id];
    if (!store) continue;
    deals[store] = {
      price: money(d.price),
      regular: money(d.regular),
      discount: d.cut || 0,
      storeLow: money(d.storeLow),
      url: d.url,
    };
  }
  return {
    itadUrl: `https://isthereanydeal.com/game/${lookup.game.slug}/info/`,
    historyLow: money(entry?.historyLow?.all),
    deals,
  };
}

export async function getPrices(env, { appid, title }) {
  const out = { country: COUNTRY, itad: !!env.ITAD_API_KEY, steam: null, epic: null, historyLow: null, itadUrl: null };

  const [steam, itad] = await Promise.all([
    appid ? getSteamDetails(appid).catch(() => null) : null,
    env.ITAD_API_KEY && (appid || title) ? itadPrices(env, { appid, title }).catch(() => null) : null,
  ]);

  if (steam) {
    out.steam = steam.isFree
      ? { free: true }
      : steam.price
        ? {
            price: { amount: steam.price.final, currency: steam.price.currency },
            regular: { amount: steam.price.initial, currency: steam.price.currency },
            discount: steam.price.discount,
          }
        : { unavailable: true };
  }

  if (itad) {
    out.historyLow = itad.historyLow;
    out.itadUrl = itad.itadUrl;
    if (itad.deals.epic) out.epic = itad.deals.epic;
    if (itad.deals.steam) {
      out.steam = { ...(out.steam?.price ? out.steam : itad.deals.steam), storeLow: itad.deals.steam.storeLow };
    }
  }
  return out;
}
