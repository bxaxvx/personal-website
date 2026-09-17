// `site deploy` — builds the site and mirrors _site/ to the server over SSH.
//
// Three things make this safer than dragging folders in an FTP client:
//   * the build runs with STEAM_STRICT=1, so an unreachable Steam fails the
//     deploy instead of quietly shipping pages built from the stale cache;
//   * rsync runs once as a dry run and prints exactly what would change, and
//     nothing is uploaded until that list is confirmed;
//   * --delete is guarded: a wrong remote path shows up as a huge number of
//     deletions, and the deploy stops rather than emptying someone's folder.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { bold, confirm, cyan, dim, green, red, yellow } from "./prompt.mjs";

const CONFIG_FILE = "deploy.config.json";
const EXAMPLE_FILE = "deploy.config.example.json";
const OUTPUT_DIR = "_site";

// Anything beyond this many deletions needs --force. A normal content change
// removes a handful of files; a misconfigured remote path removes everything.
const DELETE_RATIO = 0.3;
const DELETE_FLOOR = 10;

function expandHome(value) {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(
      `немає ${CONFIG_FILE}\n` +
        `  Скопіюйте приклад і впишіть свої дані:\n` +
        `    cp ${EXAMPLE_FILE} ${CONFIG_FILE}\n` +
        `  Файл у .gitignore — він не потрапить у публічний репозиторій.`,
    );
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (error) {
    throw new Error(`${CONFIG_FILE}: не читається як JSON (${error.message})`);
  }

  for (const field of ["host", "user", "path"]) {
    const value = config[field];
    if (!value || String(value).startsWith("ЗАПОВНІТЬ")) {
      throw new Error(`${CONFIG_FILE}: заповніть поле "${field}"`);
    }
  }

  return {
    port: 22,
    exclude: [],
    identityFile: null,
    ...config,
  };
}

function sshArgs(config) {
  const args = ["-p", String(config.port)];
  if (config.identityFile) {
    args.push("-i", expandHome(config.identityFile), "-o", "IdentitiesOnly=yes");
  }
  return args;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} завершився з кодом ${code}`)),
    );
  });
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

function countLocalFiles(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory()
      ? countLocalFiles(path.join(dir, entry.name))
      : 1;
  }
  return total;
}

// Fails early and clearly when SSH is not set up yet, and makes sure the
// remote directory already exists — rsync would otherwise happily create it
// in the wrong place and mirror the site there.
function checkRemote(config) {
  const target = `${config.user}@${config.host}`;
  // stdio is inherited so ssh can ask for a key passphrase or a password and
  // actually be answered; ssh reports its own failures as 255, while any other
  // non-zero status comes from `test -d` on the server.
  const probe = spawnSync(
    "ssh",
    [
      ...sshArgs(config),
      "-o", "ConnectTimeout=10",
      target,
      `test -d ${JSON.stringify(config.path)}`,
    ],
    { stdio: "inherit" },
  );

  if (probe.error) throw probe.error;
  if (probe.status === 0) return;

  if (probe.status === 255) {
    throw new Error(
      `не вдалося підключитися до ${target} (див. повідомлення ssh вище)\n` +
        `  Перевірте "host", "user" і "port" у ${CONFIG_FILE}.\n` +
        `  Якщо ключ ще не на сервері:  ssh-copy-id -p ${config.port} ${target}\n` +
        `  Якщо ключ із парольною фразою:  ssh-add ${config.identityFile ?? "~/.ssh/id_ed25519"}`,
    );
  }
  throw new Error(
    `на сервері немає теки "${config.path}"\n` +
      `  Перевірте поле "path" у ${CONFIG_FILE}.\n` +
      `  Побачити, що там є:  ssh ${target} ls`,
  );
}

function rsyncArgs(config, { dryRun }) {
  const remote = `${config.user}@${config.host}:${config.path.replace(/\/*$/, "/")}`;
  return [
    // -a without -og: shared hosting has no business preserving local
    // ownership, and --chmod gives the web server sane modes instead.
    "-rltz",
    "--delete",
    "--chmod=D755,F644",
    "--itemize-changes",
    ...(dryRun ? ["--dry-run"] : []),
    ...config.exclude.flatMap((pattern) => ["--exclude", pattern]),
    "-e", `ssh ${sshArgs(config).join(" ")}`,
    `${OUTPUT_DIR}/`,
    remote,
  ];
}

// Turns --itemize-changes output into { added, updated, deleted }.
export function parseChanges(stdout) {
  const added = [];
  const updated = [];
  const deleted = [];

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    if (line.startsWith("*deleting")) {
      deleted.push(line.slice(9).trim());
      continue;
    }
    const match = line.match(/^([<>ch.][fdLDS])(\S*)\s+(.*)$/);
    if (!match) continue;
    const [, kind, flags, file] = match;
    // Only real files matter here. Directory entries (including the "./" line
    // rsync always prints) would otherwise show up as phantom updates.
    if (!"fL".includes(kind[1])) continue;
    (flags.startsWith("+++") ? added : updated).push(file);
  }

  return { added, updated, deleted };
}

function printGroup(label, files, color) {
  if (!files.length) return;
  console.log(`\n${color(label)} ${dim(`(${files.length})`)}`);
  for (const file of files.slice(0, 20)) console.log(`  ${file}`);
  if (files.length > 20) console.log(dim(`  … і ще ${files.length - 20}`));
}

export async function deployCommand(argv) {
  const force = argv.includes("--force");
  const dryOnly = argv.includes("--dry-run");
  const skipBuild = argv.includes("--no-build");
  const config = loadConfig();

  const git = capture("git", ["status", "--porcelain"]);
  if (git.status === 0 && git.stdout.trim()) {
    console.log(
      `${yellow("!")} у репозиторії є незакомічені зміни ` +
        dim("(деплой це не блокує)"),
    );
  }

  if (skipBuild) {
    console.log(`${yellow("!")} збірку пропущено, заливаю поточний ${OUTPUT_DIR}/`);
  } else {
    console.log(bold("Збираю сайт…"));
    // STEAM_STRICT: better a failed deploy than a live page built from cache.
    await run("npx", ["@11ty/eleventy"], {
      env: { ...process.env, STEAM_STRICT: "1" },
    });
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    throw new Error(`немає теки ${OUTPUT_DIR}/ — спершу зберіть сайт`);
  }

  console.log(bold("\nПеревіряю сервер…"));
  checkRemote(config);
  console.log(`  ${green("✓")} ${config.user}@${config.host}:${config.path}`);

  const preview = capture("rsync", rsyncArgs(config, { dryRun: true }));
  if (preview.status !== 0) {
    throw new Error(`rsync не зміг порівняти файли:\n${preview.stderr}`);
  }

  const { added, updated, deleted } = parseChanges(preview.stdout);
  if (!added.length && !updated.length && !deleted.length) {
    console.log(`\n${green("Сайт на сервері вже актуальний — нічого робити.")}`);
    return;
  }

  printGroup("Нові", added, green);
  printGroup("Оновлені", updated, cyan);
  printGroup("Будуть видалені", deleted, red);

  const localFiles = countLocalFiles(OUTPUT_DIR);
  const limit = Math.max(DELETE_FLOOR, Math.ceil(localFiles * DELETE_RATIO));
  if (deleted.length > limit && !force) {
    throw new Error(
      `під видалення потрапляє ${deleted.length} файлів — це забагато ` +
        `(локально всього ${localFiles}).\n` +
        `  Найчастіша причина — неправильний "path" у ${CONFIG_FILE}:\n` +
        `  зараз це "${config.path}" на ${config.host}.\n` +
        `  Якщо так і задумано, повторіть з --force.`,
    );
  }

  if (dryOnly) {
    console.log(`\n${dim("--dry-run: нічого не залито.")}`);
    return;
  }

  console.log("");
  if (!(await confirm(`Залити на ${config.host}?`, false))) {
    console.log(yellow("Скасовано."));
    return;
  }

  console.log(bold("\nЗаливаю…"));
  await run("rsync", ["--info=progress2", ...rsyncArgs(config, { dryRun: false })]);
  console.log(`\n${green("✓ Готово.")}`);
}
