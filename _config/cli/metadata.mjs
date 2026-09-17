// Reads a page and guesses the title, publication date and language of a
// press entry. Everything here is a *suggestion*: the CLI pre-fills the
// prompts with it and you confirm or correct each field by hand, so a site
// with missing or wrong metadata costs an edit, never a bad entry.

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 15_000;

const NAMED_ENTITIES = {
  quot: '"', apos: "'", amp: "&", lt: "<", gt: ">", nbsp: " ",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", mdash: "—", ndash: "–",
  hellip: "…", shy: "", middot: "·",
};

export function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => {
      const key = name.toLowerCase();
      return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : match;
    });
}

// Collapses the whitespace that shows up when a <title> is split over lines.
const clean = (text) => decodeEntities(text).replace(/\s+/g, " ").trim();

function meta(html, attribute, value) {
  // The attribute can come before or after content=, so try both orders.
  const patterns = [
    new RegExp(
      `<meta[^>]+${attribute}=["']${value}["'][^>]*content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*${attribute}=["']${value}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return clean(match[1]);
  }
  return null;
}

function firstOf(html, lookups) {
  for (const lookup of lookups) {
    const found = lookup(html);
    if (found) return found;
  }
  return null;
}

// Pulls "datePublished" out of any JSON-LD block without parsing the JSON,
// which is often invalid or split across several <script> tags anyway.
function jsonLdDate(html) {
  const match = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  return match ? match[1] : null;
}

function toIsoDate(value) {
  if (!value) return null;
  const direct = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return direct[0];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function detectLanguage(html, title, languages) {
  const codes = Object.keys(languages);
  const declared = firstOf(html, [
    (page) => meta(page, "property", "og:locale"),
    (page) => page.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1],
  ]);

  if (declared) {
    const base = declared.toLowerCase().split(/[-_]/)[0];
    if (codes.includes(base)) return base;
  }
  // No usable declaration: Cyrillic in the title is a decent hint, and the
  // value is editable anyway.
  if (/[Ѐ-ӿ]/.test(title ?? "") && codes.includes("uk")) return "uk";
  if (codes.includes("en")) return "en";
  return codes[0] ?? "en";
}

function youtubeId(url) {
  const match = url.match(
    /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/,
  );
  return match ? match[1] : null;
}

async function get(url) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, "accept-language": "uk,en;q=0.8" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// YouTube's oEmbed endpoint gives a reliable title; the date only exists in
// the watch page, so we ask for both and let either one fail on its own.
async function fromYouTube(id, languages) {
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  let title = null;
  let date = null;
  let html = "";

  try {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (oembed.ok) title = clean((await oembed.json()).title ?? "");
  } catch {
    // Fall through to the watch page below.
  }

  try {
    html = await get(watchUrl);
    title ??= firstOf(html, [
      (page) => meta(page, "property", "og:title"),
      (page) => meta(page, "itemprop", "name"),
    ]);
    date = toIsoDate(
      firstOf(html, [
        (page) => page.match(/"publishDate"\s*:\s*"([^"]+)"/)?.[1],
        (page) => meta(page, "itemprop", "datePublished"),
        (page) => page.match(/"uploadDate"\s*:\s*"([^"]+)"/)?.[1],
      ]),
    );
  } catch {
    // Keep whatever oEmbed gave us.
  }

  return { title, date, lang: detectLanguage(html, title, languages) };
}

// Returns { title, date, lang }, any of which may be null when the page does
// not say. Never throws: a failed fetch just means empty suggestions.
export async function fetchMetadata(url, languages) {
  const empty = { title: null, date: null, lang: null, error: null };

  try {
    const video = youtubeId(url);
    if (video) return { ...empty, ...(await fromYouTube(video, languages)) };

    const html = await get(url);
    const title = firstOf(html, [
      (page) => meta(page, "property", "og:title"),
      (page) => meta(page, "name", "twitter:title"),
      (page) => {
        const match = page.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return match ? clean(match[1]) : null;
      },
    ]);
    const date = toIsoDate(
      firstOf(html, [
        (page) => meta(page, "property", "article:published_time"),
        (page) => meta(page, "property", "og:published_time"),
        (page) => meta(page, "itemprop", "datePublished"),
        (page) => meta(page, "name", "date"),
        (page) => jsonLdDate(page),
        (page) => page.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1],
      ]),
    );

    return { title, date, lang: detectLanguage(html, title, languages), error: null };
  } catch (error) {
    return { ...empty, error: error.message };
  }
}
