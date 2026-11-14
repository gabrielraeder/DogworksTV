// "Quero jogar": each person votes for up to MAX_VOTES games they want to play on the stream.
// Votes are per game key, so the same game added by different people counts once.

import { HttpError } from './http.js';
import { assertKey } from './owners.js';

export const MAX_VOTES = 5;
const KEY_RE = /^(steam:\d{1,10}|name:[a-z0-9]{1,120})$/;
const D1_MAX_PARAMS = 90;

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const placeholders = (n) => Array.from({ length: n }, (_, i) => `?${i + 1}`).join(',');

export async function myVotes(env, steamId) {
  const { results } = await env.DB.prepare('SELECT game_key FROM play_votes WHERE steam_id = ?1 ORDER BY created_at')
    .bind(steamId)
    .all();
  return results.map((r) => r.game_key);
}

// { key, on } -> the person's votes after the change
export async function setVote(env, steamId, { key, on }) {
  assertKey(key);
  if (on) {
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO play_votes (steam_id, game_key, created_at)
       SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM play_votes WHERE steam_id = ?1) < ${MAX_VOTES}`,
    )
      .bind(steamId, key, Date.now())
      .run();
    if (!res.meta.changes) {
      const votes = await myVotes(env, steamId);
      if (!votes.includes(key)) {
        throw new HttpError(400, `Você já usou seus ${MAX_VOTES} votos. Tire o voto de outro jogo primeiro.`);
      }
    }
  } else {
    await env.DB.prepare('DELETE FROM play_votes WHERE steam_id = ?1 AND game_key = ?2').bind(steamId, key).run();
  }
  return myVotes(env, steamId);
}

// key -> number of votes
export async function voteCounts(env, keys) {
  const valid = [...new Set((Array.isArray(keys) ? keys : []).filter((k) => typeof k === 'string' && KEY_RE.test(k)))].slice(
    0,
    2000,
  );
  const counts = {};
  for (const part of chunk(valid, D1_MAX_PARAMS)) {
    const { results } = await env.DB.prepare(
      `SELECT game_key, COUNT(*) AS n FROM play_votes WHERE game_key IN (${placeholders(part.length)}) GROUP BY game_key`,
    )
      .bind(...part)
      .all();
    for (const r of results) counts[r.game_key] = r.n;
  }
  return counts;
}

// People who voted for a game, first votes first.
export async function votersOf(env, key) {
  const { results } = await env.DB.prepare(
    `SELECT u.steam_id, u.name, u.avatar, u.profile_url FROM play_votes v JOIN users u ON u.steam_id = v.steam_id
     WHERE v.game_key = ?1 ORDER BY v.created_at`,
  )
    .bind(key)
    .all();
  return results.map((r) => ({ steamId: r.steam_id, name: r.name, avatar: r.avatar, profileUrl: r.profile_url }));
}

// Most voted games: [{ key, votes }]
export async function ranking(env) {
  const { results } = await env.DB.prepare(
    `SELECT game_key, COUNT(*) AS n, MIN(created_at) AS first FROM play_votes
     GROUP BY game_key ORDER BY n DESC, first ASC LIMIT 50`,
  ).all();
  return { maxVotes: MAX_VOTES, ranking: results.map((r) => ({ key: r.game_key, votes: r.n })) };
}
