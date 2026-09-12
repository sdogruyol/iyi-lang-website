#!/usr/bin/env node
// The webfonts, cut down to what an alphabet on this site actually needs.
//
// THE WASTE THIS EXISTS TO REMOVE, measured off a real `dist`. The build
// shipped 42 font files. Two thirds of them were never going to be requested by
// anybody reading this site:
//
//   * Every `@fontsource` subset stylesheet lists a legacy `.woff` beside its
//     `.woff2`. No browser that can run this site prefers the `.woff`, because
//     `woff2` has been supported everywhere for years and the browsers that
//     cannot read it also cannot read the `@media (prefers-color-scheme)` and
//     the custom properties this site is built out of. Those files were half
//     the font payload and zero of the font traffic.
//   * `@fontsource/ibm-plex-mono/400.css` and its siblings pull the cyrillic,
//     cyrillic-ext and vietnamese subsets in with the latin ones. The site is
//     in English with Turkish proper nouns. Those subsets can never match a
//     codepoint on any page here.
//
// WHY A GENERATOR AND NOT A HAND WRITTEN `@font-face`. Because the part worth
// keeping is the `unicode-range`, and it is a hundred characters of hex per
// face that decides which file a browser fetches. Typed out here it would be a
// transcription of `@fontsource`'s metadata, it would be wrong in exactly the
// way this repository's other transcriptions were wrong, and it would go stale
// silently the next time the package is updated: the site would keep serving a
// range that no longer matches the file behind it. So the ranges are read out
// of the installed package on every build and never authored.
//
// WHAT IT WRITES. `src/generated/fonts.css`, one `@font-face` per face and
// subset, `woff2` only, with `url()` rewritten to a path Vite can resolve and
// fingerprint. `src/layouts/Page.astro` imports that one file instead of five
// package stylesheets.
//
// WHAT IT REFUSES. A face the package does not ship, a subset that vanished
// from a package's stylesheet, and a `.woff` that survived the filter. Each of
// those is a silent regression otherwise: a missing face falls back to the
// system sans and nobody notices, and a surviving `.woff` quietly puts the
// legacy payload back.

import { createRequire } from "node:module";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "src", "generated");
const require = createRequire(import.meta.url);

/**
 * The faces the stylesheets ask for, and nothing else.
 *
 * The mono list is the set of weights `src/styles` and the components actually
 * declare: 400 body code, 400 italic for comments (IBM Plex Mono was chosen
 * over the ligature monos for its true italic), 500 for a Crystal keyword and
 * the small-caps labels, 600 for a measured value and for `.tok-rule`, the one
 * emphasis this site draws. There is deliberately no 700: `code.css` used to
 * ask for one, no 700 face was ever loaded, and a weight nothing can render is
 * either a synthetic smear or a silent fall back to 600. It now asks for the
 * 600 it gets.
 *
 * Figtree is variable, so one file per subset covers 300 through 900 and the
 * 650 and 800 the headings use are real interpolations rather than matches.
 */
const FACES = [
  { pkg: "@fontsource-variable/figtree", sheet: "wght.css" },
  { pkg: "@fontsource/ibm-plex-mono", sheet: "400.css" },
  { pkg: "@fontsource/ibm-plex-mono", sheet: "400-italic.css" },
  { pkg: "@fontsource/ibm-plex-mono", sheet: "500.css" },
  { pkg: "@fontsource/ibm-plex-mono", sheet: "600.css" },
];

/**
 * The subsets kept.
 *
 * `latin-ext` is not a nicety here and doc/ART-DIRECTION.md says why: the
 * project's name is Turkish, and `ı İ ş ğ ç ö ü` have to render. Dropping it
 * would leave the site's own name in a fallback face.
 */
const SUBSETS = new Set(["latin", "latin-ext"]);

/* ------------------------------------------------------------------------ */

/** Split a fontsource stylesheet into its `@font-face` blocks. */
const blocks = (css) => [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);

/**
 * Which subset a block is for, read off the file it points at rather than off
 * the comment above it. The filename is what the browser fetches, so it is the
 * thing that cannot be out of date with itself.
 */
const subsetOf = (block) => {
  const url = /url\(\.\/files\/([^)]+?\.woff2)\)/.exec(block);
  if (!url) return null;
  const subset = /-(latin-ext|latin|cyrillic-ext|cyrillic|vietnamese|greek-ext|greek)-/.exec(url[1]);
  return subset ? { subset: subset[1], file: url[1] } : null;
};

const rules = [];
const kept = [];

for (const { pkg, sheet } of FACES) {
  const path = require.resolve(`${pkg}/${sheet}`);
  const found = blocks(readFileSync(path, "utf8"));
  if (found.length === 0) {
    throw new Error(
      `fonts: ${pkg}/${sheet} declares no @font-face. The package's stylesheet ` +
        `format moved, and this generator would have written an empty file that ` +
        `renders the whole site in the fallback sans.`,
    );
  }

  let taken = 0;
  for (const block of found) {
    const at = subsetOf(block);
    if (!at) {
      throw new Error(
        `fonts: a @font-face in ${pkg}/${sheet} names no woff2 subset file, so ` +
          `this generator cannot tell what alphabet it covers:\n${block}`,
      );
    }
    if (!SUBSETS.has(at.subset)) continue;

    const file = require.resolve(`${pkg}/files/${at.file}`);
    // Vite resolves a relative `url()` against the stylesheet that carries it,
    // and the stylesheet this writes lives in src/generated. Resolved through
    // the package's own exports first, so a hoisted, nested or linked
    // node_modules all give the path that is really on disk.
    const href = relative(out, file).split("\\").join("/");

    rules.push(
      block
        // The legacy source, and the whole reason the payload was twice what it
        // needed to be.
        .replace(/,\s*url\(\.\/files\/[^)]+?\.woff\)\s*format\('woff'\)/, "")
        .replace(/url\(\.\/files\/[^)]+?\.woff2\)/, `url(${href})`),
    );
    kept.push({ file, bytes: statSync(file).size });
    taken += 1;
  }

  if (taken === 0) {
    throw new Error(
      `fonts: ${pkg}/${sheet} ships none of ${[...SUBSETS].join(", ")}. Either ` +
        `the package renamed its subsets or this face is the wrong one to ask ` +
        `for, and either way the site would render it in a fallback.`,
    );
  }
}

const leftover = rules.filter((rule) => /\.woff\)/.test(rule));
if (leftover.length > 0) {
  throw new Error(
    `fonts: ${leftover.length} rule(s) still point at a legacy .woff, so the ` +
      `payload this generator exists to remove is back in the build:\n` +
      leftover.join("\n"),
  );
}

const banner = `/* Written by scripts/fonts.mjs. Do not edit: every rule here is read out of
 * the installed @fontsource packages, woff2 only, latin and latin-ext only.
 * The unicode ranges in particular are the package's and must never be typed.
 */\n\n`;

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "fonts.css"), banner + rules.join("\n\n") + "\n", "utf8");

const bytes = kept.reduce((sum, f) => sum + f.bytes, 0);
console.log(
  `fonts: ${rules.length} faces over ${kept.length} files, ` +
    `${(bytes / 1024).toFixed(1)} KiB, woff2 only, ${[...SUBSETS].join(" + ")}`,
);
