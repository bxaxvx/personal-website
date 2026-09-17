// `site press [url]` — adds a press entry to the site-wide list, to any game
// subsite's list, or to several of them at once.
//
// The lists are deliberately kept separate: a material about a game and a
// material about me are different pages, and the same link belonging to both
// is a choice made here, per entry, not a rule baked into the build.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { listSlugs, SOURCE_DIR } from "../game-sites.mjs";
import { fetchMetadata } from "./metadata.mjs";
import { addPressEntry, existingUrls } from "./yaml-edit.mjs";
import {
  ask, askUntil, bold, confirm, cyan, dim, green, multiSelect, red, yellow,
} from "./prompt.mjs";

const ARTICLES = "_data/articles.yml";

function loadLanguages() {
  return yaml.load(fs.readFileSync("_data/languages.yml", "utf8")) ?? {};
}

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Accepts 2026-09-17, 17.09.2026, 17/09/2026 or "today"/"сьогодні".
function parseDate(raw) {
  const value = raw.trim().toLowerCase();
  if (!value) throw new Error("дата обовʼязкова");
  if (["today", "сьогодні", "t"].includes(value)) return today();

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!iso && !local) {
    throw new Error("формат: 2026-09-17, 17.09.2026 або 'today'");
  }

  const [year, month, day] = iso
    ? [iso[1], iso[2], iso[3]]
    : [local[3], local[2], local[1]];
  const date = new Date(Date.UTC(+year, +month - 1, +day));
  const valid =
    date.getUTCFullYear() === +year &&
    date.getUTCMonth() === +month - 1 &&
    date.getUTCDate() === +day;
  if (!valid) throw new Error(`такої дати не існує: ${raw}`);

  return date.toISOString().slice(0, 10);
}

function parseUrl(raw) {
  const value = raw.trim();
  if (!value) throw new Error("посилання обовʼязкове");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("це не схоже на URL (потрібен https://…)");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("підтримуються тільки http(s) посилання");
  }
  return value;
}

// Every place an entry can go. The site-wide list is a bare sequence, a game's
// list lives under the `press:` key of its site.yml.
function targets() {
  const games = listSlugs().map((slug) => ({
    label: `${slug} ${dim(`(${SOURCE_DIR}/${slug}/site.yml)`)}`,
    file: path.join(SOURCE_DIR, slug, "site.yml"),
    key: "press",
    name: slug,
  }));
  return [
    {
      label: `Головний сайт ${dim(`(${ARTICLES})`)}`,
      file: ARTICLES,
      key: null,
      name: "головний сайт",
    },
    ...games,
  ];
}

export async function pressCommand(argv) {
  const languages = loadLanguages();
  const codes = Object.keys(languages);
  if (!codes.length) {
    throw new Error("_data/languages.yml порожній — додайте хоча б одну мову");
  }

  const url = await askUntil("Посилання", argv[0] ?? "", parseUrl);

  const waiting = "  читаю сторінку…";
  process.stdout.write(dim(waiting));
  const meta = await fetchMetadata(url, languages);
  process.stdout.write(`\r${" ".repeat(waiting.length)}\r`);
  if (meta.error) {
    console.log(`  ${yellow("!")} сторінка не відповіла (${meta.error}) — заповніть поля вручну`);
  }

  console.log(dim("\n  Enter — лишити підставлене, або відредагуйте рядок\n"));

  const title = await askUntil("Назва", meta.title ?? "", (raw) => {
    const value = raw.trim().replace(/\s+/g, " ");
    if (!value) throw new Error("назва обовʼязкова");
    return value;
  });

  const date = await askUntil("Дата", meta.date ?? today(), parseDate);

  const lang = await askUntil(
    `Мова ${dim(`(${codes.join(", ")})`)}`,
    meta.lang ?? codes[0],
    async (raw) => {
      const value = raw.trim().toLowerCase();
      if (!value) throw new Error("мова обовʼязкова");
      if (languages[value]) return value;
      // Unknown codes are allowed, but the page will show a text badge instead
      // of a flag until the language is added to _data/languages.yml.
      const anyway = await confirm(
        `  ${yellow("!")} мови "${value}" немає в _data/languages.yml — ` +
          `на сторінці буде текстовий код замість прапора. Додати все одно?`,
        false,
      );
      if (!anyway) throw new Error("оберіть іншу мову або додайте її в _data/languages.yml");
      return value;
    },
  );

  const chosen = await multiSelect("Куди додати?", targets());
  if (!chosen.length) {
    console.log(`\n${yellow("Нічого не обрано — запис не додано.")}`);
    return;
  }

  const entry = { date, lang, title, url };

  // A link already present in a file is always a mistake, so those targets are
  // dropped rather than duplicated.
  const fresh = [];
  for (const target of chosen) {
    if (existingUrls(target.file, target.key).includes(url)) {
      console.log(`\n${yellow("!")} ${target.name}: це посилання вже є, пропускаю`);
    } else {
      fresh.push(target);
    }
  }
  if (!fresh.length) {
    console.log(`\n${yellow("Ніде додавати — запис уже всюди є.")}`);
    return;
  }

  const flag = languages[lang] ? languages[lang].name : `${lang} (без прапора)`;
  console.log(`\n${bold("Буде додано:")}`);
  console.log(`  ${cyan("дата")}  ${date}`);
  console.log(`  ${cyan("мова")}  ${lang} ${dim(`— ${flag}`)}`);
  console.log(`  ${cyan("назва")} ${title}`);
  console.log(`  ${cyan("лінк")}  ${url}`);
  console.log(`  ${cyan("куди")}  ${fresh.map((t) => t.name).join(", ")}\n`);

  if (!(await confirm("Записати?"))) {
    console.log(yellow("Скасовано."));
    return;
  }

  for (const target of fresh) {
    const count = addPressEntry(target.file, entry, target.key);
    console.log(`  ${green("✓")} ${target.file} ${dim(`— тепер ${count} запис(ів)`)}`);
  }

  const cmd = process.env.SITE_CMD ?? "./site";
  console.log(
    `\n${dim("Перегляньте локально:")} ${cmd} dev` +
      `\n${dim("Потім залийте:")} ${cmd} deploy`,
  );
}
