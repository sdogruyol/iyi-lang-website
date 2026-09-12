#!/usr/bin/env node
// The build-time gate over internal links, fragments and image alternatives.
//
// THE DEFECT THIS EXISTS FOR. This publication just deleted 58 routes: the
// whole of `/spec/**` and the changelog page. Deleting a route is exactly the
// change that strands a link, and it strands it silently - a static site has
// nobody to notice. An audit over `dist` during that cut found every internal
// reference still resolving, which is the good case and also the useless one,
// because nothing kept it that way for the next cut. A page that links to a
// route the site no longer builds is a 404 served under our own domain, and
// the reader cannot tell whether the page moved or the language did.
//
// Two smaller defects of the same family ride along, because the built HTML is
// the only place either can be seen:
//
//   - A `#fragment` that names an id no document carries. The site cites
//     SPEC.md sections as text and links inside its own long pages, so a
//     renamed heading breaks a jump that still looks like a link and still
//     navigates - to the top of the page, silently.
//   - An `<img>` with no `alt` attribute. A screen reader reads the file name
//     of an image with no alternative, so `mascot.png` is announced as
//     "mascot dot png". The empty string is a different claim and a correct
//     one: `alt=""` says the image carries nothing a reader needs, which is
//     true of a decorative mark. So the gate asks for the attribute, never for
//     its contents.
//
// WHAT THIS GATE SEES. Every `.html` under `dist`, every `href`, `src` and
// `srcset` candidate on it, resolved the way this site is served:
// `trailingSlash: "always"` and `build.format: "directory"`, so `/learn/` is
// `dist/learn/index.html` on disk and `/learn` is not a URL this site ever
// emits. The origin and base come from astro.config.mjs rather than being
// repeated here, so a link written absolute against our own domain - the
// canonical tag and the Open Graph URL are - is checked as the internal link
// it is.
//
// WHAT IT DELIBERATELY DOES NOT SEE. External URLs. Not one request leaves the
// machine. A gate that needs the network fails for the wrong reason: github.com
// rate-limits a CI runner, a release URL 404s for ninety seconds during a tag
// push, and the build that had nothing wrong with it goes red. The link to
// github.com is reviewed by a person once; the link to `/spec/rules/` is
// broken by a routine deletion, and only one of those two needs a gate.
//
// Also not seen: what JavaScript fetches at runtime. The playground loads a
// wasm module by path when a reader presses Run, and that path is data in
// `records/`, checked against the iyi tree by `scripts/records.mjs`, which is
// where a wrong one belongs.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");

/* The tree to walk, `dist` unless another is named. The argument exists so a
 * copy of the output can be broken on purpose and the gate run against it:
 * every gate on this site is proven by a deliberate regression, and doing that
 * to the real `dist` means rebuilding to get it back. */
const dist = resolve(site, process.argv[2] ?? "dist");

/* The serving rules are the config's, not this file's. Repeating "the origin
 * is iyi.dev and the base is /" here would be a second place for them to
 * disagree, and the config is the one the build obeys. */
const config = (await import(resolve(site, "astro.config.mjs"))).default;
const origin = new URL(config.site).origin;
const base = config.base.endsWith("/") ? config.base : `${config.base}/`;

/* ------------------------------------------------------------------------ */

function htmlFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...htmlFiles(path));
    else if (name.endsWith(".html")) found.push(path);
  }
  return found;
}

/** The URL a file under dist is served at, with the base prefix. */
const routeOf = (file) => {
  const rel = relative(dist, file).split(/[\\/]/).join("/");
  return base + rel.replace(/index\.html$/, "");
};

/** Every id and legacy anchor name a document offers as a jump target. */
function anchorsOf(html) {
  const found = new Set();
  for (const [, id] of html.matchAll(/\sid="([^"]*)"/g)) found.add(id);
  for (const [, name] of html.matchAll(/<a[^>]+\sname="([^"]*)"/g)) found.add(name);
  return found;
}

/* Schemes a browser hands to something other than this site. `data:` and
 * `blob:` carry their own bytes; the rest leave for a mail client or another
 * origin. None of them is ours to resolve. */
const OFF_SITE = /^(?:[a-z][a-z0-9+.-]*:)?\/\/|^(?:mailto|tel|data|blob|javascript):/i;

/**
 * Where a reference points inside dist, or null when it points off the site.
 * Returns the path on disk that must exist plus the fragment to look for in
 * it, because the two are checked against different things and a link like
 * `/learn/#lessons` is wrong in two distinguishable ways.
 */
function target(ref, fromFile) {
  const raw = ref.trim();
  if (raw === "") return null;

  let url = raw;
  if (url.startsWith(`${origin}/`) || url === origin) {
    // Absolute against our own domain: the canonical tag and og:url are
    // written this way because a crawler needs an absolute URL. It is still
    // an internal link and a deletion still strands it.
    url = url.slice(origin.length) || "/";
  } else if (OFF_SITE.test(url)) {
    return null;
  }

  const hash = url.indexOf("#");
  const fragment = hash === -1 ? "" : decodeURIComponent(url.slice(hash + 1));
  let path = hash === -1 ? url : url.slice(0, hash);
  path = path.split("?")[0];

  if (path === "") {
    // A bare `#id`: the target is the document carrying the reference.
    return { file: fromFile, fragment, url: raw };
  }

  const abs = path.startsWith("/")
    ? path
    : posix.resolve(posix.dirname(routeOf(fromFile)), decodeURIComponent(path));

  if (!abs.startsWith(base)) {
    // Outside the base the site is served under: not a path this build emits.
    return { file: null, fragment, url: raw };
  }

  const within = decodeURIComponent(abs.slice(base.length));
  const onDisk = within.endsWith("/") || within === ""
    ? join(dist, within, "index.html") // trailingSlash: "always"
    : join(dist, within);

  return { file: onDisk, fragment, url: raw };
}

/* ------------------------------------------------------------------------ */

const broken = [];
const dangling = [];
const unlabelled = [];

let references = 0;
let external = 0;
let fragments = 0;
let images = 0;

const pages = htmlFiles(dist);
const anchors = new Map(); // file -> ids, read once per target document
const exists = new Map();

const present = (file) => {
  if (!exists.has(file)) {
    let ok = false;
    try {
      ok = statSync(file).isFile();
    } catch {
      ok = false;
    }
    exists.set(file, ok);
  }
  return exists.get(file);
};

const idsOf = (file) => {
  if (!anchors.has(file)) anchors.set(file, anchorsOf(readFileSync(file, "utf8")));
  return anchors.get(file);
};

for (const file of pages) {
  const html = readFileSync(file, "utf8");
  const page = routeOf(file);

  /* `href`, `src`, and every candidate in a `srcset`. A `content="https://..."`
   * on a meta tag is a claim about the page rather than a fetch, except og:url,
   * and that URL is the canonical link's href too, so it is already covered.
   *
   * srcset is here for the day someone adds a responsive image rather than
   * because one exists: a candidate list is where a wrong path hides best,
   * since the browser silently falls back to another candidate and the
   * screenshot looks right at the reviewer's window size. */
  const refs = [];
  for (const [, tag, , ref] of html.matchAll(/<(\w+)[^>]*?\s(href|src)="([^"]*)"/g)) {
    refs.push([tag, ref]);
  }
  for (const [, tag, set] of html.matchAll(/<(\w+)[^>]*?\ssrcset="([^"]*)"/g)) {
    for (const candidate of set.split(",")) refs.push([tag, candidate.trim().split(/\s+/)[0]]);
  }

  for (const [tag, ref] of refs) {
    const hit = target(ref, file);
    if (hit === null) {
      external += 1;
      continue;
    }
    references += 1;

    if (hit.file === null || !present(hit.file)) {
      broken.push(`${page}: <${tag}> to ${hit.url} - nothing at ${
        hit.file === null
          ? "that path under the site base"
          : join(basename(dist), relative(dist, hit.file))
      }`);
      continue;
    }

    if (hit.fragment === "" || !hit.file.endsWith(".html")) continue;
    fragments += 1;
    /* `#top` is defined by the HTML standard as the top of the document and
     * needs no element to carry it. */
    if (hit.fragment === "top") continue;
    if (!idsOf(hit.file).has(hit.fragment)) {
      dangling.push(
        `${page}: <${tag}> to ${hit.url} - ${
          hit.file === file ? "this page" : `/${relative(dist, hit.file).replace(/index\.html$/, "")}`
        } carries no id "${hit.fragment}"`,
      );
    }
  }

  /* The attribute, not its contents: `alt=""` is the correct alternative for a
   * decorative image and this must not push anyone into writing prose for the
   * masthead's mark.
   *
   * A bare `alt` counts, and it has to: Astro's image component emits
   * `<img ... alt loading="lazy">` for `alt=""`, which HTML defines as the
   * empty string, and a gate that demanded the `=` would fail the build over
   * the component's own serialisation. The lookahead is what keeps `data-alt`
   * and `altitude` from passing for it. */
  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) {
    images += 1;
    if (/\salt(?=[\s=>/])/.test(img)) continue;
    const src = /\ssrc="([^"]*)"/.exec(img);
    unlabelled.push(`${page}: <img src="${src ? src[1] : "?"}"> has no alt attribute`);
  }
}

/* ------------------------------------------------------------------------ */

/* Every category is reported before the exit, not the first one only. A gate
 * that stops at its first finding turns one build into three: fix the link,
 * rebuild, learn about the fragment, rebuild, learn about the image. */
const report = (problems, headline, remedy) => {
  if (problems.length === 0) return 0;
  console.error(`\nlinks: ${headline}\n`);
  for (const line of problems.slice(0, 40)) console.error(`  ${line}`);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  console.error(`\n${remedy}\n`);
  return problems.length;
};

const found =
  report(
    broken,
    `${broken.length} internal reference${broken.length === 1 ? "" : "s"} in the built site ` +
      `point${broken.length === 1 ? "s" : ""} at something this build does not produce.`,
    "A deleted route is the usual cause: this site cut 58 of them in one pass. Either\n" +
      "restore the target or rewrite the link. The site is served with\n" +
      'trailingSlash: "always", so a route is `/learn/` and never `/learn`.',
  ) +
  report(
    dangling,
    `${dangling.length} fragment link${dangling.length === 1 ? "" : "s"} name${
      dangling.length === 1 ? "s" : ""
    } an id no document carries.`,
    "The link still navigates, to the top of the target page, so nothing looks\n" +
      "broken to anyone who does not already know where they were going. Fix the\n" +
      "fragment or give the target an id.",
  ) +
  report(
    unlabelled,
    `${unlabelled.length} image${unlabelled.length === 1 ? "" : "s"} carr${
      unlabelled.length === 1 ? "ies" : "y"
    } no alt attribute.`,
    'A screen reader falls back to the file name, so an image with no alt is read\n' +
      'out as "mascot dot png". Write what the image says, or alt="" if it says\n' +
      "nothing a reader needs.",
  );

if (found > 0) process.exit(1);

console.log(
  `links: ${pages.length} pages, ${references} internal references ` +
    `(${fragments} with a fragment) all resolve, ${images} images all labelled, ` +
    `${external} external URLs not followed`,
);
