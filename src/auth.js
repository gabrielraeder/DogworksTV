// Steam sign-in (OpenID 2.0) and cookie sessions stored in D1.

import { getPlayerProfile, getOwnedAppids } from '../lib/steam.js';
import { HttpError, parseCookies } from './http.js';

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;

const now = () => Date.now();

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]);
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function loginRedirect(request) {
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${origin}/api/auth/callback`,
    'openid.realm': origin,
    'openid.identity': `${OPENID_NS}/identifier_select`,
    'openid.claimed_id': `${OPENID_NS}/identifier_select`,
  });
  return Response.redirect(`${STEAM_OPENID}?${params}`, 302);
}

async function verifyOpenId(url) {
  const q = url.searchParams;
  if (q.get('openid.mode') !== 'id_res') return null;
  if (q.get('openid.op_endpoint') !== STEAM_OPENID) return null;
  if (!(q.get('openid.return_to') || '').startsWith(`${url.origin}/api/auth/callback`)) return null;

  const claimed = (q.get('openid.claimed_id') || '').match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!claimed) return null;

  const body = new URLSearchParams();
  for (const [k, v] of q) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');

  const res = await fetch(STEAM_OPENID, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  return /is_valid\s*:\s*true/.test(text) ? claimed[1] : null;
}

// Refreshes profile + Steam library for a user and upserts it.
export async function refreshUser(env, steamId) {
  const profile = await getPlayerProfile(steamId, env.STEAM_API_KEY);
  let appids = null;
  try {
    appids = await getOwnedAppids(steamId, env.STEAM_API_KEY);
  } catch {
    appids = null;
  }
  const t = now();
  await env.DB.prepare(
    `INSERT INTO users (steam_id, name, avatar, profile_url, steam_appids, library_visible, library_synced_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7)
     ON CONFLICT (steam_id) DO UPDATE SET
       name = excluded.name,
       avatar = excluded.avatar,
       profile_url = excluded.profile_url,
       steam_appids = CASE WHEN excluded.library_visible = 1 THEN excluded.steam_appids ELSE users.steam_appids END,
       library_visible = excluded.library_visible,
       library_synced_at = excluded.library_synced_at,
       updated_at = excluded.updated_at`,
  )
    .bind(steamId, profile.name, profile.avatar, profile.profileUrl, JSON.stringify(appids || []), appids ? 1 : 0, t)
    .run();
}

export async function handleCallback(request, env) {
  const url = new URL(request.url);
  const steamId = await verifyOpenId(url).catch(() => null);
  if (!steamId) return Response.redirect(`${url.origin}/?login=erro`, 302);

  await refreshUser(env, steamId);

  const token = randomToken();
  const expires = now() + SESSION_DAYS * 86400_000;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now()),
    env.DB.prepare('INSERT INTO sessions (id, steam_id, expires_at) VALUES (?1, ?2, ?3)').bind(
      await sha256(token),
      steamId,
      expires,
    ),
  ]);

  return new Response(null, {
    status: 302,
    headers: { Location: `${url.origin}/?login=ok`, 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400) },
  });
}

// Deletes the signed-in user and everything tied to them ("Eu tenho" marks, favorites,
// added games, sessions), then clears the cookie. Tables also cascade from users.
export async function deleteAccount(env, steamId) {
  await env.DB.batch(
    ['ownership', 'user_games', 'sessions', 'users'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table} WHERE steam_id = ?1`).bind(steamId),
    ),
  );
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie('', 0) },
  });
}

export async function handleLogout(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?1').bind(await sha256(token)).run();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie('', 0) },
  });
}

// Returns the signed-in user row, or null.
export async function currentUser(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.steam_id = s.steam_id
     WHERE s.id = ?1 AND s.expires_at > ?2`,
  )
    .bind(await sha256(token), now())
    .first();
}

export async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, 'Entre com a Steam primeiro');
  return user;
}
