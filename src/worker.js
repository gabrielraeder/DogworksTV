// Cloudflare Worker: handles /api/*. Everything else is served from public/ (static assets).

import { searchSteam, getSteamDetails } from '../lib/steam.js';
import { HttpError, json, readJsonBody, cached } from './http.js';
import { loginRedirect, handleCallback, handleLogout, currentUser, requireUser, refreshUser } from './auth.js';
import { serializeMe, manualMarks, setOwnership, ownerCounts, ownersOf } from './owners.js';
import { getPrices } from './prices.js';

const HOUR = 3600;

async function me(env, user) {
  return json(serializeMe(user, user ? await manualMarks(env, user.steam_id) : []));
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
  if (path === '/api/me' && method === 'GET') return me(env, await currentUser(request, env));
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
  if (path === '/api/owners/counts' && method === 'POST') {
    const body = await readJsonBody(request);
    return json(await ownerCounts(env, body.keys));
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
