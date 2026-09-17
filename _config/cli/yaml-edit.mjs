// Adds a press entry to a YAML file as *text*.
//
// Loading the file with js-yaml and dumping it back would be shorter, but it
// would also throw away every comment — and the comments in _data/articles.yml
// and game-sites/<game>/site.yml are the documentation for those files. So the
// entry is formatted by hand, inserted at the right place, and the result is
// parsed once to prove the file is still valid YAML containing the new entry.

import fs from "node:fs";
import yaml from "js-yaml";

// Titles go through a double-quoted scalar, which needs exactly two escapes
// and then accepts anything else, including ":" and "#".
function quote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// URLs are left bare to match the existing files; a "#" after a space would
// start a comment, and a quote or space means it is not a plain URL anyway.
function scalar(value) {
  return /^https?:\/\/\S+$/.test(value) ? value : quote(value);
}

function formatEntry(entry, indent) {
  const pad = " ".repeat(indent);
  return [
    `${pad}- date: ${entry.date}`,
    `${pad}  lang: ${entry.lang}`,
    `${pad}  title: ${quote(entry.title)}`,
    `${pad}  url: ${scalar(entry.url)}`,
  ].join("\n");
}

const isBlank = (line) => line.trim() === "";
const isComment = (line) => line.trim().startsWith("#");
const indentOf = (line) => line.match(/^ */)[0].length;

// Collects every url already listed, so the CLI can refuse to add the same
// link to the same file twice.
export function existingUrls(file, key = null) {
  if (!fs.existsSync(file)) return [];
  const parsed = yaml.load(fs.readFileSync(file, "utf8")) ?? {};
  const list = key ? (parsed?.[key] ?? []) : parsed;
  return Array.isArray(list) ? list.map((item) => item?.url).filter(Boolean) : [];
}

// Appends to a file whose top level is the sequence itself (_data/articles.yml).
function appendToRoot(content, entry) {
  const body = content.replace(/\s*$/, "");
  return `${body}\n\n${formatEntry(entry, 0)}\n`;
}

// Appends inside a `key:` block of a mapping (game-sites/<game>/site.yml),
// matching whatever indentation that block already uses.
function appendToKey(content, entry, key) {
  const lines = content.split("\n");
  const start = lines.findIndex((line) =>
    new RegExp(`^${key}\\s*:`).test(line),
  );

  // No such block yet: start one at the end of the file.
  if (start === -1) {
    const body = content.replace(/\s*$/, "");
    return `${body}\n\n${key}:\n${formatEntry(entry, 2)}\n`;
  }

  // The block runs until the next line that starts a new top-level key.
  // Comments and blank lines belong to whatever comes after them, so they are
  // skipped rather than treated as the end or as the last entry.
  let end = start;
  let indent = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (isBlank(line) || isComment(line)) continue;
    if (indentOf(line) === 0) break;
    indent ??= /^\s*- /.test(line) ? indentOf(line) : null;
    end = i;
  }

  const inserted = formatEntry(entry, indent ?? 2);
  lines.splice(end + 1, 0, ...inserted.split("\n"));
  return lines.join("\n");
}

// Writes the entry and returns the number of entries the file now has.
// Throws without touching the file if the result would not parse.
export function addPressEntry(file, entry, key = null) {
  const content = fs.readFileSync(file, "utf8");
  const updated = key
    ? appendToKey(content, entry, key)
    : appendToRoot(content, entry);

  let parsed;
  try {
    parsed = yaml.load(updated);
  } catch (error) {
    throw new Error(`${file}: результат не є коректним YAML (${error.message})`);
  }

  const list = key ? parsed?.[key] : parsed;
  if (!Array.isArray(list) || !list.some((item) => item?.url === entry.url)) {
    throw new Error(`${file}: запис не знайшовся після вставки, файл не змінено`);
  }

  fs.writeFileSync(file, updated);
  return list.length;
}
