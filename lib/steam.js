// Shared Steam helpers used by the local dev server, the Vercel functions and the build script.

const UA = 'Mozilla/5.0 (games-list)';

// Steam category ids -> tags used by the site (ids are language independent).
const CATEGORY_TAGS = {
  38: 'coop-online',
  39: 'coop-local', // Shared/Split Screen Co-op
  48: 'coop-lan',
  36: 'pvp-online',
  37: 'pvp-local', // Shared/Split Screen PvP
  47: 'pvp-lan',
  24: 'split-screen',
  27: 'crossplay',
  20: 'mmo',
  9: 'coop',
  49: 'pvp',
  1: 'multiplayer',
};

export const steamStoreUrl = (appid) => `https://store.steampowered.com/app/${appid}/`;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`Steam respondeu ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const decodeEntities = (s = '') =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .trim();

export async function searchSteam(term) {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=BR&l=portuguese`;
  const data = await getJson(url);
  return (data.items || [])
    .filter((i) => i.type === 'app')
    .map((i) => ({ appid: i.id, name: i.name, thumb: i.tiny_image }));
}

export function tagsFromCategories(categories = []) {
  const tags = new Set();
  for (const c of categories) {
    const t = CATEGORY_TAGS[c.id];
    if (t) tags.add(t);
  }
  return [...tags];
}

export function suggestCategory(tags = []) {
  if (tags.includes('coop-online')) return 'coop-online';
  if (tags.includes('coop-local')) return 'coop-local';
  if (tags.some((t) => t.startsWith('pvp'))) return 'pvp';
  if (tags.includes('coop')) return 'coop-online';
  if (tags.includes('split-screen')) return 'party';
  return 'outros';
}

export async function getSteamDetails(appid) {
  const id = String(appid).replace(/\D/g, '');
  if (!id) throw new Error('appid inválido');
  const data = await getJson(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=BR&l=portuguese`);
  const entry = data[id];
  if (!entry || !entry.success) return null;
  const d = entry.data;
  const tags = tagsFromCategories(d.categories);
  const p = d.price_overview;
  return {
    appid: d.steam_appid,
    name: d.name,
    url: steamStoreUrl(d.steam_appid),
    image: d.header_image,
    description: decodeEntities(d.short_description),
    genres: (d.genres || []).map((g) => g.description),
    tags,
    suggestedCategory: suggestCategory(tags),
    isFree: !!d.is_free,
    price: p
      ? {
          currency: p.currency,
          initial: p.initial / 100,
          final: p.final / 100,
          discount: p.discount_percent || 0,
        }
      : null,
  };
}

const STORE_ASSETS = 'https://shared.akamai.steamstatic.com/store_item_assets/';

async function getItemsBatch(chunk, dataRequest) {
  const input = {
    ids: chunk.map((appid) => ({ appid })),
    context: { language: 'brazilian', country_code: 'BR' },
    data_request: dataRequest,
  };
  const data = await getJson(
    `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
  );
  return data?.response?.store_items || [];
}

const chunksOf = (appids, size = 150) => {
  const ids = [...new Set(appids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, i * size + size));
};

// Appids (as strings) of the games that are free on Steam (free to play). One request per 150.
export async function getFreeAppids(appids) {
  const pages = await Promise.all(chunksOf(appids).map((chunk) => getItemsBatch(chunk, {})));
  return pages
    .flat()
    .filter((i) => i.success === 1 && i.is_free)
    .map((i) => String(i.appid));
}

// Store data for many apps at once: name, header image, short description and the co-op /
// multiplayer tags. One request per 150 apps. Only games (no software, DLC or videos) that are
// still on the store come back.
export async function getStoreItems(appids) {
  const pages = await Promise.all(
    chunksOf(appids).map((chunk) => getItemsBatch(chunk, { include_basic_info: true, include_assets: true })),
  );
  return pages
    .flat()
    .filter((i) => i.success === 1 && i.type === 0 && i.name)
    .map((i) => {
      const c = i.categories || {};
      const ids = [...(c.supported_player_categoryids || []), ...(c.feature_categoryids || [])];
      const tags = tagsFromCategories(ids.map((id) => ({ id })));
      const a = i.assets || {};
      return {
        appid: i.appid,
        name: i.name,
        url: steamStoreUrl(i.appid),
        image: a.header && a.asset_url_format ? STORE_ASSETS + a.asset_url_format.replace('${FILENAME}', a.header) : '',
        description: decodeEntities(i.basic_info?.short_description || ''),
        tags,
        multiplayer: tags.length > 0, // every tag the site uses is a co-op / multiplayer one
        suggestedCategory: suggestCategory(tags),
      };
    });
}

/* ---------- Steam Web API (player data) ---------- */

// Public profile name/avatar without an API key (community XML profile).
async function getProfileXml(steamId) {
  const res = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const xml = await res.text();
  const pick = (tag) => (xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)) || [])[1];
  const name = pick('steamID');
  if (!name) return null;
  return {
    name,
    avatar: pick('avatarFull') || pick('avatarMedium') || null,
    profileUrl: `https://steamcommunity.com/profiles/${steamId}/`,
  };
}

export async function getPlayerProfile(steamId, apiKey) {
  if (apiKey) {
    try {
      const data = await getJson(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${steamId}`,
      );
      const p = data?.response?.players?.[0];
      if (p) return { name: p.personaname, avatar: p.avatarfull || p.avatarmedium, profileUrl: p.profileurl };
    } catch {}
  }
  return (await getProfileXml(steamId).catch(() => null)) || {
    name: `Steam ${steamId.slice(-4)}`,
    avatar: null,
    profileUrl: `https://steamcommunity.com/profiles/${steamId}/`,
  };
}

// Returns the owned appids, or null when the library is private or no API key is configured.
// Steam wishlist appids. Works only when the profile's game details are public; Steam answers
// the same way for a private and an empty wishlist, so both come back as [].
export async function getWishlistAppids(steamId, apiKey) {
  const key = apiKey ? `key=${encodeURIComponent(apiKey)}&` : '';
  const data = await getJson(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?${key}steamid=${steamId}`);
  const items = data?.response?.items;
  return Array.isArray(items) ? items.map((i) => i.appid).filter(Number.isInteger) : [];
}

// Steam IDs of the person's Steam friends. Needs the API key and a public friends list:
// [] when the list is private (Steam answers 401), null when Steam could not be reached.
export async function getFriendIds(steamId, apiKey) {
  if (!apiKey) return null;
  try {
    const data = await getJson(
      `https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&relationship=friend`,
    );
    const friends = data?.friendslist?.friends;
    return Array.isArray(friends) ? friends.map((f) => f.steamid).filter((id) => /^\d{17}$/.test(id)) : [];
  } catch (e) {
    if (e.status === 401 || e.status === 403) return [];
    return null;
  }
}

export async function getOwnedAppids(steamId, apiKey) {
  if (!apiKey) return null;
  const data = await getJson(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&include_played_free_games=true&include_free_sub=false`,
  );
  const games = data?.response?.games;
  return Array.isArray(games) ? games.map((g) => g.appid) : null;
}
