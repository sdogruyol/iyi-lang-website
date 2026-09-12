#!/usr/bin/env node
// The build-time gate over glued prose.
//
// THE DEFECT THIS EXISTS FOR, because it is invisible in the source and obvious
// on the page. Astro's templates drop the whitespace between a run of text and
// an inline element when the two are separated by a line break, so this, which
// is the natural way to write a paragraph that fits a column:
//
//     This page is the recording behind the
//     <a href="...">playground</a>.
//
// renders as "the recording behind theplayground". The source looks correct, a
// reviewer reads past it, and the words are welded together in the built HTML.
// It happened six times in one pass over three pages, which is what makes it a
// class rather than a typo: the same keystroke habit produces it every time.
//
// So it is gated rather than proofread. This runs over the built HTML, which is
// the only place the defect exists, and it fails the build naming the page and
// the two words it welded.
//
// WHAT IS DELIBERATELY NOT A HIT. Code listings on this site are a token stream
// from the compiler's own lexer, and adjacent tokens legitimately abut with no
// space between their spans: `puts` and `(` are two tokens and one has to
// follow the other. So the contents of a source block, a console block, a
// diagnostic block and the editor's ink layer are cut out before the scan.
// Scanning them would produce a hit on every listing on the site, which is the
// fastest way to make a gate that nobody trusts and everybody disables.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const dist = resolve(site, "dist");

// The inline elements prose actually wraps a word in. A block element on its
// own line is not a defect: `</p><p>` has no space between it and that is
// correct, because the two are different paragraphs.
const INLINE = "a|code|strong|em|b|i|span|abbr|kbd|dfn";

// Blocks whose insides are a token stream rather than prose. Matched by class
// because that is what the site's own CSS keys on, so a new block type that
// wants the exemption has to say so in the same vocabulary.
const LISTINGS =
  /<(pre|figure|div)[^>]*class="[^"]*(?:source|console|diagnostic|editor-ink|editor|cases|case|stamped|recording)[^"]*"[\s\S]*?<\/\1>/g;

function htmlFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...htmlFiles(path));
    else if (name.endsWith(".html")) found.push(path);
  }
  return found;
}

// Strip what must not be scanned, replacing each cut with a newline so the
// characters either side of a removed block cannot be read as adjacent.
function proseOnly(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "\n")
    .replace(/<style[\s\S]*?<\/style>/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "\n")
    .replace(/<textarea[\s\S]*?<\/textarea>/g, "\n")
    .replace(LISTINGS, "\n");
}

/* The rendered words and nothing else, for the check that has no tag to
 * anchor on. Every tag becomes a newline, so a weld that spans an element is
 * left to `closing` above and this sees only text that really is adjacent on
 * the page. `<head>` goes first: a hashed asset name like
 * `favicon-32.png` is a digit welded to letters in every sense except the one
 * that matters. */
function textOnly(html) {
  return proseOnly(html)
    .replace(/<head[\s\S]*?<\/head>/g, "\n")
    .replace(/<[^>]*>/g, "\n");
}

const problems = [];

for (const file of htmlFiles(dist)) {
  const page = relative(dist, file);
  const prose = proseOnly(readFileSync(file, "utf8"));
  const text = textOnly(readFileSync(file, "utf8"));

  /* The character classes. `WORD` is a letter, which is what the gate first
   * looked for on both sides of a tag. `EDGE` is what may legitimately end a
   * run of prose before an inline element closes: a letter, a digit, or the
   * punctuation a sentence ends on.
   *
   * DIGITS AND PUNCTUATION WERE THE GATE'S BLIND SPOT, and both had already
   * reached the published site. `all <Measure of="targets" />` welded to the
   * next line rendered "9every push", and a `</strong>` after a full stop
   * rendered "checked that.There is no grammar": a figure and a sentence end,
   * neither of which is a letter, so neither was read. A number fused to the
   * word after it is the worst case this gate has, because a figure is the one
   * thing on this site that has to be legible to be checkable. */
  const WORD = "A-Za-z\\u00c0-\\u024f";
  const EDGE = `${WORD}0-9.,;:%)\\]`;

  // A word, then an inline element opening with no whitespace between them.
  const opening = new RegExp(`([${WORD}]{2,})<(?:${INLINE})\\b[^>]*>([${WORD}])`, "g");
  /* An inline element closing, then a word, with no whitespace between them.
   *
   * A LEGITIMATE CASE THIS DELIBERATELY LETS THROUGH, found by the gate's own
   * first run getting it wrong. English inflects a code identifier by hanging
   * the suffix outside the span: `dlopen`ed, `impl`s, `trait`s. That renders
   * as one word on purpose, the code boundary is where the symbol actually
   * ends, and "fixing" it means either claiming `dlopened` is a symbol or
   * putting a space inside a word. So a run of four or more letters after a
   * closing tag is a welded word, and anything shorter is taken as an
   * inflection and allowed. That draws the line in the wrong place for a real
   * defect whose second word happens to be short, and it is the right trade:
   * this gate exists to catch a keystroke habit, and a gate that fires on
   * correct typography gets edited out of the build.
   */
  const closing = new RegExp(`([${EDGE}])<\\/(?:${INLINE})>([${WORD}]{4,})`, "g");

  /* A figure welded to the word after it with no element between them at all.
   *
   * `{facts.structural.generated.toLocaleString("en-GB")}` at the end of a
   * line, with `line project` on the next, rendered "7,207line project". There
   * is no tag on either side of that weld, so neither pattern above can see
   * it, and it is the same keystroke habit with a bare expression instead of a
   * component.
   *
   * THREE THINGS THAT ARE NOT WELDS, each found by running this over the whole
   * quoted SPEC.md and CHANGELOG.md:
   *
   * A unit. A figure and its unit abut on purpose everywhere on this site:
   * `9x`, `36KB`, `1.6ms`.
   *
   * A dotted name. `libgc.so.1.dylib`, `iyi-0.11.0-linux-x86_64.tar.gz` and
   * `3.priced_like(item)` all put letters straight after a dot, so the figure
   * is not allowed to end on one: a digit run may carry `.` only between
   * digits.
   *
   * A digest. `wasmtime 48.0.1 (7bac2c277` reads as 7 welded to "bac". A
   * letter run drawn entirely from the hex alphabet is the tail of a hash, not
   * a word, and no English word this site uses is spelled only in a-f. */
  const UNIT = /^(?:x|s|ms|kb|mb|gb|px|rem|em|ch|vw|vh|st|nd|rd|th|bit|bits|byte|bytes)$/;
  const HEX = /^[a-f]+$/;
  const figure = new RegExp(`(?<![${WORD}0-9&#.])(\\d[\\d,]*(?:\\.\\d+)*)([a-z]{2,})`, "g");

  for (const match of prose.matchAll(opening)) {
    problems.push(`${page}: "${match[1]}" is welded to "${match[2]}..."`);
  }
  for (const match of prose.matchAll(closing)) {
    problems.push(`${page}: "...${match[1]}" is welded to "${match[2]}"`);
  }
  for (const match of text.matchAll(figure)) {
    if (UNIT.test(match[2]) || HEX.test(match[2])) continue;
    problems.push(`${page}: "${match[1]}" is welded to "${match[2]}..."`);
  }
}

if (problems.length > 0) {
  const shown = problems.slice(0, 40);
  throw new Error(
    `prose: ${problems.length} place${problems.length === 1 ? "" : "s"} in the ` +
      `built HTML weld a word or a figure to the one after it, so the ` +
      `page reads as one run-together word where the source reads correctly:\n\n` +
      shown.map((line) => `  ${line}`).join("\n") +
      (problems.length > shown.length
        ? `\n  ... and ${problems.length - shown.length} more`
        : "") +
      `\n\nAstro drops the whitespace between text and an inline element when a ` +
      `line break separates them. Put the space back explicitly with {" "} ` +
      `before the element, or keep the element on the same line as the word ` +
      `before it.\n`,
  );
}

const pages = htmlFiles(dist).length;
console.log(
  `prose: ${pages} built pages carry no word welded to an inline element`,
);
