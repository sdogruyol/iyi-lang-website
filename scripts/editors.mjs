#!/usr/bin/env node
// The editor setup stanzas, lifted out of the repository's own guide.
//
// WHAT THE SITE SAID BEFORE. One bullet on the why page: the tools are the
// compiler. True, and useless to somebody who wants iyi in Helix. Meanwhile
// editors/README.md in the iyi tree carries a complete, tested stanza for
// five clients and the argument for why none of them needs a grammar file.
//
// THE OBVIOUS WRONG FIX is to retype those stanzas into an Astro page, where
// they would be four configuration blocks nobody runs, drifting from the ones
// in the tree that somebody does. A stale Neovim stanza is worse than no page
// at all: it fails in an editor, at the moment a person first tries the
// language, and it fails silently because `vim.lsp.config` is happy to
// register a command that does not exist.
//
// So the stanzas are lifted, the way `scripts/samples.mjs` lifts README.md's
// recordings: by anchor, never by line number, with the line range travelling
// with the text so the page cites rather than asserts. Two gates:
//
//   1. Every claimed section has to exist, and its stanza has to contain the
//      anchor. A renamed section is a build failure naming it.
//   2. Every section in the file has to be claimed. This is the half that
//      matters: an editor ADDED to the guide and missing from the site looks
//      exactly like a complete page.
//
// The VS Code extension is read as code, not as prose. The guide says the
// client is a manifest and thirty lines; this script counts the lines and
// reads the manifest's fields, so the page states what the extension is
// rather than what the guide remembers it being.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument, sections } from "./markdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated", "editors.json");

const GUIDE = "editors/README.md";
const EXTENSION = "editors/vscode";

const die = (message) => {
  throw new Error(message);
};

// Each entry claims that the guide has this section and that its stanza says
// this. `anchor` is the line a reader would recognise: the command, the
// setting, the key. `lang` is what the stanza is set in, and a stanza whose
// fence changed language is a stanza that was rewritten.
//
// `iyi lsp` is in every one of them, which is the argument the page makes.
const WANTED = {
  vscode: { heading: "VS Code", lang: "console", anchor: "code --install-extension" },
  neovim: { heading: "Neovim (0.11+)", lang: "lua", anchor: 'vim.lsp.config("iyi"' },
  helix: { heading: "Helix", lang: "toml", anchor: "[language-server.iyi]" },
  sublime: { heading: "Sublime Text", lang: "json", anchor: '"command": ["iyi", "lsp"]' },
  // Zed has no stanza to lift: the guide says the server side is ready and
  // the client shim is not written. That absence is the honest thing to
  // publish, so this section is claimed with prose alone and the page says so.
  zed: { heading: "Zed, and everything else", lang: null, anchor: null },
};

const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

// ---------------------------------------------------------------------------
// The guide
// ---------------------------------------------------------------------------

const guidePath = resolve(repo, GUIDE);
const guideText = readFileSync(guidePath, "utf8");
// Links inside the guide are relative to editors/, and the site does not
// publish the iyi tree; they resolve to the repository at the commit read.
const guide = parseDocument(guideText, {
  link: (href) =>
    /^[a-z]+:/i.test(href) || href.startsWith("#")
      ? href
      : `https://github.com/iyilang/iyi/blob/${commit}/editors/${href.replace(/\/$/, "")}`,
});

const found = sections(guide.blocks, 2);
const byHeading = new Map(found.map((section) => [section.heading, section]));

const unclaimed = found
  .map((section) => section.heading)
  .filter((heading) => !Object.values(WANTED).some((want) => want.heading === heading));
if (unclaimed.length > 0) {
  die(
    `${GUIDE} has section(s) this script does not publish: ${unclaimed.join(", ")}. ` +
      `An editor added to the guide and absent from the site is invisible, ` +
      `which is the failure this check exists for. Claim it in WANTED.`,
  );
}

// Everything above the first section is the argument: no grammar file is
// needed, and the one prerequisite is `iyi` on PATH. Published as the guide
// writes it.
const preamble = [];
for (const block of guide.blocks) {
  if (block.kind === "heading" && block.level === 2) break;
  preamble.push(block);
}

const clients = [];
for (const [id, want] of Object.entries(WANTED)) {
  const section = byHeading.get(want.heading);
  if (!section) {
    die(
      `${GUIDE} has no "## ${want.heading}" section, which the site publishes ` +
        `as "${id}". Either it was renamed, in which case update the claim, ` +
        `or the guide dropped an editor the site is still offering.`,
    );
  }

  const fences = section.blocks.filter((block) => block.kind === "code");

  if (want.anchor === null) {
    if (fences.length > 0) {
      die(
        `"${want.heading}" now carries a stanza (${GUIDE}:${fences[0].from}) and ` +
          `the site is still saying it has none. Give "${id}" an anchor.`,
      );
    }
    clients.push({
      id,
      heading: want.heading,
      from: section.from,
      prose: section.blocks.filter((block) => block.kind !== "code"),
      stanza: null,
    });
    continue;
  }

  const hits = fences.filter((block) => block.text.includes(want.anchor));
  if (hits.length === 0) {
    die(
      `"${want.heading}" in ${GUIDE} has no fenced block containing ` +
        `"${want.anchor}". The stanza was rewritten; read it and update the ` +
        `anchor rather than letting the site publish a block nobody checked.`,
    );
  }
  if (hits.length > 1) {
    die(`"${want.anchor}" matches ${hits.length} blocks under "${want.heading}", so "${id}" is ambiguous. Narrow it.`);
  }

  const [stanza] = hits;
  if (stanza.lang !== want.lang) {
    die(
      `"${id}" expected a ${want.lang} stanza and ${GUIDE}:${stanza.from} is ` +
        `${stanza.lang || "unlabelled"}. A configuration set in the wrong ` +
        `language is a configuration a reader will paste into the wrong file.`,
    );
  }
  if (!stanza.text.includes("iyi")) {
    die(`the stanza for "${id}" never names iyi, so it cannot be the one that starts the server`);
  }

  clients.push({
    id,
    heading: want.heading,
    from: section.from,
    prose: section.blocks.filter((block) => block.kind !== "code"),
    stanza: {
      lang: stanza.lang,
      text: stanza.text,
      from: stanza.from,
      to: stanza.to,
      cite: `${GUIDE}, lines ${stanza.from} to ${stanza.to}`,
    },
  });
}

// ---------------------------------------------------------------------------
// The VS Code extension, as it is rather than as it is described
// ---------------------------------------------------------------------------

const extensionDir = resolve(repo, EXTENSION);

// Everything the extension is made of, node_modules and the built packages
// excluded: a .vsix is the output, not the source, and the point of the page
// is how little source there is.
const parts = (() => {
  const walk = (dir, prefix = "") => {
    const entries = [];
    for (const name of readdirSync(dir).sort()) {
      if (name === "node_modules" || name.endsWith(".vsix") || name === "package-lock.json") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        entries.push(...walk(path, `${prefix}${name}/`));
        continue;
      }
      entries.push({
        name: `${prefix}${name}`,
        lines: readFileSync(path, "utf8").replace(/\n$/, "").split("\n").length,
      });
    }
    return entries;
  };
  return walk(extensionDir);
})();

const clientPath = join(extensionDir, "extension.js");
const clientText = readFileSync(clientPath, "utf8").replace(/\n$/, "");
if (!clientText.includes('args: ["lsp"]')) {
  die(
    `${EXTENSION}/extension.js no longer spawns the server with ["lsp"], so ` +
      `the page's claim that the extension is a client and nothing else is ` +
      `no longer a reading of the file`,
  );
}

const manifest = JSON.parse(readFileSync(join(extensionDir, "package.json"), "utf8"));
const language = manifest.contributes?.languages?.[0];
const grammar = manifest.contributes?.grammars?.[0];
const setting = manifest.contributes?.configuration?.properties?.["iyi.serverPath"];
if (!language || !grammar || !setting) {
  die(`${EXTENSION}/package.json no longer contributes a language, a grammar and an iyi.serverPath setting, which is what the page reads out of it`);
}

const extension = {
  path: `${EXTENSION}/`,
  url: `https://github.com/iyilang/iyi/tree/${commit}/${EXTENSION}`,
  files: parts,
  lines: parts.reduce((n, file) => n + file.lines, 0),
  client: {
    source: `${EXTENSION}/extension.js`,
    text: clientText,
    lines: clientText.split("\n").length,
  },
  manifest: {
    source: `${EXTENSION}/package.json`,
    name: manifest.name,
    version: manifest.version,
    publisher: manifest.publisher,
    license: manifest.license,
    description: manifest.description,
    engine: manifest.engines.vscode,
    activation: manifest.activationEvents,
    extensions: language.extensions,
    scope: grammar.scopeName,
    grammarLines: parts.find((file) => file.name === grammar.path.replace(/^\.\//, ""))?.lines ?? null,
    setting: { key: "iyi.serverPath", default: setting.default, description: setting.description },
  },
};

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const record = {
  provenance: {
    generator: "scripts/editors.mjs",
    source: GUIDE,
    extension: EXTENSION,
    commit,
  },
  guide: {
    source: GUIDE,
    lines: guide.lines,
    url: `https://github.com/iyilang/iyi/blob/${commit}/${GUIDE}`,
  },
  preamble,
  clients,
  extension,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");

const withStanza = clients.filter((client) => client.stanza).length;
console.log(
  `editors: ${clients.length} clients, ${withStanza} with a stanza lifted from ` +
    `${GUIDE} (${guide.lines} lines), extension ${extension.client.lines} lines ` +
    `plus a manifest, at ${commit.slice(0, 9)}`,
);
