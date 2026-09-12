#!/usr/bin/env node
// Belt and braces for the one rule the site cannot bend.
//
// The components already make hand-transcribed numbers unnecessary: Measure
// and Stamped take keys, not values, and throw when a key is absent. This gate
// makes transcription impossible to do quietly. It scans the authored
// directories for a recorded value written next to a time or size unit, and
// fails the build naming the file and the line, so a stray "0.13 s" typed into
// a paragraph is a build failure rather than a page.
//
// It is deliberately narrow. It looks for a decimal number followed by a time
// or size unit, which is the shape of a recorded measurement. It does not flag
// CSS values, line numbers, version strings, or structural counts, because a
// gate that flags everything teaches people to disable it.
//
// In a stylesheet only comments are read. `--quick: 150ms ease` is a duration
// the browser consumes and `transition: background-color 120ms ease` is the
// same; neither is a figure a reader is shown. A sentence in a comment is
// prose, and prose in `src/styles` reached a page once as five contrast ratios
// four of which were wrong. `scripts/contrast.mjs` computes those, and this
// covers the rest of the shapes for the directory it used to skip.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = join(here, "..", "src");

// Authored directories. `lib` and `playground` are here because the playground
// moved copy into TypeScript: the engine and the shell write sentences about
// bytes and milliseconds into the console, and a figure typed into one of those
// sentences would reach a reader exactly like a figure typed into a paragraph.
// `styles` is here for its comments, per the note above.
const SCAN = ["pages", "components", "layouts", "content", "lib", "playground", "styles"];

// A decimal with a unit, allowing the common authored spellings. The unit must
// be a time or size unit; a bare number is a structural count and is legal.
const RECORDED = /\b\d+(?:\.\d+)?\s*(?:seconds|second|secs|sec|ms|s|KB|MB)\b/;
// Things that are not measurements but match the shape.
const ALLOWED = [
  // CSS values are never read: a stylesheet contributes its comments only.
];

/** A stylesheet's comment text, line-numbered as it sits in the file. */
function cssComments(text) {
  const lines = text.split("\n").map(() => "");
  for (const match of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
    const first = text.slice(0, match.index).split("\n").length - 1;
    match[0].split("\n").forEach((line, index) => {
      lines[first + index] = line;
    });
  }
  return lines;
}

const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.(astro|mdx|md|ts|css)$/.test(entry)) continue;
    const raw = readFileSync(path, "utf8");
    /* A stylesheet is read for its comments; every other file is read whole. */
    const text = entry.endsWith(".css") ? cssComments(raw).join("\n") : raw;
    text.split("\n").forEach((line, index) => {
      if (!RECORDED.test(line)) return;
      if (ALLOWED.some((a) => line.includes(a))) return;
      hits.push({
        file: relative(root, path),
        line: index + 1,
        text: line.trim(),
      });
    });
  }
}

for (const dir of SCAN) {
  walk(join(root, dir));
}

if (hits.length > 0) {
  console.error(
    "no-transcription: a recorded number is written into authored copy.\n" +
      "Recorded numbers (seconds, KB, ms) must arrive from facts.json through\n" +
      "Measure or Stamped, never typed into a page. A transcribed figure is\n" +
      "the exact dishonesty this site exists to argue against.\n",
  );
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}  ${hit.text}`);
  }
  process.exit(1);
}

console.log("no-transcription: no recorded number is hand-typed in authored copy");
