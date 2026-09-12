#!/usr/bin/env node
// The releases, read out of CHANGELOG.md's headings.
//
// WHAT THIS REPLACED. `scripts/reference.mjs` cut SPEC.md into 56 pages and
// quoted CHANGELOG.md whole, because the site published both. It no longer
// does: a design record marked Draft 0, whose Part III is open questions and
// whose Appendix B is decisions awaiting a call, is not documentation, and 57
// of the site's 128 routes were serving it with no page anywhere linking in.
// Both files stay in the repository, where they are read as what they are.
//
// WHAT SURVIVED, and why this script exists at all. The changelog is still the
// only place the current version number is written down, and the site prints
// it in the masthead's colophon, on the home page, on the install page and in
// llms.txt, and builds the release's tarball URLs out of it. A version is a
// fact about the tree like every other figure here, so it is read, never
// typed. This is the whole of what the site needs from CHANGELOG.md.
//
// It fails rather than defaulting. A changelog whose first heading stopped
// reading as "version — date" means the site does not know what the current
// release is, and a site that guesses that is worse than one that does not
// build.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated");

const SOURCE = "CHANGELOG.md";

/* A release heading, as CHANGELOG.md writes it: `## 0.12.0 — 2026-09-11`. The
 * dash is an em dash in the file and a hyphen in older entries, so both are
 * accepted; anything else at this level is a heading that is not a release
 * (`Unreleased`, and whatever comes next) and is skipped rather than guessed
 * at. */
const HEADING = /^##\s+(\d+\.\d+\.\d+)\s+[—-]+\s+(\d{4}-\d{2}-\d{2})\s*$/;

const text = (() => {
  try {
    return readFileSync(resolve(repo, SOURCE), "utf8");
  } catch {
    throw new Error(
      `releases: cannot read ${SOURCE} in ${repo}. It is where this project ` +
        `writes down which release is current, so without it the site cannot ` +
        `say.`,
    );
  }
})();

const releases = [];
text.split("\n").forEach((line, index) => {
  const match = HEADING.exec(line);
  if (!match) return;
  releases.push({ version: match[1], date: match[2], line: index + 1 });
});

if (releases.length === 0) {
  throw new Error(
    `releases: no heading in ${SOURCE} reads as "## version — date", so the ` +
      `site cannot say which release is current. The heading shape moved.`,
  );
}

const commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

mkdirSync(out, { recursive: true });
writeFileSync(
  resolve(out, "releases.json"),
  `${JSON.stringify(
    { provenance: { generator: "scripts/releases.mjs", source: SOURCE, commit }, releases },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `releases: ${releases.length} in ${SOURCE}, latest ${releases[0].version} ` +
    `of ${releases[0].date}, at ${commit}`,
);
