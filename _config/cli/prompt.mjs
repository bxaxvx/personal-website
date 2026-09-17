// Small wrappers around node:readline used by the `site` CLI.
//
// The point of ask() is the editable default: the suggested value is typed
// into the line for you, so confirming it is Enter and correcting it is normal
// line editing. That is what makes fetched metadata safe to suggest — nothing
// is ever written without passing through a prompt first.

import readline from "node:readline/promises";

const ESC = String.fromCharCode(27);
const useColor =
  process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const paint = (code) => (text) =>
  useColor ? `${ESC}[${code}m${text}${ESC}[0m` : String(text);

export const bold = paint("1");
export const dim = paint("2");
export const red = paint("31");
export const green = paint("32");
export const yellow = paint("33");
export const cyan = paint("36");

// Thrown when the input ends (Ctrl-D, a closed pipe) or the user interrupts.
// Every prompt happens before anything is written to disk, so this is always
// a clean "nothing happened", not a failure.
export class Cancelled extends Error {
  constructor() {
    super("Скасовано");
    this.name = "Cancelled";
  }
}

let rl = null;
let closed = false;
let onClose = null;

function io() {
  if (!rl) {
    closed = false;
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    // At end of input a pending question never settles, so the close event is
    // what turns it into a cancel instead of a silently hung process.
    onClose = new Promise((resolve) => {
      rl.once("close", () => {
        closed = true;
        resolve();
      });
    });
    // Ctrl-C mid-question is a cancel too.
    rl.once("SIGINT", () => rl.close());
  }
  return rl;
}

export function closePrompts() {
  rl?.close();
  rl = null;
  onClose = null;
}

// Asks a question with `preset` pre-typed into the answer line, ready to be
// edited or accepted with Enter.
export async function ask(question, preset = "") {
  const rli = io();
  if (closed) throw new Cancelled();

  let answer;
  try {
    answer = rli.question(`${bold(question)}: `);
  } catch {
    throw new Cancelled();
  }
  if (preset) rli.write(String(preset));

  // Whichever happens first: an answer, or the input going away.
  const value = await Promise.race([
    answer,
    onClose.then(() => {
      throw new Cancelled();
    }),
  ]);
  return String(value).trim();
}

// Repeats the question until `parse` returns a value instead of throwing.
// `parse` returns the cleaned-up value; its Error message is shown as-is, and
// what was typed stays in the line so a typo can be fixed rather than retyped.
export async function askUntil(question, preset, parse) {
  let current = preset;
  for (;;) {
    const raw = await ask(question, current);
    try {
      return await parse(raw);
    } catch (error) {
      console.log(`  ${red("✗")} ${error.message}`);
      current = raw;
    }
  }
}

export async function confirm(question, fallback = true) {
  const hint = fallback ? "Y/n" : "y/N";
  for (;;) {
    const raw = (await ask(`${question} (${hint})`)).toLowerCase();
    if (!raw) return fallback;
    if (["y", "yes", "т", "так"].includes(raw)) return true;
    if (["n", "no", "н", "ні"].includes(raw)) return false;
  }
}

// Numbered multiple choice: "1", "1,3", "1 3" or "all". Returns the chosen
// options; an empty answer means nothing was chosen.
export async function multiSelect(question, options) {
  console.log(`\n${bold(question)}`);
  options.forEach((option, index) => {
    console.log(`  ${cyan(String(index + 1))}. ${option.label}`);
  });

  for (;;) {
    const raw = await ask(dim("номери через кому, або 'all'"));
    if (!raw) return [];
    if (raw.toLowerCase() === "all") return [...options];

    const picked = raw.split(/[\s,]+/).filter(Boolean).map(Number);
    const valid =
      picked.length > 0 &&
      picked.every((n) => Number.isInteger(n) && n >= 1 && n <= options.length);
    if (valid) return [...new Set(picked)].map((n) => options[n - 1]);

    console.log(`  ${red("✗")} введіть номери від 1 до ${options.length}`);
  }
}
