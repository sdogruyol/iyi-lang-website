#!/usr/bin/env node
// What the language is built for, in its own words.
//
// WHY THIS IS GENERATED AND NOT WRITTEN. The site's first line says iyi is a
// language for people and their agents. That is a positioning claim, and a
// positioning claim written by a website about a compiler is marketing. The
// compiler's repository states the same thing as a design record: AI_FIRST.md
// §1 names four properties an agent-first language has to hold, says which two
// iyi holds by language rule rather than by tooling effort, and names the
// rules that do it. Those are the sentences the page prints, lifted.
//
// So the site does not argue that agents are a first-class audience. It quotes
// the design record that decided they would be, beside a recording of the
// result. If §1 is rewritten, this page changes with it; if §1 is deleted, the
// build fails rather than leaving the claim standing unsupported.
//
// WHAT IT DOES NOT DO. It does not check that the four properties hold. §1
// itself only claims two of them by rule, and the page says so. The
// measurement that decides whether any of it worked is AI_FIRST.md §5, which
// reaches the site as `facts.recorded.context_pack` through
// `bench/site_facts.py`, in a card with the machine that produced it.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated");

const SOURCE = "AI_FIRST.md";

const text = (() => {
  try {
    return readFileSync(resolve(repo, SOURCE), "utf8");
  } catch {
    throw new Error(
      `thesis: cannot read ${SOURCE} in ${repo}. It is where this project ` +
        `writes down what an agent-first language has to hold, and the site ` +
        `quotes it rather than asserting it.`,
    );
  }
})();

const lines = text.split("\n");

/* The section, by its own heading, and only as far as the next one. */
const section = (() => {
  const start = lines.findIndex((line) => /^##\s+1\.\s+The thesis\s*$/.test(line));
  if (start === -1) {
    throw new Error(
      `thesis: ${SOURCE} has no "## 1. The thesis" heading. The section this ` +
        `page is built on moved or was renamed.`,
    );
  }
  let end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  if (end === -1) end = lines.length;
  return { start, end, body: lines.slice(start + 1, end) };
})();

/** A markdown paragraph's lines joined into one, as prose rather than as a file. */
const unwrap = (rows) => rows.join(" ").replace(/\s+/g, " ").trim();

/* The four properties. Numbered `N. **Name.** body`, wrapped over as many
 * lines as the file wanted, and the wrap is not content. */
const properties = (() => {
  const found = [];
  let open = null;
  for (const line of section.body) {
    const head = /^(\d+)\.\s+\*\*(.+?)\.\*\*\s*(.*)$/.exec(line);
    if (head) {
      if (open) found.push(open);
      open = { number: Number(head[1]), name: head[2], rows: [head[3]] };
      continue;
    }
    if (open && /^\s{2,}\S/.test(line)) {
      open.rows.push(line.trim());
      continue;
    }
    if (open && line.trim() === "") {
      found.push(open);
      open = null;
    }
  }
  if (open) found.push(open);

  if (found.length === 0) {
    throw new Error(
      `thesis: ${SOURCE} §1 lists no property shaped "N. **Name.** ...", so ` +
        `there is nothing to print. The list's shape moved.`,
    );
  }
  for (const [index, property] of found.entries()) {
    if (property.number !== index + 1) {
      throw new Error(
        `thesis: ${SOURCE} §1 numbers its properties ` +
          `${found.map((p) => p.number).join(", ")}, which is not 1 to ` +
          `${found.length}. The page prints the numbers, so it cannot print these.`,
      );
    }
  }
  return found.map(({ number, name, rows }) => ({ number, name, text: unwrap(rows) }));
})();

/**
 * The sentence that is the whole reason this section is on the site: which of
 * the four iyi holds by rule rather than by effort, and which rules do it.
 *
 * Parsed rather than quoted whole, because the page needs the numbers to
 * mark the right properties. A sentence that stops naming them fails here.
 */
const held = (() => {
  const paragraph = unwrap(section.body);
  const claim = /iyi holds ([\d\s,and]+?) \*\*(by language rule[^*]*)\*\*\.\s*(.+?)(?:\s{2,}|$)/.exec(paragraph);
  if (!claim) {
    throw new Error(
      `thesis: ${SOURCE} §1 no longer says which of its properties iyi holds ` +
        `by language rule. That sentence is the claim this page exists to ` +
        `quote; without it the page would be asserting it instead.`,
    );
  }
  const numbers = claim[1].match(/\d+/g).map(Number);
  for (const number of numbers) {
    if (!properties.some((property) => property.number === number)) {
      throw new Error(
        `thesis: ${SOURCE} §1 says iyi holds property ${number} by rule and ` +
          `lists no such property.`,
      );
    }
  }
  /* The rules the sentence names, in the order it names them. The site already
   * states every one of them, generated from SPEC.md into rules.json, so a
   * rule named here and absent there is a disagreement worth failing on. */
  const rules = [...claim[3].matchAll(/\bR-\d[a-z]?\b/g)].map((match) => match[0]);
  if (rules.length === 0) {
    throw new Error(
      `thesis: ${SOURCE} §1 claims iyi holds ${numbers.join(" and ")} by ` +
        `language rule and names no rule that does it.`,
    );
  }
  const stated = JSON.parse(readFileSync(resolve(out, "rules.json"), "utf8"));
  for (const rule of rules) {
    if (!(rule in stated)) {
      throw new Error(
        `thesis: ${SOURCE} §1 names ${rule} and SPEC.md's rule table does ` +
          `not state it, so the site cannot show the two together.`,
      );
    }
  }
  return { numbers, how: claim[2], rules, sentence: `iyi holds ${claim[1].trim()} ${claim[2]}.` };
})();

/* Readback. Every property's name and text has to be findable in the section
 * it came from, so an unwrap that dropped or reordered a clause fails here
 * rather than reaching a page as a paraphrase. */
const sourceProse = unwrap(section.body);
for (const property of properties) {
  if (!sourceProse.includes(property.text)) {
    throw new Error(
      `thesis: "${property.name}" does not read back into ${SOURCE} §1, so ` +
        `this generator changed the words on the way out.`,
    );
  }
}

const commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

mkdirSync(out, { recursive: true });
writeFileSync(
  resolve(out, "thesis.json"),
  `${JSON.stringify(
    {
      provenance: {
        generator: "scripts/thesis.mjs",
        source: SOURCE,
        section: "1. The thesis",
        line: section.start + 1,
        commit,
      },
      properties,
      held,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `thesis: ${properties.length} properties from ${SOURCE} §1 line ` +
    `${section.start + 1} (${properties.map((p) => p.name.toLowerCase()).join(", ")}), ` +
    `${held.numbers.join(" and ")} held by ${held.rules.join(", ")}, at ${commit}`,
);
