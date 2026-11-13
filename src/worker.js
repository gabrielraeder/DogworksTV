// Cloudflare Worker: handles /api/*. Everything else is served from public/ (static assets).

import { searchSteam, getSteamDetails } from '../lib/steam.js';
import { HttpError, json, readJsonBody, cached } from './http.js';
import { loginRedirect, handleCallback, handleLogout, deleteAccount, currentUser, requireUser, refreshUser } from './auth.js';
import { serializeMe, manualMarks, setOwnership, ownerCounts, ownersOf, listMembers } from './owners.js';
import { getPrices } from './prices.js';
import { getDeals, getItadImage } from './deals.js';
import { isOwner, assertOwner, getChannel, saveChannelGame, removeChannelGame, restoreChannelGame, listSuggestions } from './channel.js';
import { getLibrary, setFlag, saveGame, removeGame, importLibrary } from './library.js';

const HOUR = 3600;

// POST routes that change one game in the signed-in user's list.
const LIBRARY = {
  '/api/library/flag': setFlag, // { id, flag: 'favorite' | 'hidden', on }
  '/api/library/game': saveGame, // { id, custom, data, favorite?, addedAt? }
  '/api/library/remove': removeGame, // { id }
};

// POST routes, owner only, that change the channel's list (seen by everyone).
const CHANNEL = {
  '/api/channel/game': saveChannelGame, // { id?, added, data } -> { id }
  '/api/channel/remove': removeChannelGame, // { id }
  '/api/channel/restore': restoreChannelGame, // { id }
};

// withLibrary: also send favorites/added/edited/hidden games (only on page load, so it never
// overwrites changes the page is still sending).
async function me(env, user, { withLibrary = false } = {}) {
  const body = serializeMe(user, user ? await manualMarks(env, user.steam_id) : []);
  if (body.user) body.user.isOwner = isOwner(env, user.steam_id);
  if (user && withLibrary) body.library = await getLibrary(env, user.steam_id);
  return json(body);
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname: path, searchParams: q } = url;
  const method = request.method;

  // --- auth ---
  if (path === '/api/auth/login' && method === 'GET') return loginRedirect(request);
  if (path === '/api/auth/callback' && method === 'GET') return handleCallback(request, env);
  if (path === '/api/auth/logout' && method === 'POST') {
    await readJsonBody(request);
    return handleLogout(request, env);
  }

  // --- current user ---
  if (path === '/api/me' && method === 'GET') return me(env, await currentUser(request, env), { withLibrary: true });
  if (path === '/api/me' && method === 'DELETE') {
    await readJsonBody(request);
    const user = await requireUser(request, env);
    return deleteAccount(env, user.steam_id);
  }
  if (path === '/api/me/sync' && method === 'POST') {
    await readJsonBody(request);
    const user = await requireUser(request, env);
    await refreshUser(env, user.steam_id);
    return me(env, await currentUser(request, env));
  }

  // --- ownership ---
  if (path === '/api/ownership' && method === 'POST') {
    const body = await readJsonBody(request);
    const user = await requireUser(request, env);
    await setOwnership(env, user.steam_id, body);
    return me(env, user);
  }
  if (path === '/api/owners' && method === 'GET') return json(await ownersOf(env, q.get('key')));
  if (path === '/api/members' && method === 'GET') return json(await listMembers(env));
  if (path === '/api/owners/counts' && method === 'POST') {
    const body = await readJsonBody(request);
    return json(await ownerCounts(env, body.keys));
  }

  // --- favorites, hidden, added and edited games (per account) ---
  if (LIBRARY[path] && method === 'POST') {
    const body = await readJsonBody(request);
    const user = await requireUser(request, env);
    await LIBRARY[path](env, user.steam_id, body);
    return json({ ok: true });
  }
  if (path === '/api/library/import' && method === 'POST') {
    // { mode: 'merge' | 'replace', favorites, hidden, custom, overrides }
    const body = await readJsonBody(request);
    const user = await requireUser(request, env);
    return json({ library: await importLibrary(env, user.steam_id, body) });
  }

  // --- the channel's list (owner edits on top of games.json) ---
  if (path === '/api/channel' && method === 'GET') return json(await getChannel(env));
  if (CHANNEL[path] && method === 'POST') {
    const body = await readJsonBody(request);
    const user = await requireUser(request, env);
    assertOwner(env, user);
    return json({ ok: true, ...(await CHANNEL[path](env, user.steam_id, body)) });
  }
  if (path === '/api/channel/suggestions' && method === 'GET') {
    assertOwner(env, await requireUser(request, env));
    return json(await listSuggestions(env));
  }

  // --- Steam store proxy ---
  if (path === '/api/steam/search' && method === 'GET') {
    const term = (q.get('q') || '').trim();
    if (term.length < 2) throw new HttpError(400, 'Digite pelo menos 2 letras');
    return cached(request, ctx, 24 * HOUR, async () => ({ items: await searchSteam(term) }));
  }
  if (path === '/api/steam/details' && method === 'GET') {
    const appid = (q.get('appid') || '').replace(/\D/g, '');
    if (!appid) throw new HttpError(400, 'appid inválido');
    const details = await getSteamDetails(appid);
    if (!details) throw new HttpError(404, 'Jogo não encontrado na Steam');
    return json(details, 200, { 'Cache-Control': `public, max-age=${HOUR}` });
  }

  // --- sales for the whole list, and images for games not on Steam ---
  if (path === '/api/deals' && method === 'POST') {
    const body = await readJsonBody(request);
    return getDeals(request, env, ctx, body);
  }
  if (path === '/api/itad/image' && method === 'GET') {
    const title = (q.get('title') || '').trim().slice(0, 120);
    if (title.length < 2) throw new HttpError(400, 'Informe o nome do jogo');
    return cached(request, ctx, 24 * HOUR, () => getItadImage(env, title));
  }

  // --- prices ---
  if (path === '/api/prices' && method === 'GET') {
    const appid = (q.get('appid') || '').replace(/\D/g, '') || null;
    const title = (q.get('title') || '').trim().slice(0, 120) || null;
    if (!appid && !title) throw new HttpError(400, 'Informe appid ou title');
    return cached(request, ctx, HOUR, () => getPrices(env, { appid, title }));
  }

  throw new HttpError(404, 'Rota não encontrada');
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Erro interno' }, 500);
    }
  },
};
