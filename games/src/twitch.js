// Whether the channel is live right now (Twitch Helix "Get Streams"), for the "ao vivo" badge and
// the player in the hero. Uses an app access token (client credentials): no Twitch login involved.
// Needs TWITCH_CLIENT_ID (vars) and TWITCH_CLIENT_SECRET (secret); without them the channel is
// always reported as offline.

const OFFLINE = { live: false };

// App token, kept per isolate and renewed a minute before it expires (they last ~60 days).
let appToken = null; // { value, expiresAt }

async function getAppToken(env) {
  if (appToken && appToken.expiresAt > Date.now()) return appToken.value;
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Twitch token: ${res.status}`);
  const data = await res.json();
  appToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return appToken.value;
}

async function fetchStream(env, login) {
  const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${await getAppToken(env)}` },
    });
    if (res.status === 401) {
      appToken = null; // revoked or expired early: get a new one and retry once
      continue;
    }
    if (!res.ok) throw new Error(`Twitch streams: ${res.status}`);
    return (await res.json()).data?.[0] || null;
  }
  throw new Error('Twitch streams: 401');
}

export async function getLive(env) {
  const channel = env.TWITCH_CHANNEL;
  if (!channel || !env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return OFFLINE;
  try {
    const stream = await fetchStream(env, channel);
    if (!stream || stream.type !== 'live') return { ...OFFLINE, channel };
    return {
      live: true,
      channel: stream.user_login,
      title: stream.title,
      game: stream.game_name,
      viewers: stream.viewer_count,
      startedAt: stream.started_at,
    };
  } catch (e) {
    console.error(e);
    return { ...OFFLINE, channel };
  }
}
