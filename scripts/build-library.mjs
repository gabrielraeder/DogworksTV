// Builds public/data/games.json from scripts/seed.json.
// - Steam: name match via store search, then appdetails (image, link, co-op/PvP tags).
// - Epic: images and launcher link from the local launcher catalog cache (Windows), if present.
//
// Usage: node scripts/build-library.mjs [--refresh]
//   --refresh  ignores scripts/.steam-cache.json and queries Steam again.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchSteam, getSteamDetails } from '../lib/steam.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = join(root, 'scripts', 'seed.json');
const CACHE = join(root, 'scripts', '.steam-cache.json');
const OUT = join(root, 'public', 'data', 'games.json');
const EPIC_CATCACHE = 'C:/ProgramData/Epic/EpicGamesLauncher/Data/Catalog/catcache.bin';

const norm = (s = '') =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]/g, '');

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 4) throw e;
      const wait = e.status === 429 ? 60000 : 2000 * attempt;
      console.warn(`  ! ${label}: ${e.message} — tentando de novo em ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

async function loadEpicCatalog() {
  if (!existsSync(EPIC_CATCACHE)) {
    console.warn('Cache da Epic não encontrado; imagens da Epic serão ignoradas.');
    return new Map();
  }
  const raw = await readFile(EPIC_CATCACHE, 'utf8');
  const items = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'));
  const map = new Map();
  for (const i of items) {
    const paths = (i.categories || []).map((c) => c.path);
    if (!paths.includes('games') || !paths.includes('applications')) continue;
    const img = (type) => (i.keyImages || []).find((k) => k.type === type)?.url;
    map.set(norm(i.title), {
      title: i.title,
      image: img('DieselGameBox') || img('Thumbnail'),
    });
  }
  return map;
}

function pickSteamMatch(results, query) {
  const q = norm(query);
  return (
    results.find((r) => norm(r.name) === q) ||
    results.find((r) => norm(r.name).startsWith(q) || q.startsWith(norm(r.name))) ||
    null
  );
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const seed = JSON.parse(await readFile(SEED, 'utf8'));
  const cache = !refresh && existsSync(CACHE) ? JSON.parse(await readFile(CACHE, 'utf8')) : {};
  const epic = await loadEpicCatalog();

  const games = [];
  const report = { noSteam: [], noEpic: [] };

  for (const [idx, s] of seed.entries()) {
    const label = `[${idx + 1}/${seed.length}] ${s.name}`;
    const steamQuery = s.steamId ? `#${s.steamId}` : s.steam || s.name;

    let steam = cache[steamQuery];
    if (steam === undefined) {
      steam = null;
      try {
        let appid = s.steamId;
        if (!appid) {
          const results = await withRetry(() => searchSteam(steamQuery), label);
          appid = pickSteamMatch(results, steamQuery)?.appid;
          await sleep(300);
        }
        if (appid) {
          steam = await withRetry(() => getSteamDetails(appid), label);
          await sleep(300);
        }
      } catch (e) {
        console.warn(`  ! ${label}: ${e.message}`);
      }
      cache[steamQuery] = steam;
    }

    const e = epic.get(norm(s.epic || s.name));
    if (!steam) report.noSteam.push(s.name);
    if (!e) report.noEpic.push(s.name);
    console.log(`${label}  steam:${steam ? steam.name : '—'}  epic:${e ? 'ok' : '—'}`);

    const epicImage = e?.image ? `${e.image}?resize=1&w=460` : null;
    games.push({
      id: slug(s.name),
      name: s.name,
      category: s.category,
      note: s.note || '',
      image: steam?.image || epicImage,
      description: steam?.description || '',
      genres: steam?.genres || [],
      tags: steam?.tags || [],
      steamUrl: steam?.url || null,
      epicUrl: s.epicUrl || `https://store.epicgames.com/pt-BR/browse?q=${encodeURIComponent(s.name)}&sortBy=relevancy&sortDir=DESC`,
    });
  }

  await writeFile(CACHE, JSON.stringify(cache, null, 2));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(games, null, 2));

  console.log(`\n${games.length} jogos salvos em public/data/games.json`);
  if (report.noSteam.length) console.log(`Sem match na Steam (${report.noSteam.length}): ${report.noSteam.join('; ')}`);
  if (report.noEpic.length) console.log(`Sem match no cache da Epic (${report.noEpic.length}): ${report.noEpic.join('; ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
