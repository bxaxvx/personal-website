// Game subsites: every folder in game-sites/ (except ones starting with "_")
// becomes https://bychkovskyi.com/<folder>/. The folder holds a site.yml with
// the game's config and, optionally, an images/ folder (team photos etc.).
//
// Description, screenshots and the header image come from the Steam store
// API. Every build asks Steam for the current data, so editing a store page
// and rebuilding is enough to update the site. Responses and images are kept
// in .cache/ as a fallback for when Steam is unreachable; STEAM_CACHE=1 skips
// the network entirely and builds from that cache, and STEAM_STRICT=1 does the
// opposite: it turns an unreachable Steam into a failed build instead of a
// warning, so a deploy never ships a page quietly built from stale data.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";

export const SOURCE_DIR = "game-sites";
export const CACHE_DIR = ".cache/game-sites";
// Card art for the site-wide Games page, served from /images/games/.
export const CARDS_CACHE_DIR = ".cache/game-cards";

// A `--serve` session rebuilds on every keystroke, so within one process the
// Steam response is reused for a while. A plain `eleventy` build is a fresh
// process and always refetches.
const MEMO_TTL_MS = 5 * 60 * 1000;
const memo = new Map();

export function listSlugs() {
  if (!fs.existsSync(SOURCE_DIR)) return [];
  return fs
    .readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .filter((entry) => fs.existsSync(path.join(SOURCE_DIR, entry.name, "site.yml")))
    .map((entry) => entry.name);
}

async function fetchSteamApp(appId) {
  const cacheFile = path.join(CACHE_DIR, "steam", `${appId}.json`);
  const cached = fs.existsSync(cacheFile);
  const remembered = memo.get(appId);

  if (remembered && Date.now() - remembered.at < MEMO_TTL_MS) {
    return remembered.data;
  }
  if (cached && process.env.STEAM_CACHE) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  }

  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&cc=us`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const entry = (await response.json())[appId];
    if (!entry?.success) throw new Error("Steam returned success: false");

    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(entry.data));
    memo.set(appId, { data: entry.data, at: Date.now() });
    return entry.data;
  } catch (error) {
    if (cached && !process.env.STEAM_STRICT) {
      console.warn(`[game-sites] Steam app ${appId}: ${error.message}, using cached copy`);
      return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    }
    throw new Error(`[game-sites] Steam app ${appId}: ${error.message}`);
  }
}

// Downloads a Steam asset into `dir` (unless it's already there) and returns
// the path it will be served from, e.g. /saturn94/steam/1a2b3c.jpg.
async function downloadAsset(url, dir, publicDir, keep) {
  const clean = url.split("?")[0];
  const hash = crypto.createHash("sha1").update(clean).digest("hex").slice(0, 16);
  const name = hash + path.extname(clean);
  const file = path.join(dir, name);
  keep.add(name);

  if (!fs.existsSync(file)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`[game-sites] ${clean}: HTTP ${response.status}`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  return `${publicDir}/${name}`;
}

// Removes files in `dir` that this build didn't ask for, so renamed or
// replaced Steam assets don't linger in the output.
function pruneCache(dir, keep) {
  for (const name of fs.readdirSync(dir)) {
    if (!keep.has(name)) fs.rmSync(path.join(dir, name));
  }
}

function youtubeId(value) {
  if (!value) return null;
  const match = String(value).match(
    /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/,
  );
  return match ? match[1] : String(value);
}

function decodeEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function loadGame(slug, linkColors) {
  const config = yaml.load(
    fs.readFileSync(path.join(SOURCE_DIR, slug, "site.yml"), "utf8"),
  ) ?? {};
  if (!config.steam) throw new Error(`[game-sites] ${slug}/site.yml: "steam" is required`);

  const appId = String(config.steam).match(/\d+/)[0];
  const steam = await fetchSteamApp(appId);
  const keep = new Set();
  const dir = path.join(CACHE_DIR, slug);
  const publicDir = `/${slug}/steam`;
  fs.mkdirSync(dir, { recursive: true });

  const screenshots = [];
  for (const shot of steam.screenshots ?? []) {
    screenshots.push({
      thumb: await downloadAsset(shot.path_thumbnail, dir, publicDir, keep),
      full: await downloadAsset(shot.path_full, dir, publicDir, keep),
    });
  }
  const header = steam.header_image
    ? await downloadAsset(steam.header_image, dir, publicDir, keep)
    : null;

  pruneCache(dir, keep);

  const comingSoon = steam.release_date?.coming_soon ?? false;
  const steamUrl = `https://store.steampowered.com/app/${appId}/`;
  const withColor = (link) => ({
    ...link,
    color: link.color ?? linkColors[link.name] ?? null,
  });
  // Local image names resolve to the game's images/ folder.
  const imagePath = (value) =>
    !value || /^(https?:)?\//.test(value) ? value : `/${slug}/images/${value}`;

  const stores = [
    {
      name: "Steam",
      url: steamUrl,
      label: comingSoon ? "Wishlist on Steam" : "Buy on Steam",
    },
    ...(config.stores ?? []),
  ].map((store) => ({ ...withColor(store), label: store.label ?? `Get on ${store.name}` }));

  const team = (config.team ?? []).map((member) => ({
    ...member,
    photo: imagePath(member.photo),
    links: (member.links ?? []).map(withColor),
  }));

  return {
    slug,
    url: `/${slug}`,
    appId,
    steamUrl,
    title: config.title ?? steam.name,
    description: (config.description ?? decodeEntities(steam.short_description ?? "")).trim(),
    trailer: youtubeId(config.trailer),
    comingSoon,
    releaseDate: steam.release_date?.date ?? null,
    header,
    screenshots,
    stores,
    socials: (config.socials ?? []).map(withColor),
    team,
    presskit: config.presskit ?? null,
    press: (config.press ?? []).map((item) => ({
      ...item,
      date: item.date instanceof Date ? item.date : new Date(item.date),
    })),
  };
}

// One card per app ID in _data/games.yml, for the site-wide Games page. Games
// that have a subsite link there; the rest link straight to Steam.
async function loadGameCards() {
  const ids = (yaml.load(fs.readFileSync("_data/games.yml", "utf8")) ?? []).map(String);
  const sites = await loadGameSites();
  const keep = new Set();
  fs.mkdirSync(CARDS_CACHE_DIR, { recursive: true });

  const cards = [];
  for (const id of ids) {
    const appId = id.match(/\d+/)[0];
    const steam = await fetchSteamApp(appId);
    const site = sites.find((game) => game.appId === appId);
    cards.push({
      appId,
      title: site?.title ?? steam.name,
      description: site?.description ?? decodeEntities(steam.short_description ?? ""),
      comingSoon: steam.release_date?.coming_soon ?? false,
      releaseDate: steam.release_date?.date ?? null,
      header: steam.header_image
        ? await downloadAsset(steam.header_image, CARDS_CACHE_DIR, "/images/games", keep)
        : null,
      url: site ? site.url : `https://store.steampowered.com/app/${appId}/`,
      hasSite: Boolean(site),
    });
  }

  pruneCache(CARDS_CACHE_DIR, keep);
  return cards;
}

let pending = null;
let pendingCards = null;

// Loads every game once per build; eleventy.before resets it so --serve
// picks up edits to site.yml.
export function loadGameSites({ reset = false } = {}) {
  if (reset || !pending) {
    const links = yaml.load(fs.readFileSync("_data/links.yml", "utf8")) ?? [];
    const linkColors = Object.fromEntries(links.map((link) => [link.name, link.color]));
    pending = Promise.all(listSlugs().map((slug) => loadGame(slug, linkColors)));
  }
  return pending;
}

// Same, for the Games page cards.
export function loadCards({ reset = false } = {}) {
  if (reset || !pendingCards) pendingCards = loadGameCards();
  return pendingCards;
}
