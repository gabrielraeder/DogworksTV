// The channel's list, edited on the site by the owner: games added, base games edited or
// removed (table channel_games, on top of public/data/games.json). Everyone sees it.
// The owner is set by Steam ID in OWNER_STEAM_IDS (wrangler.jsonc vars, comma-separated).

import { HttpError } from './http.js';
import { cleanGame } from './library.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isOwner(env, steamId) {
  const owners = String(env.OWNER_STEAM_IDS || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  return !!steamId && owners.includes(steamId);
}

export function assertOwner(env, user) {
  if (!isOwner(env, user.steam_id)) throw new HttpError(403, 'Só o dono do canal pode mudar a lista');
}

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// { added: [game], overrides: { id: fields }, removed: [id] }
export async function getChannel(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, data, added, removed, added_at FROM channel_games ORDER BY added_at, id',
  ).all();
  const out = { added: [], overrides: {}, removed: [] };
  for (const r of results) {
    const data = r.data ? parse(r.data) : null;
    if (r.added) {
      if (data && !r.removed) out.added.push({ ...data, id: r.id, addedAt: r.added_at });
      continue;
    }
    if (r.removed) out.removed.push(r.id);
    if (data) out.overrides[r.id] = data;
  }
  return out;
}

// { id?, added, data }: added = true creates/updates a game added by the owner (a new id is
// generated when id is missing); added = false stores the edited fields of a base game.
export async function saveChannelGame(env, steamId, { id, added, data }) {
  const clean = cleanGame(data, { requireName: !!added });
  const t = Date.now();
  if (added && !id) id = `ch-${t.toString(36)}`;
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, 'Jogo inválido');
  if (!added && id.startsWith('ch-')) throw new HttpError(400, 'Jogo inválido');
  await env.DB.prepare(
    `INSERT INTO channel_games (id, data, added, added_at, updated_at, updated_by)
     VALUES (?1, ?2, ?3, ?4, ?4, ?5)
     ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  )
    .bind(id, JSON.stringify(clean), added ? 1 : 0, t, steamId)
    .run();
  return { id };
}

// Removes a game from the list: games the owner added are deleted; base games are marked
// removed (and can be restored).
export async function removeChannelGame(env, steamId, { id }) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, 'Jogo inválido');
  const t = Date.now();
  if (id.startsWith('ch-')) {
    await env.DB.prepare('DELETE FROM channel_games WHERE id = ?1').bind(id).run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO channel_games (id, removed, updated_at, updated_by) VALUES (?1, 1, ?2, ?3)
     ON CONFLICT (id) DO UPDATE SET removed = 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
    .bind(id, t, steamId)
    .run();
}

export async function restoreChannelGame(env, steamId, { id }) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, 'Jogo inválido');
  await env.DB.batch([
    env.DB.prepare('UPDATE channel_games SET removed = 0, updated_at = ?2, updated_by = ?3 WHERE id = ?1').bind(
      id,
      Date.now(),
      steamId,
    ),
    env.DB.prepare('DELETE FROM channel_games WHERE id = ?1 AND added = 0 AND removed = 0 AND data IS NULL').bind(id),
  ]);
}

const compact = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const steamAppId = (url) => (String(url || '').match(/store\.steampowered\.com\/app\/(\d+)/) || [])[1] || null;

// Games people added to their own lists, grouped by game, most added first. The page hides
// the ones already in the channel's list.
export async function listSuggestions(env) {
  const { results } = await env.DB.prepare(
    `SELECT g.data, g.added_at, u.name FROM user_games g JOIN users u ON u.steam_id = g.steam_id
     WHERE g.custom = 1 ORDER BY g.added_at DESC LIMIT 2000`,
  ).all();
  const groups = new Map();
  for (const r of results) {
    const game = parse(r.data);
    if (!game?.name) continue;
    const appid = steamAppId(game.steamUrl);
    const key = appid ? `steam:${appid}` : `name:${compact(game.name)}`;
    const group = groups.get(key) || groups.set(key, { key, game, people: [], addedAt: r.added_at }).get(key);
    if (!group.people.includes(r.name)) group.people.push(r.name);
    // keep the most complete copy (with image and Steam data)
    const score = (g) => (g.image ? 2 : 0) + (g.description ? 1 : 0) + (g.tags?.length ? 1 : 0);
    if (score(game) > score(group.game)) group.game = game;
  }
  const suggestions = [...groups.values()]
    .sort((a, b) => b.people.length - a.people.length || b.addedAt - a.addedAt)
    .slice(0, 200);
  return { suggestions };
}
