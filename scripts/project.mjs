#!/usr/bin/env node
// The repository's own project documents, published whole.
//
// CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md and NOTICE.md are the four
// things a person looks for before they file an issue, report a vulnerability
// or paste a licence header, and until now the site said none of it. The
// tempting fix is a page summarising them. That is the one thing this site
// does not do: a summary of a security policy is a security policy nobody
// wrote, and the difference between "report it privately" and the address
// SECURITY.md actually gives is somebody's disclosure going to the wrong
// mailbox.
//
// So the documents are published, not described. Every block on the page is a
// block of the file, in the file's order, and `scripts/markdown.mjs` proves
// it: the blocks carry their own source lines and this script reassembles
// them, before writing and again after, and compares the result with the file
// on disk byte for byte. A parser that dropped a paragraph fails here.
//
// WHAT A DOCUMENT'S OWN LINKS DO. These files link to SPEC.md, LICENSE and
// REUSE.toml, which this site does not publish and will not pretend to. A
// repository-relative link is therefore resolved to the repository, at the
// exact commit the text was read from, so the link cannot rot and cannot land
// on a rewritten file that no longer says what the quoted sentence says. The
// repository is not typed here either: the slug is read out of install.sh,
// which is the file that actually downloads from it.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "./markdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated", "project.json");

const die = (message) => {
  throw new Error(message);
};

// The four, in the order a page should offer them: how to contribute, how to
// report a hole, how people are expected to behave, whose code this is.
// `blurb` is the one sentence of ours on the index, and it says what the
// document is, never what it says.
const DOCUMENTS = [
  { id: "contributing", file: "CONTRIBUTING.md", blurb: "What a change to this repository is expected to come with." },
  { id: "security", file: "SECURITY.md", blurb: "Where a vulnerability goes, and which of the two trackers is the right one." },
  { id: "conduct", file: "CODE_OF_CONDUCT.md", blurb: "The Contributor Covenant, and the address that enforces it here." },
  { id: "notice", file: "NOTICE.md", blurb: "Crystal's copyright, the licence, and every library the compiler links." },
];

const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

// `repo="iyilang/iyi"` in install.sh: the slug the installer downloads from.
// Read rather than typed, so a fork that renames does not leave the site
// linking at the old owner's tree.
const slug = (() => {
  const line = readFileSync(resolve(repo, "install.sh"), "utf8")
    .split("\n")
    .find((text) => /^repo="/.test(text));
  if (!line) die(`install.sh no longer opens with a repo="owner/name" line, which is where this script learns where to link`);
  return /^repo="([^"]+)"/.exec(line)[1];
})();

const blob = `https://github.com/${slug}/blob/${commit}`;

// A link target that is a path in the repository becomes a link into the
// repository. Anything with a scheme, a fragment or a mail address is the
// document's own and is left exactly as written.
const link = (href) => {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return href;
  return `${blob}/${href.replace(/^\.\//, "").replace(/\/$/, "")}`;
};

/** The document, rebuilt out of the blocks alone. */
const reassemble = (document) => {
  const lines = new Array(document.lines).fill("");
  for (const block of document.blocks) {
    block.source.forEach((text, index) => {
      lines[block.from - 1 + index] = text;
    });
  }
  return `${lines.join("\n")}\n`;
};

const documents = [];

for (const wanted of DOCUMENTS) {
  const path = resolve(repo, wanted.file);
  const text = readFileSync(path, "utf8");
  const lines = text.replace(/\n$/, "").split("\n");
  const parsed = parseDocument(text, { link });

  const blocks = parsed.blocks.map((block) => ({
    ...block,
    source: lines.slice(block.from - 1, block.to),
  }));

  // The title is the document's own first heading, and a document without one
  // is a document this page would have to name itself.
  const first = blocks.find((block) => block.kind === "heading");
  if (!first || first.level !== 1) {
    die(`${wanted.file} does not open with a level-one heading, so the site would be inventing its title`);
  }

  const document = {
    ...wanted,
    title: first.text,
    lines: parsed.lines,
    commit,
    cite: `${wanted.file}, ${parsed.lines} lines`,
    url: `${blob}/${wanted.file}`,
    blocks,
  };

  const rebuilt = reassemble(document);
  if (rebuilt !== text) {
    die(
      `${wanted.file} does not survive the round trip: the blocks this script ` +
        `wrote reassemble into something other than the file. The page would ` +
        `publish a document the repository does not contain.`,
    );
  }

  documents.push(document);
}

const record = {
  provenance: {
    generator: "scripts/project.mjs",
    source: DOCUMENTS.map((entry) => entry.file).join(", "),
    repository: slug,
    commit,
  },
  documents,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");

// And again, from the file that was written, because what the page imports is
// this file and not the objects in memory.
const written = JSON.parse(readFileSync(out, "utf8"));
for (const document of written.documents) {
  const original = readFileSync(resolve(repo, document.file), "utf8");
  if (reassemble(document) !== original) {
    die(`${document.file} does not reassemble out of ${out}, so the written record is not the document`);
  }
}

const total = documents.reduce((n, document) => n + document.lines, 0);
console.log(
  `project: ${documents.length} documents, ${total} lines, ` +
    `${documents.reduce((n, d) => n + d.blocks.length, 0)} blocks, ` +
    `reassembled byte for byte at ${commit.slice(0, 9)}`,
);
