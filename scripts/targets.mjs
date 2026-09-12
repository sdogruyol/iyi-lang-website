#!/usr/bin/env node
// The platforms, read out of the repository rather than typed into a page.
//
// THE BUG THIS EXISTS TO PREVENT, because it had already happened. The why
// page carried the nine target triples as a literal array and the four it
// said were run as a literal set. README.md says five are run and has said so
// since darwin arm64 became a run target, so the site was publishing a number
// the tree contradicted - the exact drift the whole publication is arranged to
// refuse. `scripts/no-transcription.mjs` could not see it: a target triple
// carries no time or size unit, so it is not the shape that gate looks for.
//
// TWO SOURCES, BOTH IN THE REPOSITORY.
//
// The nine come from the workflow's own type-check loop, found by the same
// anchor `bench/doc_numbers.py` uses for its count, so the site's list and the
// repository's gate read one line. If the loop moves, both fail rather than
// one quietly reporting the old list.
//
// Which of the nine are run comes from README.md's portability row - the
// sentence a reader of the repository is shown. The row names them in
// platform spelling ("x86-64 glibc"), not in triples, so each phrase is
// matched back to a triple by scoring the triple's own components against the
// phrase's words. That is derivation, not a table: the only spellings this
// file knows are the two aliases below, and an ambiguous or unmatched phrase
// is a build failure naming the phrase, never a guess.
//
// WHAT IT DOES NOT DO. It does not verify that CI runs what README says it
// runs. It verifies that the site says what the repository says. A workflow
// whose jobs stopped running a target while both files still claimed it would
// pass here, exactly as every other generated figure on this site would.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated");

const WORKFLOW = ".github/workflows/iyi.yml";
const CLAIM = "README.md";

/**
 * Spellings the repository uses for one thing. A triple says `x86_64` and
 * `gnu`; the prose says `x86-64` and `glibc`. Both are names, not figures, and
 * this is the whole of what this file knows about how they map.
 */
const ALIAS = new Map([
  ["x86-64", "x86_64"],
  ["glibc", "gnu"],
]);

const read = (relative) => {
  try {
    return readFileSync(resolve(repo, relative), "utf8");
  } catch {
    throw new Error(
      `targets: cannot read ${relative} in ${repo}. The site restates that ` +
        `tree, so without it there are no platforms to print.`,
    );
  }
};

/* The nine, in the order the workflow type-checks them. Same anchor as
 * bench/doc_numbers.py's `targets()`. */
const typechecked = (() => {
  const text = read(WORKFLOW);
  const match = text.match(/Type-check the standard library[\s\S]*?for target in ([\s\S]*?); do/);
  if (!match) {
    throw new Error(
      `targets: the type-check target list moved in ${WORKFLOW}. This ` +
        `generator cannot find it, so it is not reading anything.`,
    );
  }
  const list = match[1].replace(/\\/g, " ").split(/\s+/).filter(Boolean);
  if (list.length === 0) {
    throw new Error(`targets: the type-check loop in ${WORKFLOW} names no target`);
  }
  return list;
})();

/* The run set, as README's portability row states it: the count in words and
 * one phrase per platform. */
const claimed = (() => {
  const text = read(CLAIM);
  const match = text.match(/is \*\*run\*\* on (\S+) of them every build: (.+?)\s*\|/);
  if (!match) {
    throw new Error(
      `targets: ${CLAIM}'s portability row no longer says how many targets ` +
        `are run every build, so the site has no claim to restate.`,
    );
  }
  const phrases = match[2]
    .split(",")
    .map((phrase) => phrase.trim().replace(/^and\s+/, ""))
    .filter(Boolean);
  return { count: match[1], phrases };
})();

/**
 * The words of a phrase, and the parts of any word that is itself hyphenated,
 * under the aliases above. `x86-64 glibc` yields `x86_64` and `gnu`;
 * `wasm32-wasi under wasmtime` yields `wasm32-wasi` and also `wasm32` and
 * `wasi`, because a triple is matched by its own components and the prose
 * sometimes spells a whole triple where it elsewhere spells a platform.
 *
 * Aliasing runs on the whole word before it is split, because `x86-64` is one
 * name whose parts mean nothing on their own.
 */
const words = (phrase) => {
  const named = new Set();
  for (const raw of phrase.toLowerCase().split(/[^\w-]+/)) {
    if (!raw) continue;
    const word = ALIAS.get(raw) ?? raw;
    named.add(word);
    if (!word.includes("-")) continue;
    for (const part of word.split("-")) named.add(ALIAS.get(part) ?? part);
  }
  return named;
};

/** How many of a triple's own components the phrase names. */
const score = (triple, phrase) => {
  const named = words(phrase);
  return triple.split("-").filter((part) => named.has(part)).length;
};

/* Match phrases to triples, the most specific phrase first, each triple
 * claimed once. Most specific first is what resolves `aarch64 under emulation`
 * against two aarch64 triples: `aarch64-darwin natively` names two components
 * and takes darwin, leaving exactly one aarch64 triple for the phrase that
 * names one. A phrase with no single best triple left is a failure. */
const ran = [];
const how = {};
const taken = new Set();
const ordered = [...claimed.phrases].sort(
  (a, b) =>
    Math.max(...typechecked.map((t) => score(t, b))) -
    Math.max(...typechecked.map((t) => score(t, a))),
);

for (const phrase of ordered) {
  const free = typechecked.filter((triple) => !taken.has(triple));
  const scored = free.map((triple) => ({ triple, points: score(triple, phrase) }));
  const best = Math.max(...scored.map((s) => s.points));
  const winners = scored.filter((s) => s.points === best);
  if (best === 0 || winners.length !== 1) {
    throw new Error(
      `targets: ${CLAIM} says "${phrase}" is run every build and that ` +
        `matches ${best === 0 ? "none" : winners.map((w) => w.triple).join(" and ")} ` +
        `of the targets ${WORKFLOW} type-checks. Name the platform the way the ` +
        `triple spells it, or teach this generator the spelling.`,
    );
  }
  taken.add(winners[0].triple);
  ran.push(winners[0].triple);
  how[winners[0].triple] = phrase;
}

/* The count README writes in words has to be the count of phrases it then
 * lists. A row that says five and names four is the drift this file is for. */
const SPELLED = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
if (SPELLED[ran.length] !== claimed.count) {
  throw new Error(
    `targets: ${CLAIM} says ${claimed.count} targets are run every build and ` +
      `then names ${ran.length}: ${ran.join(", ")}.`,
  );
}

/* And the nine have to be the nine the rest of the site already prints.
 * `facts.structural.targets` is the same list counted by the repository's own
 * gate, so a disagreement means one of the two readings is stale. */
const facts = JSON.parse(readFileSync(resolve(out, "facts.json"), "utf8"));
if (facts.structural.targets !== typechecked.length) {
  throw new Error(
    `targets: ${WORKFLOW} type-checks ${typechecked.length} targets and ` +
      `bench/doc_numbers.py counts ${facts.structural.targets}. The site ` +
      `prints both, so it cannot publish until they agree.`,
  );
}

const commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

/* Run targets in the order the workflow type-checks them, not the order the
 * prose lists them, so the page's badges follow the page's own list. */
const order = new Map(typechecked.map((triple, index) => [triple, index]));
ran.sort((a, b) => order.get(a) - order.get(b));

mkdirSync(out, { recursive: true });
writeFileSync(
  resolve(out, "targets.json"),
  `${JSON.stringify(
    {
      provenance: { generator: "scripts/targets.mjs", source: WORKFLOW, claim: CLAIM, commit },
      typechecked,
      ran,
      how,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `targets: ${typechecked.length} type-checked, ${ran.length} run every build ` +
    `(${ran.join(", ")}), at ${commit}`,
);
