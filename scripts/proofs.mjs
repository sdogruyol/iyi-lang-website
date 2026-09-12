#!/usr/bin/env node
// What CI actually proves, per target.
//
// `scripts/targets.mjs` already reads which platforms exist and which five are
// run, and the why page prints them as a list of triples. A list of triples is
// the weakest form of the claim: "supports the platform" is what everyone
// says, and what nobody's CI checks. The workflow checks it in three different
// senses, and they are not the same sense:
//
//   1. TYPE-CHECKED. The library's `src/lib_c` and `src/crystal/system` for
//      that platform compile. Catches a declaration that went missing.
//   2. AUDITED. An iyi program is cross-compiled for it and the object is read
//      for what it asks the machine for. Catches a call nothing supplies,
//      which is how `__multi3` went missing on wasm32 and arm: a target that
//      type-checks can still emit one.
//   3. RUN. The object is linked and executed somewhere that is that platform,
//      and what it prints is compared with what the same program printed on
//      the machine that built it.
//
// Three of the nine reach (3). Saying so with the jobs named is the difference
// between a portability claim and a portability table, so this script reads
// the jobs rather than letting a page assert them.
//
// HOW IT READS THEM. Both loops are found by their step's own name, and the
// target list inside each is read from the `for target in ...` line with its
// continuations. The cross-compiles are found as literal `--target <triple>`
// occurrences, attributed to the job and step they sit in. The jobs that run
// what was cross-compiled are found by their `needs:` naming the job that
// produced the objects - the dependency edge is the fact, and a job that stops
// needing those objects stops being evidence here.
//
// THE GATE. The nine targets this script finds in the type-check loop have to
// be the nine `src/generated/targets.json` already publishes. Two scripts read
// one workflow; if they disagree, one of them is reading a loop that moved,
// and the site will not publish either reading until they agree.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const generated = resolve(site, "src", "generated");
const out = resolve(generated, "proofs.json");

const WORKFLOW = ".github/workflows/iyi.yml";
const TYPECHECK_STEP = "Type-check the standard library for each target";
const AUDIT_STEP = "What an iyi program asks each platform for";

const die = (message) => {
  throw new Error(message);
};

const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

const lines = readFileSync(resolve(repo, WORKFLOW), "utf8").replace(/\n$/, "").split("\n");

// ---------------------------------------------------------------------------
// The jobs
// ---------------------------------------------------------------------------

const jobs = [];
lines.forEach((line, index) => {
  const start = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
  if (start) jobs.push({ id: start[1], line: index + 1, name: null, needs: [], steps: [] });
  if (jobs.length === 0) return;
  const job = jobs[jobs.length - 1];
  const name = /^ {4}name:\s*"?([^"]+?)"?\s*$/.exec(line);
  if (name) job.name ??= name[1];
  const needs = /^ {4}needs:\s*(.+)$/.exec(line);
  if (needs) {
    job.needs = needs[1]
      .replace(/[[\]]/g, "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  const step = /^ {6}- name:\s*(.+?)\s*$/.exec(line);
  if (step) job.steps.push({ name: step[1], line: index + 1 });
});

if (jobs.length === 0) die(`${WORKFLOW} declares no job this script can read, so there is nothing to cite`);

/** The job a line sits in. */
const jobAt = (line) => {
  let found = null;
  for (const job of jobs) {
    if (job.line <= line) found = job;
  }
  return found;
};

/** The step a line sits in, within its job. */
const stepAt = (line) => {
  const job = jobAt(line);
  let found = null;
  for (const step of job?.steps ?? []) {
    if (step.line <= line) found = step;
  }
  return found;
};

// ---------------------------------------------------------------------------
// The two loops
// ---------------------------------------------------------------------------

/** The `for X in a b c; do` list a step opens with, continuations included. */
const loopList = (stepName, variable) => {
  const at = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  if (at < 0) {
    die(
      `${WORKFLOW} has no step named "${stepName}" any more. It is one of the ` +
        `two loops the portability page cites, so the site cannot say what CI ` +
        `checks until the step is found again.`,
    );
  }
  let start = at;
  while (start < lines.length && !new RegExp(`for ${variable} in `).test(lines[start])) {
    start++;
    if (/^ {6}- name:/.test(lines[start])) {
      die(`the step "${stepName}" no longer loops over ${variable}, so this script cannot say which platforms it covers`);
    }
  }
  let end = start;
  let text = lines[start];
  while (/\\$/.test(lines[end])) {
    end++;
    text = `${text.replace(/\\$/, "")} ${lines[end].trim()}`;
  }
  const list = /for \w+ in (.+?); do/.exec(text);
  if (!list) die(`${WORKFLOW}:${start + 1} opens a loop this script cannot read the list out of`);
  // The loop as it is written, dedented out of the YAML block scalar, so the
  // page can show the line rather than a list this script retyped.
  const source = lines.slice(start, end + 1);
  const indent = Math.min(...source.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  return {
    step: stepName,
    values: list[1].trim().split(/\s+/),
    text: source.map((line) => line.slice(indent)).join("\n"),
    from: start + 1,
    to: end + 1,
    cite: `${WORKFLOW}, ${start === end ? `line ${start + 1}` : `lines ${start + 1} to ${end + 1}`}`,
    job: jobAt(start + 1).id,
  };
};

const typecheck = loopList(TYPECHECK_STEP, "target");
const audit = loopList(AUDIT_STEP, "target");
const samples = loopList(AUDIT_STEP, "sample");

// The gate: this script's reading of the loop against the one the site already
// publishes.
const published = JSON.parse(readFileSync(resolve(generated, "targets.json"), "utf8"));
const disagreement = [
  ...typecheck.values.filter((target) => !published.typechecked.includes(target)),
  ...published.typechecked.filter((target) => !typecheck.values.includes(target)),
];
if (disagreement.length > 0) {
  die(
    `this script reads the type-check loop as ${typecheck.values.join(", ")} and ` +
      `src/generated/targets.json says ${published.typechecked.join(", ")}. ` +
      `They differ on ${[...new Set(disagreement)].join(", ")}: one of the two ` +
      `is reading a loop that moved.`,
  );
}

// One platform, two spellings. The type-check loop writes the Windows GNU
// target as `x86_64-w64-mingw32` and the audit loop writes it as
// `x86_64-windows-gnu`; both are the compiler's own names for it, and
// scripts/targets.mjs carries the same kind of table for README's prose
// ("x86-64 glibc" against `x86_64-linux-gnu`). Without this, the page would
// show a target as not audited beside a line auditing it under its other
// name, which is worse than either spelling.
const ALIAS = new Map([["x86_64-windows-gnu", "x86_64-w64-mingw32"]]);
const auditedHere = audit.values.map((target) => ALIAS.get(target) ?? target);

// And the same gate over the audit set. scripts/targets.mjs derives it from
// README's sentence about which targets are exempt; this script reads the loop
// itself. Two independent readings of one fact, so a disagreement means one of
// them is wrong rather than that the page has a choice to make.
if (Array.isArray(published.audited)) {
  const apart = [
    ...auditedHere.filter((target) => !published.audited.includes(target)),
    ...published.audited.filter((target) => !auditedHere.includes(target)),
  ];
  if (apart.length > 0) {
    die(
      `the audit loop covers ${auditedHere.join(", ")} and ` +
        `src/generated/targets.json says ${published.audited.join(", ")}. ` +
        `They differ on ${[...new Set(apart)].join(", ")}. One reads the ` +
        `workflow and one reads README.md: a page cannot publish both.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Every cross-compile, attributed
// ---------------------------------------------------------------------------

const crosses = [];
lines.forEach((line, index) => {
  for (const match of line.matchAll(/--target (?:"\$target"|([\w-]+))/g)) {
    if (!match[1]) continue;
    const job = jobAt(index + 1);
    const step = stepAt(index + 1);
    crosses.push({ target: match[1], job: job.id, jobName: job.name, step: step?.name ?? null, line: index + 1 });
  }
});
if (crosses.length === 0) {
  die(`${WORKFLOW} cross-compiles for no named target, so the objects the run jobs consume come from nowhere this script can see`);
}

// The job that produces the objects other jobs run: the one that cross-compiles
// most, found by counting rather than by name. Its runners are the jobs that
// say they need it. The dependency edge is the fact here; a job that stops
// needing those objects stops appearing as evidence.
const compiles = new Map();
for (const cross of crosses) compiles.set(cross.job, (compiles.get(cross.job) ?? 0) + 1);
const producerId = [...compiles].sort((a, b) => b[1] - a[1])[0]?.[0];
const producer = jobs.find((job) => job.id === producerId);
const runners = jobs.filter((job) => producer && job.needs.includes(producer.id));
if (!producer || runners.length === 0) {
  die(`${WORKFLOW} has no job whose objects another job runs, so the "run" column of the portability table would be empty`);
}

// ---------------------------------------------------------------------------
// Per target
// ---------------------------------------------------------------------------

const perTarget = published.typechecked.map((target) => {
  const built = crosses.filter((cross) => cross.target === target);
  return {
    target,
    typechecked: typecheck.values.includes(target),
    audited: auditedHere.includes(target),
    ran: published.ran.includes(target),
    how: published.how[target] ?? null,
    // Where an object for this target is built, and by which step. The same
    // target is often cross-compiled in several steps; each is a line.
    builds: built.map(({ job, jobName, step, line }) => ({ job, jobName, step, line })),
  };
});

const missingAudit = perTarget.filter((entry) => entry.ran && !entry.audited).map((entry) => entry.target);
if (missingAudit.length > 0 && missingAudit.length === perTarget.length) {
  die(`no target that is run is also audited, which means this script is reading the wrong loop`);
}

const record = {
  provenance: {
    generator: "scripts/proofs.mjs",
    source: WORKFLOW,
    claim: "src/generated/targets.json",
    commit,
  },
  loops: {
    typecheck,
    audit: { ...audit, samples: samples.values },
  },
  producer: { id: producer.id, name: producer.name, line: producer.line },
  runners: runners.map(({ id, name, line, steps }) => ({
    id,
    name,
    line,
    steps: steps.map((step) => step.name),
  })),
  targets: perTarget,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");

console.log(
  `proofs: ${perTarget.length} targets, ${typecheck.values.length} type-checked ` +
    `(${typecheck.cite}), ${audit.values.length} audited over ` +
    `${samples.values.length} programs (${audit.cite}), ${crosses.length} named ` +
    `cross-compiles, ${runners.length} jobs run what "${producer.name}" builds, ` +
    `at ${commit.slice(0, 9)}`,
);
