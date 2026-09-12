#!/usr/bin/env node
// The build-time gate over what a first view of a page costs.
//
// THE DEFECT THIS EXISTS FOR. astro.config.mjs sets `assetsInlineLimit: 0`
// with the comment "The site argues for small binaries. Shipping a megabyte of
// JavaScript to say so would be the same failure as transcribing a number."
// That was true and unenforced. A page whose subject is a compiler that links
// a small executable cannot ask a reader to download a framework to read the
// claim, and nothing in this repository noticed when the playground's island
// or the font set grew, because bytes are invisible in a diff: a font subset
// is one line in a stylesheet and a hundred kilobytes on the wire.
//
// So the weight is measured on every build, printed on every build, and
// gated against ceilings committed in `scripts/budget.json`. The ceilings are
// what the tree measured when they were adopted, which makes this a ratchet:
// they are lowered when the site gets lighter and never raised to admit a
// regression. `node scripts/budget.mjs --adopt` re-reads the tree and writes
// the lower numbers back, and refuses to write a higher one.
//
// WHAT A FIRST VIEW IS TAKEN TO BE, precisely, because a page weight quoted
// without its definition is a number nobody can reproduce:
//
//   - the HTML document itself;
//   - every stylesheet it links, plus anything those stylesheets `@import`;
//   - every script it loads with a `src`, plus every module those statically
//     import, transitively - the chunk graph a browser must have before the
//     first script runs;
//   - every distinct image it references with `<img src>` or `<source
//     srcset>`, and anything it declares `rel="preload"`;
//   - the font files those stylesheets declare that this page's own text
//     actually reaches. A browser fetches a `@font-face` only when the page
//     contains a codepoint inside its `unicode-range`, so a Latin page does
//     not pay for the Cyrillic subset. This gate computes that intersection
//     from the rendered text of the page, and takes the woff2 source when a
//     face offers woff2 and woff, because every browser that runs this site
//     takes woff2 and the woff is a fallback nobody here fetches.
//
// WHAT IT DELIBERATELY LEAVES OUT.
//
//   - The wasm modules. The playground fetches one when a reader presses Run;
//     that is a second view, deliberate, and the size the pages quote for it
//     is recorded in `records/`.
//   - Favicons and the Open Graph image. The browser picks one icon from the
//     set and reuses it for every route, and og.png is fetched by crawlers and
//     never by a reader, so charging either to a route would count bytes
//     nobody fetches on that route. They are charged to `assets` instead - the
//     whole-tree row below, which is what catches a 282 KB icon.
//   - Compression. These are the bytes on disk. GitHub Pages gzips text, so
//     the HTML, CSS and JS arrive smaller and the fonts, already compressed,
//     arrive as they are. A ratchet over uncompressed bytes moves in the same
//     direction as the wire and does not depend on a server's settings.
//   - Font weights and styles. Every face whose unicode-range the page reaches
//     is counted even if no element on the page asks for that weight, which
//     overcounts rather than under: a ceiling should not depend on a guess
//     about what the CSS cascade resolved to.
//
// A ROUTE WITH NO CEILING FAILS. The rows in budget.json are a claim about
// this site's weight, reviewed like any other claim on it, so a new section
// does not quietly inherit a neighbour's allowance. Add a row, or adopt the
// measurement with `--adopt` and review the number it wrote.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const budgetFile = resolve(here, "budget.json");

const argv = process.argv.slice(2);
const adopt = argv.includes("--adopt");
const everyRoute = argv.includes("--routes");
/* The tree to measure, `dist` unless another is named. The argument exists so
 * a copy of the output can be fattened on purpose and the gate run against it:
 * every gate here is proven by a deliberate regression, and doing that to the
 * real `dist` means rebuilding to get it back. */
const dist = resolve(site, argv.find((a) => !a.startsWith("--")) ?? "dist");

const budget = JSON.parse(readFileSync(budgetFile, "utf8"));

/* ------------------------------------------------------------------------ */

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

/* The base the site is served under comes from the config, not from here: with
 * SITE_BASE set, a page's `href` carries that prefix and joining it onto
 * `dist/` blind would find nothing, weigh nothing, and pass. A URL this script
 * built itself from a path on disk has no prefix, hence the conditional. */
const base = (await import(resolve(site, "astro.config.mjs"))).default.base.replace(/\/*$/, "/");

const asset = (url) => {
  const path = url.replace(/[?#].*$/, "");
  return join(dist, (path.startsWith(base) ? path.slice(base.length) : path).replace(/^\//, ""));
};

const sizeOf = (path) => {
  try {
    return statSync(path).size;
  } catch {
    /* A reference to a file that is not there is scripts/links.mjs's finding,
     * not this one's. Weighing it as zero keeps the two gates saying one thing
     * each: this one reports bytes, that one reports broken references. */
    return 0;
  }
};

/** Codepoints the rendered text of a document contains. */
function codepoints(html) {
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]*>/g, " ");
  const seen = new Set();
  for (const char of text) seen.add(char.codePointAt(0));
  return seen;
}

/** `U+0410-044F`, `U+??`, `U+20AC` - the three forms the subsetters emit. */
function inRange(declaration, points) {
  for (const part of declaration.split(",")) {
    const spec = part.trim().replace(/^u\+/i, "");
    let low;
    let high;
    if (spec.includes("-")) {
      const [from, to] = spec.split("-");
      low = parseInt(from, 16);
      high = parseInt(to, 16);
    } else if (spec.includes("?")) {
      low = parseInt(spec.replace(/\?/g, "0"), 16);
      high = parseInt(spec.replace(/\?/g, "F"), 16);
    } else {
      low = parseInt(spec, 16);
      high = low;
    }
    for (const point of points) if (point >= low && point <= high) return true;
  }
  return false;
}

/** Stylesheets reachable from a page, following `@import` as a browser would. */
function stylesheets(roots) {
  const found = [];
  const seen = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const url = queue.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const path = asset(url);
    const text = sizeOf(path) === 0 ? "" : readFileSync(path, "utf8");
    found.push({ url, path, text });
    for (const [, imported] of text.matchAll(/@import\s+(?:url\()?["']?([^"')\s]+)/g)) {
      queue.push(imported.startsWith("/") ? imported : `${dirname(url)}/${imported}`);
    }
  }
  return found;
}

/** The module graph a page must have loaded before its first script runs. */
function modules(roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const url = queue.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const path = asset(url);
    if (sizeOf(path) === 0) continue;
    const text = readFileSync(path, "utf8");
    /* Static specifiers only. A dynamic `import()` is a fetch that happens
     * later, if at all, which is the definition of not being a first view. */
    for (const [, specifier] of text.matchAll(/(?:\bfrom|^\s*import)\s*["']([^"']+)["']/gm)) {
      if (!specifier.startsWith(".")) continue;
      queue.push(`/${relative(dist, resolve(dirname(path), specifier)).split(/[\\/]/).join("/")}`);
    }
  }
  return [...seen];
}

/* ------------------------------------------------------------------------ */

function weigh(file) {
  const html = readFileSync(file, "utf8");
  const rel = relative(dist, file).split(/[\\/]/).join("/");
  const route = `/${rel.replace(/index\.html$/, "")}`;

  const sheets = stylesheets(
    [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]),
  );
  const scripts = modules(
    [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]),
  );

  const pictures = new Set();
  for (const [, url] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) pictures.add(url);
  for (const [, set] of html.matchAll(/\bsrcset="([^"]+)"/g)) {
    for (const candidate of set.split(",")) pictures.add(candidate.trim().split(/\s+/)[0]);
  }
  for (const [, url] of html.matchAll(/<link\b[^>]*\brel="preload"[^>]*\bhref="([^"]+)"/g)) {
    pictures.add(url);
  }

  const points = codepoints(html);
  const fonts = new Set();
  for (const sheet of sheets) {
    for (const [face] of sheet.text.matchAll(/@font-face\s*\{[^}]*\}/g)) {
      const sources = [...face.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/g)]
        .map(([, url, format]) => ({ url, format: format ?? "" }));
      if (sources.length === 0) continue;
      const range = /unicode-range\s*:\s*([^;}]+)/i.exec(face);
      if (range && !inRange(range[1], points)) continue;
      fonts.add((sources.find((s) => s.format.startsWith("woff2")) ?? sources[0]).url);
    }
  }

  const parts = {
    html: statSync(file).size,
    css: sheets.reduce((sum, s) => sum + sizeOf(s.path), 0),
    js: scripts.reduce((sum, url) => sum + sizeOf(asset(url)), 0),
    img: [...pictures].filter((u) => u.startsWith("/")).reduce((sum, u) => sum + sizeOf(asset(u)), 0),
    font: [...fonts].reduce((sum, u) => sum + sizeOf(asset(u)), 0),
  };
  return { route, ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

/* A pattern's `*` stands for one path segment, never for a slash, so
 * `/playground/*​/` is the tour and `/playground/iyi/*​/` is the repository's
 * own samples: two groups with two different weights and two ceilings. */
const matcher = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);

const rows = files(dist)
  .filter((f) => f.endsWith(".html"))
  .map(weigh)
  .sort((a, b) => b.total - a.total);

/* Everything the tree ships that is not a document: the bundles and fonts
 * under `_astro/`, and the icons, the social image and the mascot under the
 * root, which no per-route row charges because the browser picks one icon for
 * the whole site and a crawler is the only thing that fetches og.png. A row
 * over the lot is what catches a 282 KB favicon nobody looked at.
 *
 * The wasm modules are out: the playground fetches one when a reader presses
 * Run, their sizes are what `records/` records and `scripts/records.mjs`
 * checks against the iyi tree, and at megabytes they would swamp every other
 * movement in this row. */
const assets = files(dist)
  .filter((f) => !f.endsWith(".html") && !relative(dist, f).startsWith("wasm"))
  .reduce((sum, f) => sum + statSync(f).size, 0);

/* ------------------------------------------------------------------------ */

const groups = budget.routes.map((row) => ({ ...row, pattern: matcher(row.match), pages: [] }));
const homeless = [];
for (const row of rows) {
  const group = groups.find((g) => g.pattern.test(row.route));
  if (group) group.pages.push(row);
  else homeless.push(row);
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const grain = budget.grain;
/* The measurement plus at least one grain, rounded to the grain. Plus one
 * rather than up to the next multiple: a route that happens to measure just
 * under a multiple would otherwise be adopted with a few hundred bytes of
 * slack, and the next edit to a paragraph on it would fail the build. */
const ceilingFor = (bytes) => Math.ceil((bytes + grain) / grain) * grain;

const measured = groups
  .filter((g) => g.pages.length > 0)
  .map((g) => ({ ...g, worst: g.pages[0] }));

const width = Math.max(...budget.routes.map((r) => r.match.length), "assets (whole tree)".length);
console.log(
  `  ${"route".padEnd(width)}  ${"first view".padStart(11)}  ${"ceiling".padStart(11)}   ` +
    `html      css       js       img      font`,
);
/* A row whose ceiling is null has never been adopted: the pattern is declared
 * and the measurement has not been reviewed yet. It prints and it fails, but
 * it does not fail as a regression, because there is nothing to regress from. */
const ceiling = (value) => (value === null ? "not adopted" : kib(value));
const exceeds = (bytes, value) => value !== null && bytes > value;

for (const g of measured) {
  const w = g.worst;
  const verdict = exceeds(w.total, g.ceiling) ? "OVER" : g.ceiling === null ? "  ??" : "ok";
  console.log(
    `  ${g.match.padEnd(width)}  ${kib(w.total).padStart(11)}  ${ceiling(g.ceiling).padStart(11)}  ` +
      `${kib(w.html).padStart(9)} ${kib(w.css).padStart(9)} ${kib(w.js).padStart(8)} ` +
      `${kib(w.img).padStart(9)} ${kib(w.font).padStart(9)}  ${verdict} ` +
      `(${g.pages.length} route${g.pages.length === 1 ? "" : "s"}, heaviest ${w.route})`,
  );
}
console.log(
  `  ${"assets (whole tree)".padEnd(width)}  ${kib(assets).padStart(11)}  ` +
    `${ceiling(budget.assets).padStart(11)}  ${
      exceeds(assets, budget.assets) ? " OVER" : "   ok"
    }  everything shipped but the documents and the recorded wasm`,
);
if (everyRoute) {
  for (const row of rows) {
    console.log(`  ${kib(row.total).padStart(11)}  ${row.route}`);
  }
}

/* ------------------------------------------------------------------------ */

if (adopt) {
  /* A ratchet only turns one way. Adopting writes the measurement when it is
   * below the committed ceiling and leaves the ceiling alone when it is above,
   * so `--adopt` can never be the way a regression gets blessed. */
  const lowered = [];
  const added = [];
  for (const g of measured) {
    const want = ceilingFor(g.worst.total);
    if (g.ceiling !== null && want >= g.ceiling) continue;
    added.push(`${g.match}: ${ceiling(g.ceiling)} -> ${kib(want)}`);
    budget.routes.find((r) => r.match === g.match).ceiling = want;
  }
  for (const row of homeless) {
    if (budget.routes.some((r) => r.match === row.route)) continue;
    /* Exact routes go in front: the list is first-match-wins and a new page
     * under an existing glob would otherwise never be consulted. */
    budget.routes.unshift({ match: row.route, ceiling: ceilingFor(row.total) });
    added.push(`${row.route}: not matched -> ${kib(ceilingFor(row.total))}`);
  }
  const wantAssets = ceilingFor(assets);
  if (budget.assets === null || wantAssets < budget.assets) {
    lowered.push(`assets: ${ceiling(budget.assets)} -> ${kib(wantAssets)}`);
    budget.assets = wantAssets;
  }
  if (lowered.length + added.length === 0) {
    console.log("\nbudget: nothing to adopt, every ceiling is already the measurement");
  } else {
    /* Written by hand rather than by JSON.stringify's indenter: a row per
     * line is the whole reason this file is reviewable, and the default
     * puts `match` and `ceiling` on separate lines so a lowered ceiling
     * reads as a four-line diff. */
    const rows = budget.routes
      .map((r) => `    { "match": ${JSON.stringify(r.match)}, "ceiling": ${r.ceiling} }`)
      .join(",\n");
    writeFileSync(
      budgetFile,
      `{\n  "note": [\n${budget.note.map((l) => `    ${JSON.stringify(l)}`).join(",\n")}\n  ],\n` +
        `  "grain": ${budget.grain},\n  "routes": [\n${rows}\n  ],\n` +
        `  "assets": ${budget.assets}\n}\n`,
    );
    console.log(`\nbudget: wrote ${relative(site, budgetFile)}`);
    for (const line of [...added, ...lowered]) {
      console.log(`  ${line}`);
    }
  }
  process.exit(0);
}

const over = measured.flatMap((g) =>
  g.pages.filter((p) => exceeds(p.total, g.ceiling)).map((p) => ({ ...p, group: g })),
);
const unadopted = measured.filter((g) => g.ceiling === null);

if (homeless.length > 0) {
  console.error(
    "\nbudget: a route has no ceiling. The rows in scripts/budget.json are this " +
      "site's claim\nabout its own weight, so a new section states its weight " +
      "rather than inheriting a\nneighbour's allowance.\n",
  );
  for (const row of homeless.slice(0, 20)) {
    console.error(`  ${row.route}  ${kib(row.total)}, would adopt ${kib(ceilingFor(row.total))}`);
  }
  if (homeless.length > 20) console.error(`  ... and ${homeless.length - 20} more`);
  console.error(
    "\nAdd a row to scripts/budget.json, or run `node scripts/budget.mjs --adopt`\n" +
      "and review the numbers it writes.\n",
  );
  process.exit(1);
}

if (unadopted.length > 0) {
  console.error(
    "\nbudget: a declared route has no ceiling adopted yet, so nothing is gated " +
      "for it.\n",
  );
  for (const g of unadopted) {
    console.error(`  ${g.match}  heaviest ${kib(g.worst.total)} at ${g.worst.route}`);
  }
  console.error(
    "\nRun `node scripts/budget.mjs --adopt` and review the numbers it writes.\n",
  );
  process.exit(1);
}

if (over.length > 0 || exceeds(assets, budget.assets)) {
  console.error(
    "\nbudget: a first view got heavier than the ceiling this site committed to.\n" +
      "The pages argue for a compiler that links a small executable; the argument " +
      "cannot\narrive in a payload that contradicts it. The ceilings are a " +
      "ratchet: cut the bytes,\nor make the case for the weight and lower " +
      "something else.\n",
  );
  for (const row of over.slice(0, 20)) {
    console.error(
      `  ${row.route}  ${kib(row.total)} over ${kib(row.group.ceiling)} ` +
        `(${row.group.match})  html ${kib(row.html)}, css ${kib(row.css)}, ` +
        `js ${kib(row.js)}, img ${kib(row.img)}, fonts ${kib(row.font)}`,
    );
  }
  if (over.length > 20) console.error(`  ... and ${over.length - 20} more`);
  if (exceeds(assets, budget.assets)) {
    console.error(`  shipped assets  ${kib(assets)} over ${kib(budget.assets)} in the tree`);
  }
  console.error("");
  process.exit(1);
}

const heaviest = rows[0];
console.log(
  `budget: ${rows.length} routes under their ceilings, heaviest first view ` +
    `${kib(heaviest.total)} at ${heaviest.route}, ${kib(assets)} of shipped assets`,
);
