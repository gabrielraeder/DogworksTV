// "Eu tenho" marks and the list of who owns each game.

import { HttpError } from './http.js';

export const PLATFORMS = ['steam', 'epic', 'outra'];
const KEY_RE = /^(steam:\d{1,10}|name:[a-z0-9]{1,120})$/;
const D1_MAX_PARAMS = 90; // D1 allows 100 bound parameters per query

export function assertKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw new HttpError(400, 'Jogo inválido');
  return key;
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const placeholders = (n, offset = 0) => Array.from({ length: n }, (_, i) => `?${i + 1 + offset}`).join(',');

export function serializeMe(user, manual) {
  return {
    user: user && {
      steamId: user.steam_id,
      name: user.name,
      avatar: user.avatar,
      profileUrl: user.profile_url,
      libraryVisible: !!user.library_visible,
      librarySyncedAt: user.library_synced_at,
      wishlistSyncedAt: user.wishlist_synced_at,
    },
    owned: {
      manual: manual.map((r) => ({ key: r.game_key, platform: r.platform })),
      steamAppids: user ? JSON.parse(user.steam_appids || '[]') : [],
    },
    wishlist: user ? JSON.parse(user.wishlist_appids || '[]') : [],
  };
}

export async function manualMarks(env, steamId) {
  const { results } = await env.DB.prepare('SELECT game_key, platform FROM ownership WHERE steam_id = ?1')
    .bind(steamId)
    .all();
  return results;
}

export async function setOwnership(env, steamId, { key, platform, owned }) {
  assertKey(key);
  if (!PLATFORMS.includes(platform)) throw new HttpError(400, 'Plataforma inválida');
  if (owned) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO ownership (steam_id, game_key, platform, created_at) VALUES (?1, ?2, ?3, ?4)',
    )
      .bind(steamId, key, platform, Date.now())
      .run();
  } else {
    await env.DB.prepare('DELETE FROM ownership WHERE steam_id = ?1 AND game_key = ?2 AND platform = ?3')
      .bind(steamId, key, platform)
      .run();
  }
}

// Map of key -> Set(steam_id) combining manual marks and detected Steam libraries.
async function ownersByKey(env, keys) {
  const map = new Map(keys.map((k) => [k, new Set()]));

  for (const part of chunk(keys, D1_MAX_PARAMS)) {
    const { results } = await env.DB.prepare(
      `SELECT game_key, steam_id FROM ownership WHERE game_key IN (${placeholders(part.length)})`,
    )
      .bind(...part)
      .all();
    for (const r of results) map.get(r.game_key)?.add(r.steam_id);
  }

  const appids = keys.filter((k) => k.startsWith('steam:')).map((k) => Number(k.slice(6)));
  for (const part of chunk(appids, D1_MAX_PARAMS)) {
    const { results } = await env.DB.prepare(
      `SELECT j.value AS appid, u.steam_id FROM users u, json_each(u.steam_appids) j
       WHERE u.library_visible = 1 AND j.value IN (${placeholders(part.length)})`,
    )
      .bind(...part)
      .all();
    for (const r of results) map.get(`steam:${r.appid}`)?.add(r.steam_id);
  }
  return map;
}

// key -> number of people with the game on their Steam wishlist (Steam games only).
async function wantedByKey(env, keys) {
  const wanted = {};
  const appids = keys.filter((k) => k.startsWith('steam:')).map((k) => Number(k.slice(6)));
  for (const part of chunk(appids, D1_MAX_PARAMS)) {
    const { results } = await env.DB.prepare(
      `SELECT j.value AS appid, COUNT(*) AS n FROM users u, json_each(u.wishlist_appids) j
       WHERE j.value IN (${placeholders(part.length)}) GROUP BY j.value`,
    )
      .bind(...part)
      .all();
    for (const r of results) wanted[`steam:${r.appid}`] = r.n;
  }
  return wanted;
}

// counts: key -> number of owners; owners: key -> steam ids (used by "Jogar com quem?");
// wanted: key -> number of people with it on their Steam wishlist.
export async function ownerCounts(env, keys) {
  if (!Array.isArray(keys)) throw new HttpError(400, 'Lista inválida');
  const valid = [...new Set(keys.filter((k) => typeof k === 'string' && KEY_RE.test(k)))].slice(0, 2000);
  const [map, wanted] = await Promise.all([ownersByKey(env, valid), wantedByKey(env, valid)]);
  const counts = {};
  const owners = {};
  for (const [k, set] of map) {
    if (!set.size) continue;
    counts[k] = set.size;
    owners[k] = [...set];
  }
  return { counts, owners, wanted };
}

// People who can be picked in "Jogar com quem?": anyone with a mark or a visible Steam library.
export async function listMembers(env) {
  const { results } = await env.DB.prepare(
    `SELECT steam_id, name, avatar FROM users
     WHERE library_visible = 1 OR EXISTS (SELECT 1 FROM ownership o WHERE o.steam_id = users.steam_id)
     ORDER BY name COLLATE NOCASE`,
  ).all();
  return { members: results.map((r) => ({ steamId: r.steam_id, name: r.name, avatar: r.avatar })) };
}

export async function ownersOf(env, key) {
  assertKey(key);
  const byUser = new Map();
  const add = (row, platform, auto) => {
    const u =
      byUser.get(row.steam_id) ||
      byUser.set(row.steam_id, { name: row.name, avatar: row.avatar, profileUrl: row.profile_url, platforms: [] }).get(row.steam_id);
    if (!u.platforms.some((p) => p.id === platform)) u.platforms.push({ id: platform, auto });
  };

  const manual = await env.DB.prepare(
    `SELECT o.platform, u.steam_id, u.name, u.avatar, u.profile_url
     FROM ownership o JOIN users u ON u.steam_id = o.steam_id WHERE o.game_key = ?1`,
  )
    .bind(key)
    .all();
  for (const r of manual.results) add(r, r.platform, false);

  if (key.startsWith('steam:')) {
    const detected = await env.DB.prepare(
      `SELECT u.steam_id, u.name, u.avatar, u.profile_url FROM users u, json_each(u.steam_appids) j
       WHERE u.library_visible = 1 AND j.value = ?1`,
    )
      .bind(Number(key.slice(6)))
      .all();
    for (const r of detected.results) add(r, 'steam', true);
  }

  const owners = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // people with it on their Steam wishlist ("Quem quer")
  let wanters = [];
  if (key.startsWith('steam:')) {
    const { results } = await env.DB.prepare(
      `SELECT u.name, u.avatar, u.profile_url FROM users u, json_each(u.wishlist_appids) j
       WHERE j.value = ?1 ORDER BY u.name COLLATE NOCASE`,
    )
      .bind(Number(key.slice(6)))
      .all();
    wanters = results.map((r) => ({ name: r.name, avatar: r.avatar, profileUrl: r.profile_url }));
  }
  return { owners, wanters };
}
