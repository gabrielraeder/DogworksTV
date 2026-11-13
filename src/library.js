// Per-account list data: favorites, hidden games, games added by the user and edits to base games.
// Table user_games (migrations/0002_user_games.sql). Signed-out visitors keep this in localStorage instead.

import { HttpError } from './http.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_ROWS = 2000; // per user: favorites + hidden + added + edited
const MAX_CUSTOM = 500;

const TEXT_FIELDS = { name: 200, category: 40, note: 500, image: 2000, steamUrl: 500, epicUrl: 500, description: 3000 };
const URL_FIELDS = new Set(['image', 'steamUrl', 'epicUrl']);
const LIST_FIELDS = { tags: [20, 40], genres: [20, 60] }; // [max items, max length]

function assertId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, 'Jogo inválido');
  return id;
}

const isHttpUrl = (v) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

// Keeps only known game fields, trimmed and length-limited. URLs must be http(s).
function cleanGame(input, { requireName }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Dados do jogo inválidos');
  const out = {};
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    if (!(field in input)) continue;
    let v = typeof input[field] === 'string' ? input[field].trim().slice(0, max) : '';
    if (URL_FIELDS.has(field) && v && !isHttpUrl(v)) v = '';
    out[field] = v;
  }
  for (const [field, [count, max]] of Object.entries(LIST_FIELDS)) {
    if (!(field in input)) continue;
    const list = Array.isArray(input[field]) ? input[field] : [];
    out[field] = list.filter((s) => typeof s === 'string' && s).slice(0, count).map((s) => s.slice(0, max));
  }
  if (requireName && !out.name) throw new HttpError(400, 'Informe o nome do jogo');
  return out;
}

const addedAtOf = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : Date.now());

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// Same shape the browser keeps in localStorage.
export async function getLibrary(env, steamId) {
  const { results } = await env.DB.prepare(
    `SELECT game_id, favorite, hidden, custom, data, added_at FROM user_games
     WHERE steam_id = ?1 ORDER BY added_at, game_id`,
  )
    .bind(steamId)
    .all();
  const lib = { favorites: [], hidden: [], custom: [], overrides: {} };
  for (const r of results) {
    if (r.favorite) lib.favorites.push(r.game_id);
    if (r.hidden) lib.hidden.push(r.game_id);
    const data = r.data ? parse(r.data) : null;
    if (r.custom && data) lib.custom.push({ ...data, id: r.game_id, addedAt: r.added_at });
    else if (!r.custom && data) lib.overrides[r.game_id] = data;
  }
  return lib;
}

const deleteIfEmpty = (env, steamId, id) =>
  env.DB.prepare(
    `DELETE FROM user_games WHERE steam_id = ?1 AND game_id = ?2
     AND favorite = 0 AND hidden = 0 AND custom = 0 AND data IS NULL`,
  ).bind(steamId, id);

// Inserts only while the user is under MAX_ROWS (updates of existing rows always pass).
const UNDER_LIMIT = `WHERE (SELECT COUNT(*) FROM user_games WHERE steam_id = ?1) < ${MAX_ROWS}
  OR EXISTS (SELECT 1 FROM user_games WHERE steam_id = ?1 AND game_id = ?2)`;

const tooMany = () => new HttpError(400, `Limite de ${MAX_ROWS} jogos marcados por conta`);

// { id, flag: 'favorite' | 'hidden', on }
export async function setFlag(env, steamId, { id, flag, on }) {
  assertId(id);
  if (flag !== 'favorite' && flag !== 'hidden') throw new HttpError(400, 'Marcação inválida');
  const t = Date.now();
  if (on) {
    const res = await env.DB.prepare(
      `INSERT INTO user_games (steam_id, game_id, ${flag}, updated_at)
       SELECT ?1, ?2, 1, ?3 ${UNDER_LIMIT}
       ON CONFLICT (steam_id, game_id) DO UPDATE SET ${flag} = 1, updated_at = excluded.updated_at`,
    )
      .bind(steamId, id, t)
      .run();
    if (!res.meta.changes) throw tooMany();
  } else {
    await env.DB.batch([
      env.DB.prepare(`UPDATE user_games SET ${flag} = 0, updated_at = ?3 WHERE steam_id = ?1 AND game_id = ?2`).bind(
        steamId,
        id,
        t,
      ),
      deleteIfEmpty(env, steamId, id),
    ]);
  }
}

// { id, custom, data, favorite? }: custom = true adds/updates a game added by the user;
// custom = false stores the edited fields of a base game.
export async function saveGame(env, steamId, { id, custom, data, favorite, addedAt }) {
  assertId(id);
  const clean = cleanGame(data, { requireName: !!custom });
  const t = Date.now();
  if (custom) {
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_games WHERE steam_id = ?1 AND custom = 1 AND game_id <> ?2')
      .bind(steamId, id)
      .first();
    if (n >= MAX_CUSTOM) throw new HttpError(400, `Limite de ${MAX_CUSTOM} jogos adicionados por conta`);
  }
  const res = await env.DB.prepare(
    `INSERT INTO user_games (steam_id, game_id, custom, favorite, data, added_at, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 ${UNDER_LIMIT}
     ON CONFLICT (steam_id, game_id) DO UPDATE SET
       data = excluded.data,
       favorite = MAX(user_games.favorite, excluded.favorite),
       updated_at = excluded.updated_at
     WHERE user_games.custom = excluded.custom`,
  )
    .bind(steamId, id, custom ? 1 : 0, favorite ? 1 : 0, JSON.stringify(clean), custom ? addedAtOf(addedAt) : null, t)
    .run();
  if (res.meta.changes) return;
  const exists = await env.DB.prepare('SELECT 1 FROM user_games WHERE steam_id = ?1 AND game_id = ?2').bind(steamId, id).first();
  throw exists ? new HttpError(409, 'Esse jogo já está na lista com outro tipo') : tooMany();
}

// Removes a game the user added (and its favorite mark).
export async function removeGame(env, steamId, { id }) {
  assertId(id);
  await env.DB.prepare('DELETE FROM user_games WHERE steam_id = ?1 AND game_id = ?2 AND custom = 1').bind(steamId, id).run();
}

// Bulk load: moving the browser's data into the account on first sign-in, restoring a backup,
// or resetting the list. mode 'replace' wipes the account's data first; 'merge' adds to it.
export async function importLibrary(env, steamId, body) {
  const mode = body?.mode === 'replace' ? 'replace' : 'merge';
  const ids = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && ID_RE.test(x)))];
  const favorites = ids(body?.favorites);
  const hidden = ids(body?.hidden);

  const custom = [];
  for (const g of Array.isArray(body?.custom) ? body.custom : []) {
    if (!g || typeof g.id !== 'string' || !ID_RE.test(g.id)) continue;
    try {
      custom.push({ id: g.id, data: JSON.stringify(cleanGame(g, { requireName: true })), addedAt: addedAtOf(g.addedAt) });
    } catch {}
  }
  const overrides = {};
  const rawOverrides = body?.overrides && typeof body.overrides === 'object' ? body.overrides : {};
  for (const [id, data] of Object.entries(rawOverrides)) {
    if (!ID_RE.test(id)) continue;
    try {
      overrides[id] = cleanGame(data, { requireName: false });
    } catch {}
  }

  if (custom.length > MAX_CUSTOM) throw new HttpError(400, `Limite de ${MAX_CUSTOM} jogos adicionados por conta`);
  const total = new Set([...favorites, ...hidden, ...custom.map((g) => g.id), ...Object.keys(overrides)]).size;
  if (total > MAX_ROWS) throw tooMany();

  // One statement per kind (json_each), so the import stays within D1's per-request query limit.
  const t = Date.now();
  const stmts = [];
  if (mode === 'replace') stmts.push(env.DB.prepare('DELETE FROM user_games WHERE steam_id = ?1').bind(steamId));
  if (custom.length) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO user_games (steam_id, game_id, custom, data, added_at, updated_at)
         SELECT ?1, json_extract(value, '$.id'), 1, json_extract(value, '$.data'), json_extract(value, '$.addedAt'), ?2
         FROM json_each(?3) WHERE true
         ON CONFLICT (steam_id, game_id) DO UPDATE SET
           custom = 1, data = excluded.data, added_at = COALESCE(user_games.added_at, excluded.added_at),
           updated_at = excluded.updated_at`,
      ).bind(steamId, t, JSON.stringify(custom)),
    );
  }
  if (Object.keys(overrides).length) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO user_games (steam_id, game_id, data, updated_at)
         SELECT ?1, key, value, ?2 FROM json_each(?3) WHERE true
         ON CONFLICT (steam_id, game_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
         WHERE user_games.custom = 0`,
      ).bind(steamId, t, JSON.stringify(overrides)),
    );
  }
  for (const [flag, list] of [
    ['favorite', favorites],
    ['hidden', hidden],
  ]) {
    if (!list.length) continue;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO user_games (steam_id, game_id, ${flag}, updated_at)
         SELECT ?1, value, 1, ?2 FROM json_each(?3) WHERE true
         ON CONFLICT (steam_id, game_id) DO UPDATE SET ${flag} = 1, updated_at = excluded.updated_at`,
      ).bind(steamId, t, JSON.stringify(list)),
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  return getLibrary(env, steamId);
}
