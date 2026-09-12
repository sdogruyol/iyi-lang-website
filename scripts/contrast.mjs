#!/usr/bin/env node
// The palette's contrast, computed rather than remembered.
//
// THE BUG THIS EXISTS TO PREVENT, because it had already happened.
// `src/styles/tokens.css` carried a comment reading "Contrast on white,
// computed not guessed: ink 16.4:1, graphite 8.2:1, mute 5.1:1, brand 4.9:1,
// brand-deep 6.9:1". Four of those five were wrong and one was wrong in the
// direction that matters: `--mute` is 4.83:1 on white, not 5.1:1, so the token
// nearest the AA floor was published with more headroom than it has.
//
// `scripts/no-transcription.mjs` could not see it. A ratio carries no time or
// size unit, and until this gate landed that script did not read `src/styles`
// at all. So the site's only incorrect figures sat in the one directory its
// own gate did not cover. That is the shape of every drift this publication
// exists to refuse, and it was in the file that defines the colours.
//
// WHAT THIS GATE DOES. It parses the hex tokens out of tokens.css, computes
// WCAG 2.x contrast for every pair the stylesheets actually put together, and
// exits non-zero when a pair is under the floor its role requires. Then it
// refuses a ratio written into a comment under `src/styles`, so the figures
// cannot come back as prose.
//
// WHAT IT DOES NOT DO. It does not discover which pairs exist. The pairs are
// declared below, each with the role that sets its floor, because a colour's
// floor is a question about type size and purpose and no parser answers that.
// A new token used as text without a row here is not checked; the rows are the
// claim, and they are reviewed like any other.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const styles = resolve(here, "..", "src", "styles");

/* ------------------------------------------------------------------------ */

const tokens = (() => {
  const text = readFileSync(join(styles, "tokens.css"), "utf8");
  const found = new Map();
  for (const [, name, hex] of text.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    found.set(name, hex);
  }
  if (found.size === 0) {
    throw new Error(
      "contrast: tokens.css declares no hex colour, so this gate is not " +
        "checking anything. The token syntax moved.",
    );
  }
  return found;
})();

const rgb = (hex) => {
  const raw = hex.slice(1);
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
  if (full.length !== 6) {
    throw new Error(`contrast: ${hex} is not a colour this gate can read`);
  }
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
};

/** WCAG 2.x relative luminance. */
const luminance = (hex) =>
  rgb(hex)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const value = (name) => {
  const hex = tokens.get(name);
  if (!hex) {
    throw new Error(`contrast: --${name} is not declared in tokens.css`);
  }
  return hex;
};

/* ------------------------------------------------------------------------ */

/** The grounds prose sits on. */
const GROUNDS = ["paper", "raise", "brand-soft"];

/**
 * The pairs, each with the floor its role requires.
 *
 * `text` is body copy, labels and links: 1.4.3 normal text, 4.5.
 * `display` is the home page's figures and the pillar numerals, which are set
 * at `--step-1` and heavier or larger, so they are large text: 3.0. `--brand`
 * is only ever used that way; `--brand-deep` exists for the sizes that are
 * not, which is why the two are separate tokens at all.
 * `reverse` is paper on a filled ground: 4.5, because the CTA's label is 17px
 * at 600 and that is not large text.
 * `boundary` is a focus ring or any non-text control edge: 1.4.11, 3.0.
 */
const PAIRS = [
  ...GROUNDS.flatMap((ground) =>
    ["ink", "graphite", "mute", "brand-deep", "signal-deep"].map((ink) => ({
      ink,
      ground,
      role: "text",
      floor: 4.5,
    })),
  ),
  ...GROUNDS.map((ground) => ({ ink: "brand", ground, role: "display", floor: 3 })),
  ...["brand", "brand-deep", "ink"].map((ground) => ({
    ink: "paper",
    ground,
    role: "reverse",
    floor: 4.5,
  })),
  ...["paper", "raise"].map((ground) => ({
    ink: "brand",
    ground,
    role: "boundary",
    floor: 3,
  })),
];

/**
 * Tokens that draw a hairline or a track and nothing else. 1.4.11 asks 3.0 of
 * a control's own boundary, and these are under it: they are reported so the
 * number is known and not gated, because raising them is a change to the
 * drawing and not to this file. Reported rather than omitted, so nobody reads
 * a green run as a claim about them.
 */
const UNGATED = ["hairline", "track"];

/* ------------------------------------------------------------------------ */

const measured = PAIRS.map((pair) => ({
  ...pair,
  ratio: ratio(value(pair.ink), value(pair.ground)),
}));

const failed = measured.filter((m) => m.ratio < m.floor);

const column = Math.max(...measured.map((m) => `${m.ink} on ${m.ground}`.length));
for (const m of measured) {
  const label = `${m.ink} on ${m.ground}`.padEnd(column);
  const verdict = m.ratio < m.floor ? "UNDER" : "ok";
  console.log(
    `  ${label}  ${m.ratio.toFixed(2).padStart(5)}:1  floor ${m.floor.toFixed(1)}  ${m.role.padEnd(9)} ${verdict}`,
  );
}
for (const name of UNGATED) {
  const on = GROUNDS.map((g) => `${ratio(value(name), value(g)).toFixed(2)}:1 on ${g}`).join(", ");
  console.log(`  ${name.padEnd(column)}  ${on}  1.4.11 boundary, not gated`);
}

if (failed.length > 0) {
  console.error(
    "\ncontrast: a colour pair the stylesheets use is under the floor its " +
      "role requires.\nThe palette is a decision; its contrast is a " +
      "measurement, and a page that fails it\nis unreadable for someone " +
      "whichever way the decision went.\n",
  );
  for (const m of failed) {
    console.error(
      `  ${m.ink} on ${m.ground}: ${m.ratio.toFixed(2)}:1, needs ${m.floor.toFixed(1)}:1 (${m.role})`,
    );
  }
  process.exit(1);
}

/* ------------------------------------------------------------------------ */

/* A ratio typed into a stylesheet comment is the figure this gate replaced.
 * Declarations are left alone: `--step-0: 1.0625rem` is a length, and a
 * pattern that flagged it would teach people to switch this off. */
const RATIO = /\b\d+(?:\.\d+)?\s*:\s*1\b(?!\d)/;
const transcribed = [];

for (const entry of readdirSync(styles)) {
  const path = join(styles, entry);
  if (!statSync(path).isFile() || !entry.endsWith(".css")) continue;
  const text = readFileSync(path, "utf8");
  for (const [comment] of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
    const before = text.slice(0, text.indexOf(comment)).split("\n").length;
    comment.split("\n").forEach((line, index) => {
      if (!RATIO.test(line)) return;
      transcribed.push({ file: relative(styles, path), line: before + index, text: line.trim() });
    });
  }
}

if (transcribed.length > 0) {
  console.error(
    "\ncontrast: a contrast ratio is written into a stylesheet comment.\n" +
      "This gate computes them from the tokens on every build, so a typed one " +
      "is a second\nplace for the palette to disagree with itself, and it was " +
      "wrong the last time it existed.\n",
  );
  for (const hit of transcribed) {
    console.error(`  ${hit.file}:${hit.line}  ${hit.text}`);
  }
  process.exit(1);
}

console.log(
  `contrast: ${measured.length} pairs over ${tokens.size} tokens, ` +
    `lowest gated ${Math.min(...measured.map((m) => m.ratio)).toFixed(2)}:1`,
);
