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
    },
    owned: {
      manual: manual.map((r) => ({ key: r.game_key, platform: r.platform })),
      steamAppids: user ? JSON.parse(user.steam_appids || '[]') : [],
    },
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

export async function ownerCounts(env, keys) {
  if (!Array.isArray(keys)) throw new HttpError(400, 'Lista inválida');
  const valid = [...new Set(keys.filter((k) => typeof k === 'string' && KEY_RE.test(k)))].slice(0, 2000);
  const map = await ownersByKey(env, valid);
  const counts = {};
  for (const [k, set] of map) if (set.size) counts[k] = set.size;
  return { counts };
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
  return { owners };
}
