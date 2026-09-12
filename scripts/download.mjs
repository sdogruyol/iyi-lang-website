#!/usr/bin/env node
// What the installer does before it unpacks anything, quoted out of the
// installer.
//
// THE GAP. The site tells a reader to pipe install.sh into sh and says
// nothing about what that script checks. install.sh downloads the release's
// SHA256SUMS, refuses a tarball whose digest does not match it, and unpacks
// nothing when it refuses; the release job writes that file with the same
// name. The word "checksum" appears nowhere on this site, so a reader
// deciding whether to run a pipe-to-shell has to go and read the script.
// That is a bad trade for the reader and a worse one for the project: the
// verification is a real answer to the real objection, and it was invisible.
//
// WHY QUOTING RATHER THAN DESCRIBING. Any sentence here about what install.sh
// checks is a sentence that stops being true the day the script changes, and
// a false claim about verification is the worst kind on a download page. So
// the three passages a reader needs are lifted verbatim with their line
// ranges, by anchor rather than by line number.
//
// THE CROSS-CHECK, which is the part that can fail: the file the installer
// downloads and the file the release job writes have to have the same name.
// Two halves of one promise living in two repositories' worth of YAML and
// shell, and if they drift the installer silently takes the "publishes no
// SHA256SUMS" branch and prints a note nobody reads. This script fails
// instead.
//
// WHAT IT CANNOT DO. A digest and a byte size are facts about a published
// artifact, which is on the network. Nothing here invents either: the page
// derives the artifact NAMES from the changelog's version, the way
// src/lib/release.ts already does, and says plainly that the digests live on
// the release page.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated", "download.json");

const INSTALLER = "install.sh";
const WORKFLOW = ".github/workflows/iyi.yml";

const die = (message) => {
  throw new Error(message);
};

const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

const installer = readFileSync(resolve(repo, INSTALLER), "utf8").replace(/\n$/, "").split("\n");
const workflow = readFileSync(resolve(repo, WORKFLOW), "utf8").replace(/\n$/, "").split("\n");

/**
 * A span of a file, found by the line that opens it and the line that closes
 * it, both matched as patterns. Anchors, not line numbers: a line number is a
 * guess about a file nobody edits with this site in mind.
 */
const span = (lines, file, name, open, close) => {
  const from = lines.findIndex((line) => open.test(line));
  if (from < 0) die(`${file} has no line matching ${open} any more, so the "${name}" passage cannot be quoted`);
  let to = from;
  while (to < lines.length && !close.test(lines[to])) to++;
  if (to >= lines.length) die(`${file}:${from + 1} opens the "${name}" passage and nothing after it matches ${close}`);
  // A comment block ends at the first bare `#`, which is a separator rather
  // than a line anybody wrote; quoting it would put an empty comment at the
  // bottom of the page.
  while (to > from && /^#\s*$/.test(lines[to])) to--;
  const text = lines.slice(from, to + 1);
  // Indented YAML, quoted as the shell a reader would run: the common
  // indentation is the block scalar's, not the script's.
  const indent = Math.min(...text.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  return {
    text: text.map((line) => line.slice(indent)).join("\n"),
    from: from + 1,
    to: to + 1,
    source: file,
    cite: `${file}, lines ${from + 1} to ${to + 1}`,
  };
};

// ---------------------------------------------------------------------------
// The four passages
// ---------------------------------------------------------------------------

// The knobs, as the script's own header documents them.
const knobs = span(installer, INSTALLER, "knobs", /^# IYI_PREFIX/, /^#\s*$/);

// The two `uname` pairs, and the sentence printed at anything else. The
// refusal is by name, and naming what is refused is the point.
const refusal = span(installer, INSTALLER, "refusal", /^case "\$os-\$arch" in$/, /^esac$/);

// Download, verify, refuse. Opens at the comment that explains why the
// unverified case is said out loud rather than passed over.
const verify = span(installer, INSTALLER, "verify", /^# The checksum line for this tarball/, /^fi$/);

// The release job that writes the file the installer looks for. Anchored on
// the `cat` as well, because an earlier job writes SHA256SUMS too: it is the
// one that proves the refusal, below, and matching it here would have quoted
// fifty lines of the wrong job.
const publish = span(
  workflow,
  WORKFLOW,
  "publish",
  /sha256sum \*\.tar\.gz > SHA256SUMS && cat SHA256SUMS/,
  /gh release create/,
);

// And the gate that proves the refusal is real: CI corrupts one digit of the
// published SHA256SUMS, runs the installer, and requires that it fails, that
// it fails with the installer's own sentence, and that no binary was left
// behind. A verification nobody tests is a verification nobody has.
const tamper = span(
  workflow,
  WORKFLOW,
  "tamper",
  /^\s*sed -i '1s\/\^0\/X\/; 1s\/\^\[1-9a-f\]\/0\/' dist\/SHA256SUMS$/,
  /^\s*\[ ! -e tampered\/bin\/iyi \]$/,
);

// ---------------------------------------------------------------------------
// What the passages say, read out of them rather than about them
// ---------------------------------------------------------------------------

// The environment variables the script actually reads, from the expansions
// themselves. A knob added to the script and left out of its header comment
// is a knob nobody can find, so the two lists have to agree.
const reads = [...new Set(installer.join("\n").match(/\$\{(IYI_[A-Z_]+)/g) ?? [])].map((match) => match.slice(2));
const documented = knobs.text.match(/\bIYI_[A-Z_]+\b/g) ?? [];
const undocumented = reads.filter((name) => !documented.includes(name));
if (undocumented.length > 0) {
  die(
    `${INSTALLER} reads ${undocumented.join(", ")} and its header comment does ` +
      `not mention it, so the site would publish an incomplete list of the ` +
      `knobs a reader can turn`,
  );
}

const knobList = [...new Set(documented)].map((name) => {
  const line = installer.findIndex((text) => text.includes(`\${${name}:-`));
  const fallback = line >= 0 ? /\$\{[A-Z_]+:-([^}]*)\}/.exec(installer[line])?.[1] ?? null : null;
  // The sentence the header comment gives this knob: from its own line to the
  // line before the next knob.
  const start = knobs.text.split("\n").findIndex((text) => text.startsWith(`# ${name}`));
  const rest = knobs.text.split("\n").slice(start + 1);
  const until = rest.findIndex((text) => /^# IYI_[A-Z_]+/.test(text));
  const explanation = [knobs.text.split("\n")[start], ...(until < 0 ? rest : rest.slice(0, until))]
    .join(" ")
    .replace(/^#\s*/, "")
    .replace(/\s*#\s*/g, " ")
    .replace(new RegExp(`^${name}\\s+`), "")
    .trim();
  return { name, fallback, explanation, line: line + 1 };
});

// The accepted pairs: what `uname -s` and `uname -m` have to say, and the
// target name each becomes. These are the same two the assets are named for,
// derived from the case arms rather than restated.
const accepted = [...refusal.text.matchAll(/^\s*(\w+)-(\S+)\)\s*target=(\S+)\s*;;/gm)].map((arm) => ({
  uname: `${arm[1]} ${arm[2]}`,
  target: arm[3],
}));
if (accepted.length === 0) {
  die(`${INSTALLER}'s uname case accepts nothing this script can read, so the page cannot say which machines have a release`);
}

// The sentence a third machine gets.
const refused = /\*\)\s*die\s*"([^"]+)"/.exec(refusal.text);
if (!refused) die(`${INSTALLER}'s uname case no longer ends in a die, so a machine with no release would fall through`);

// The name of the checksum file, taken from the installer's own download, and
// the same name taken from the release job's own command. The whole promise
// is that these are one file.
const wantedFile = /-o "\$tmp\/([A-Za-z0-9._]+)"/.exec(verify.text);
if (!wantedFile) die(`${INSTALLER}'s verification no longer downloads a file this script can name`);
const writtenFile = /sha256sum \*\.tar\.gz > ([A-Za-z0-9._]+)/.exec(publish.text);
if (!writtenFile) die(`${WORKFLOW}'s release job no longer writes a checksum file this script can name`);
if (wantedFile[1] !== writtenFile[1]) {
  die(
    `${INSTALLER} downloads ${wantedFile[1]} and ${WORKFLOW} publishes ` +
      `${writtenFile[1]}. The installer will take its unverified branch on ` +
      `every release and say so in a note; the site will not say a tarball is ` +
      `verified while that is true.`,
  );
}
const checksums = wantedFile[1];

// The two commands the installer uses to compute a digest, in the order it
// tries them. A reader doing it by hand runs the same one.
const checkers = [...verify.text.matchAll(/^\s*(?:actual="\$\()(\w+)((?: -\w \d+)?) "/gm)].map((match) => ({
  tool: match[1],
  args: match[2].trim(),
}));
if (checkers.length === 0) die(`${INSTALLER} no longer computes a digest with a command this script can read`);

// The asset name pattern, so the page's per-artifact verification command
// names the file the installer would have downloaded.
const asset = /^asset="([^"]+)"/m.exec(installer.join("\n"));
if (!asset) die(`${INSTALLER} no longer names its asset, which is the file a reader verifies`);

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const record = {
  provenance: {
    generator: "scripts/download.mjs",
    source: `${INSTALLER}, ${WORKFLOW}`,
    commit,
  },
  passages: { knobs, refusal, verify, publish, tamper },
  knobs: knobList,
  accepted,
  refused: refused[1],
  checksums,
  checkers,
  asset: asset[1],
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");

console.log(
  `download: ${knobList.length} knobs, ${accepted.length} accepted machines ` +
    `(${accepted.map((entry) => entry.target).join(", ")}), ${checkers.length} digest ` +
    `commands, ${checksums} downloaded by ${INSTALLER}:${verify.from} and written ` +
    `by ${WORKFLOW}:${publish.from}, at ${commit.slice(0, 9)}`,
);
