#!/usr/bin/env node
// The build-time gate over the committed records.
//
// The three records under records/ are produced by scripts that need the
// iyi compiler and wasi-sdk. The Pages build has neither, so it cannot make
// them and must not pretend to: this script only verifies what is committed,
// and fails the build naming the file when a record is missing, stale by
// checksum, or short of provenance. Then it publishes two things the site
// imports: the linked modules, copied into public/wasm/ so they can be
// served, and one small entry per sample under src/generated/playground/,
// which is the slice of the manifest a browser is allowed to see. The slice
// exists because the whole manifest used to reach every visitor of every
// sample page through the engine's import graph; the reasoning is with the
// section that writes it.
//
// Every check here is a check the good records pass and a corrupted record
// fails. A gate that cannot fail is not a gate, and this pipeline is the
// argument that the site cannot drift from the tree.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
// A recorded path is a sample's in the iyi repository, `samples/iyi/...`, or
// this site's own: a tour program under `samples/tour/` or a break program
// under `records/`. The one prefix that is the iyi tree's says so.
const sourceOf = (path) => resolve(path.startsWith("samples/iyi/") ? repo : site, path);
const records = resolve(site, "records");
const publicWasm = resolve(site, "public", "wasm");

const PROVENANCE = ["compiler", "commit", "machine", "command", "when"];

const problems = [];
function problem(file, message) {
  problems.push(`${file}: ${message}`);
}

// A record that will not parse cannot be checked field by field, so the whole
// file is one problem and the checks that would have read it are skipped.
function load(file) {
  const path = join(records, file);
  if (!existsSync(path)) {
    problem(
      `records/${file}`,
      `is not there. Regenerate it on a machine with the toolchain; the ` +
        `Pages build cannot make it.`,
    );
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    problem(`records/${file}`, `is not valid JSON: ${error.message}`);
    return null;
  }
  return parsed;
}

// Provenance is the whole reason a recorded number is allowed on a page: it
// says which compiler, which commit, which box, and which command. A record
// missing any of the five is a number without a machine.
function checkProvenance(file, record) {
  const recorded = record.recorded;
  if (!recorded || typeof recorded !== "object") {
    problem(`records/${file}`, `has no "recorded" provenance object`);
    return;
  }
  for (const field of PROVENANCE) {
    const value = recorded[field];
    if (typeof value !== "string" || value.trim() === "") {
      problem(
        `records/${file}`,
        `provenance field "${field}" is empty, so the record cannot say ` +
          `where it came from`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// wasm/manifest.json
// ---------------------------------------------------------------------------

const manifest = load(join("wasm", "manifest.json"));
const wasmFiles = [];

if (manifest) {
  const file = "records/wasm/manifest.json";
  checkProvenance(join("wasm", "manifest.json"), manifest);

  if (!Array.isArray(manifest.samples) || manifest.samples.length === 0) {
    problem(file, `lists no samples`);
  } else {
    const seen = new Set();
    for (const sample of manifest.samples) {
      const id = sample.id;
      if (typeof id !== "string" || id === "") {
        problem(file, `has a sample with no id`);
        continue;
      }
      if (seen.has(id)) {
        problem(file, `lists "${id}" twice`);
      }
      seen.add(id);

      for (const field of ["path", "wasm"]) {
        if (typeof sample[field] !== "string" || sample[field] === "") {
          problem(file, `sample "${id}" has no ${field}`);
        }
      }
      if (typeof sample.exitCode !== "number") {
        problem(file, `sample "${id}" records no exit code`);
      }
      if (typeof sample.identical !== "boolean") {
        problem(
          file,
          `sample "${id}" does not say whether the two runs agreed`,
        );
      }
      for (const field of ["nativeStdout", "wasmStdout"]) {
        if (typeof sample[field] !== "string") {
          problem(file, `sample "${id}" has no ${field}`);
        }
      }
      // A difference between the two runs has to be explained in the record,
      // because the site renders the difference and a reader is owed the
      // reason. An explanation for a difference that no longer exists is the
      // same defect from the other side.
      if (sample.identical === false && !sample.note) {
        problem(
          file,
          `sample "${id}" differs from its native run and the record does ` +
            `not say why`,
        );
      }
      if (sample.identical === true && sample.note) {
        problem(
          file,
          `sample "${id}" matches its native run and still carries a note ` +
            `explaining a difference`,
        );
      }

      // The sample the record measured must still be in the tree under the
      // name the record gives it, or the page would cite a file nobody can
      // open.
      if (typeof sample.path === "string" && sample.path !== "") {
        if (!existsSync(sourceOf(sample.path))) {
          problem(file, `sample "${id}" cites ${sample.path}, which is gone`);
        }
      }

      // The digest of the sample's own source. The playground compares it
      // against a hash of the editor's text to tell an unedited curated
      // sample, which can run from its recorded module, from text the visitor
      // changed, which has to go to the compile service. Checking it against
      // the file on disk is therefore a staleness gate and not a formality: a
      // sample edited since the recording no longer matches its recorded
      // module either, so the page would hand a visitor bytes compiled from
      // text that is no longer in the tree.
      if (
        typeof sample.sourceSha256 !== "string" ||
        sample.sourceSha256 === ""
      ) {
        problem(file, `sample "${id}" records no sourceSha256`);
      } else if (!/^[0-9a-f]{64}$/.test(sample.sourceSha256)) {
        problem(
          file,
          `sample "${id}" records "${sample.sourceSha256}" as its ` +
            `sourceSha256, which is not a 64 character lowercase hex digest`,
        );
      } else if (
        typeof sample.path === "string" &&
        sample.path !== "" &&
        existsSync(sourceOf(sample.path))
      ) {
        const source = readFileSync(sourceOf(sample.path));
        const digest = createHash("sha256").update(source).digest("hex");
        if (digest !== sample.sourceSha256) {
          problem(
            file,
            `sample "${id}" is stale: ${sample.path} hashes to ${digest} ` +
              `where the manifest says ${sample.sourceSha256}, so the ` +
              `recorded module was compiled from text that is no longer in ` +
              `the tree. Regenerate with: npm run record:wasm`,
          );
        }
      }

      if (typeof sample.wasm !== "string" || sample.wasm === "") continue;
      const module = join(records, "wasm", sample.wasm);
      if (!existsSync(module)) {
        problem(
          `records/wasm/${sample.wasm}`,
          `is named by the manifest and is not there`,
        );
        continue;
      }
      const bytes = readFileSync(module);
      if (bytes.length !== sample.bytes) {
        problem(
          `records/wasm/${sample.wasm}`,
          `is ${bytes.length} bytes where the manifest says ${sample.bytes}`,
        );
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== sample.sha256) {
        problem(
          `records/wasm/${sample.wasm}`,
          `hashes to ${sha256} where the manifest says ${sample.sha256}`,
        );
      }
      wasmFiles.push(sample.wasm);
    }

    // A module the manifest does not name is a leftover from a sample that
    // was renamed or removed, and serving it would be serving evidence for a
    // claim nothing on the site makes.
    const named = new Set(manifest.samples.map((sample) => sample.wasm));
    for (const name of readdirSync(join(records, "wasm"))) {
      if (name.endsWith(".wasm") && !named.has(name)) {
        problem(
          `records/wasm/${name}`,
          `is not named by the manifest, so nothing recorded it`,
        );
      }
    }

    // A sample the recorder found does not compile for wasm32-wasi: it has
    // no module and no page, and its record is the reason, the compiler's
    // refusal, and the digest of the source that was refused - stale the
    // same way a module goes stale.
    for (const sample of manifest.nativeOnly ?? []) {
      const id = sample?.id ?? "?";
      for (const field of ["path", "sourceSha256", "reason"]) {
        if (typeof sample?.[field] !== "string" || sample[field] === "") {
          problem(file, `native-only sample "${id}" has no ${field}`);
        }
      }
      if (typeof sample?.path === "string" && sample.path !== "") {
        if (!existsSync(sourceOf(sample.path))) {
          problem(file, `native-only sample "${id}" cites ${sample.path}, which is gone`);
        } else {
          const digest = createHash("sha256").update(readFileSync(sourceOf(sample.path))).digest("hex");
          if (digest !== sample.sourceSha256) {
            problem(
              file,
              `native-only sample "${id}" is stale: ${sample.path} hashes to ${digest} ` +
                `where the manifest says ${sample.sourceSha256}. Regenerate with: npm run record:wasm`,
            );
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// diagnostics.json
// ---------------------------------------------------------------------------

// The compiler's own header, `In path:line:column`, and its caret run, `^`
// under the first column of what it is complaining about followed by dashes
// for the rest of the width. Both are read here rather than assumed because
// the site draws a marker from them: src/playground/diagnostics.ts parses the
// header for the page and src/playground/render.ts parses the caret, and this
// is the gate that says the record they read still agrees with the tree.
// Anchored per line so a path mentioned in prose cannot be read as a location.
const DIAGNOSTIC_LOCATION = /^In (.+):(\d+):(\d+)\s*$/m;
const DIAGNOSTIC_CARET = /^[ \t]*(\^-*)[ \t]*$/m;

const diagnostics = load("diagnostics.json");

if (diagnostics) {
  const file = "records/diagnostics.json";
  checkProvenance("diagnostics.json", diagnostics);

  if (!Array.isArray(diagnostics.cases) || diagnostics.cases.length === 0) {
    problem(file, `lists no cases`);
  } else {
    const seen = new Set();
    for (const entry of diagnostics.cases) {
      const id = entry.id;
      if (typeof id !== "string" || id === "") {
        problem(file, `has a case with no id`);
        continue;
      }
      if (seen.has(id)) {
        problem(file, `lists "${id}" twice`);
      }
      seen.add(id);

      for (const field of ["rule", "title", "path", "command", "stderr"]) {
        if (typeof entry[field] !== "string" || entry[field] === "") {
          problem(file, `case "${id}" has no ${field}`);
        }
      }
      // A case whose program compiles is not a diagnostic, and a zero exit
      // code is how that would look in the record.
      if (typeof entry.exitCode !== "number" || entry.exitCode === 0) {
        problem(
          file,
          `case "${id}" records exit code ${entry.exitCode}, so the ` +
            `compiler did not reject the program`,
        );
      }
      if (typeof entry.stderr === "string" && !entry.stderr.includes("^")) {
        problem(
          file,
          `case "${id}" has no caret line, so the part of the diagnostic ` +
            `that points at the mistake is missing`,
        );
      }
      if (typeof entry.path === "string" && entry.path !== "") {
        if (!existsSync(sourceOf(entry.path))) {
          problem(file, `case "${id}" cites ${entry.path}, which is gone`);
        } else if (typeof entry.stderr === "string") {
          // The site draws a marker on the offending line, so the position in
          // the compiler's own header has to still be a position in the file
          // the header names. A case recorded before that file was edited
          // would otherwise put a signal-coloured bar on whatever line moved
          // into the slot, or on none at all, and a reader has no way to tell.
          //
          // The file the header names is not always the case's own program: an
          // import cycle is reported against the module that closes the loop,
          // which is a dependency of the program that was compiled. So the
          // check follows the header rather than the case.
          const where = DIAGNOSTIC_LOCATION.exec(entry.stderr);
          if (where === null) {
            problem(
              file,
              `case "${id}" has compiler output with no "In file:line:column" ` +
                `header, so nothing can say where the error is`,
            );
          } else if (!existsSync(sourceOf(where[1]))) {
            problem(
              file,
              `case "${id}" points at ${where[1]}, which is not in the tree`,
            );
          } else {
            const lines = readFileSync(sourceOf(where[1]), "utf8").split("\n").length;
            const line = Number(where[2]);
            if (line > lines) {
              problem(
                file,
                `case "${id}" points at line ${line} of ${where[1]}, which ` +
                  `has fewer lines than that now. Regenerate with: npm run ` +
                  `record:diagnostics`,
              );
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// highlight.json
// ---------------------------------------------------------------------------

// The markup has to encode the file rather than merely resemble it. Recovering
// the text and comparing it with the tree is what catches a record written
// before a listing was edited, which is the way this record goes stale: the
// tokens would still be valid markup, painted onto text nobody wrote.
function textOf(html) {
  return html
    .replace(/<span class="[^"]*">/g, "")
    .replace(/<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const highlight = load("highlight.json");

if (highlight) {
  const file = "records/highlight.json";
  checkProvenance("highlight.json", highlight);

  const listings = highlight.files;
  if (!listings || typeof listings !== "object") {
    problem(file, `has no "files" map`);
  } else if (Object.keys(listings).length === 0) {
    problem(file, `records no listings`);
  } else {
    for (const [path, html] of Object.entries(listings)) {
      if (typeof html !== "string" || html === "") {
        problem(file, `${path} has no markup`);
        continue;
      }
      const source = sourceOf(path);
      if (!existsSync(source)) {
        problem(file, `records ${path}, which is gone from the tree`);
        continue;
      }
      if (textOf(html) !== readFileSync(source, "utf8")) {
        problem(
          file,
          `${path} is stale: the recorded markup does not encode the file ` +
            `that is in the tree now`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// agent.json and cli.json, verified if they are there
// ---------------------------------------------------------------------------

// These two records arrived after the three above and are produced by their
// own recorders on a machine with the toolchain. They are checked exactly like
// the others when they are committed, and their absence is not a problem here:
// a record whose recorder has not landed yet would otherwise fail every build
// in the meantime, and a gate that has to be disabled to get work done is a
// gate people learn to disable. Once the file exists, every field below is
// mandatory.
function optional(file) {
  return existsSync(join(records, file)) ? load(file) : null;
}

const agent = optional("agent.json");

if (agent) {
  const file = "records/agent.json";
  checkProvenance("agent.json", agent);

  if (!Array.isArray(agent.frames) || agent.frames.length === 0) {
    problem(file, `records no frames, so there is no session to show`);
  }
  // The claim the record exists to support: the same request answered the same
  // way over both transports. The recorder refuses to write the file when it
  // does not hold, so a committed record saying otherwise was edited by hand.
  if (agent.wire?.identical !== true) {
    problem(
      file,
      `says the two transports did not answer identically, which the ` +
        `recorder refuses to write. Regenerate with: npm run record:agent`,
    );
  }
  for (const [key, shape] of [
    ["project", "array"],
    ["frames", "array"],
    ["suggested", "array"],
    ["pack", "object"],
    ["repaired", "object"],
    ["wire", "object"],
  ]) {
    const value = agent[key];
    const ok = shape === "array" ? Array.isArray(value) : value && typeof value === "object";
    if (!ok) problem(file, `has no "${key}" ${shape}`);
  }
  for (const frame of Array.isArray(agent.frames) ? agent.frames : []) {
    for (const field of ["id", "title", "command"]) {
      if (typeof frame?.[field] !== "string" || frame[field] === "") {
        problem(file, `frame "${frame?.id ?? "?"}" has no ${field}`);
      }
    }
    if (typeof frame?.exitCode !== "number") {
      problem(file, `frame "${frame?.id ?? "?"}" records no exit code`);
    }
  }
}

const cli = optional("cli.json");

if (cli) {
  const file = "records/cli.json";
  checkProvenance("cli.json", cli);

  const usage = cli.usage;
  if (typeof usage?.text !== "string" || usage.text === "") {
    problem(file, `has no usage block, so nothing says which verbs exist`);
  }
  for (const field of ["from", "to", "source"]) {
    if (usage && usage[field] === undefined) {
      problem(file, `usage names no ${field}, so the quote cannot be cited`);
    }
  }
  if (!Array.isArray(cli.verbs) || cli.verbs.length === 0) {
    problem(file, `records no verbs`);
  } else {
    for (const verb of cli.verbs) {
      const name = verb?.name;
      if (typeof name !== "string" || name === "") {
        problem(file, `has a verb with no name`);
        continue;
      }
      if (typeof verb.help !== "string" || verb.help === "") {
        problem(file, `verb "${name}" records no help text`);
        continue;
      }
      // The count is a fact about the text beside it, so it is recomputed
      // rather than believed: a record written before a verb's help changed
      // would otherwise cite a length nothing has.
      const lines = verb.help.replace(/\n$/, "").split("\n").length;
      if (verb.lines !== lines) {
        problem(
          file,
          `verb "${name}" says its help is ${verb.lines} lines and the ` +
            `recorded text is ${lines}`,
        );
      }
      // A verb the usage block does not name is a verb the page would list
      // out of nowhere, which is how a renamed subcommand survives on a site
      // after it stops existing in the tree.
      if (typeof usage?.text === "string" && !usage.text.includes(name)) {
        problem(
          file,
          `verb "${name}" does not appear in the usage block it was taken ` +
            `from. Regenerate with: npm run record:cli`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The per-sample entries the browser gets
// ---------------------------------------------------------------------------

// One file per sample, written into src/generated/playground/ and imported by
// the route that renders that sample.
//
// WHY THE SLICE EXISTS. The manifest is the recording of every curated sample,
// and every field of it used to reach the browser: the playground island
// imported the engine, the engine imported samples.ts, and samples.ts imports
// this file, so a visitor reading one program was served every other program's
// recorded output in order to check one digest. The route carries exactly one
// sample. This writes exactly one sample's worth.
//
// WHAT IS LEFT OUT. `nativeStdout` and `wasmStdout`, which are the bulk of an
// entry. Where a page shows a recorded run it renders that text into the HTML
// at build time, and where it runs the program it does not need to be told
// what the program will print.
//
// WHAT IS ADDED. The answer key and, where a recorded diagnostic names this
// sample's own file, the position to draw it at. Both are computed here from
// records that are already verified above; nothing is invented and nothing is
// typed.

const generated = resolve(site, "src", "generated", "playground");
const entries = [];

// The normalisation rule, mirrored from scripts/record-wasm.mjs, which writes
// the digests this recomputes, and from src/playground/entry.ts, which applies
// it to what a visitor types. Trailing whitespace is invisible and trailing
// blank lines are a property of a textarea, so neither can be the difference
// between a right answer and a wrong one. Nothing else is touched.
const normalise = (text) =>
  text
    .split("\n")
    .map((line) => line.replace(/[\s\uFEFF]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");

const hash = (text) => createHash("sha256").update(text, "utf8").digest("hex");

if (manifest && Array.isArray(manifest.samples)) {
  // A recorded case lands on a listing when the compiler's own header names
  // that listing's file, which is not the same thing as the case's program: an
  // import cycle is reported against the module that closes the loop. The
  // break programs are their own files today, so no sample carries a marker;
  // the moment a case points into one, its page draws it with no change here.
  const caseAt = {};
  for (const entry of Array.isArray(diagnostics?.cases) ? diagnostics.cases : []) {
    const where = typeof entry?.stderr === "string" ? DIAGNOSTIC_LOCATION.exec(entry.stderr) : null;
    const caret = typeof entry?.stderr === "string" ? DIAGNOSTIC_CARET.exec(entry.stderr) : null;
    if (where === null || caret === null || caseAt[where[1]] !== undefined) continue;
    caseAt[where[1]] = {
      rule: entry.rule ?? null,
      line: Number(where[2]),
      column: Number(where[3]),
      width: caret[1].length,
      command: entry.command,
    };
  }

  for (const sample of [...manifest.samples, ...(manifest.nativeOnly ?? [])]) {
    if (typeof sample?.id !== "string" || sample.id === "") continue;

    // The output the page shows for this sample: the module's where there is a
    // module, the native binary's where the compiler refused the target.
    // Asking a reader about the other one would be asking about a run they
    // cannot see.
    const shown = sample.wasm ? sample.wasmStdout : sample.nativeStdout;
    if (typeof shown !== "string") {
      problem(
        "records/wasm/manifest.json",
        `sample "${sample.id}" records no output, so its page can neither ` +
          `show a recorded run nor check an answer against one`,
      );
      continue;
    }
    const text = normalise(shown);
    const expect = {
      output: hash(text),
      lines: text === "" ? [] : text.split("\n").map((line) => hash(line).slice(0, 16)),
    };

    // The recorder writes the same key from the output it watched appear. It
    // is recomputed here rather than copied so that the two cannot drift: a
    // record whose key does not describe its own recorded output is a record
    // somebody edited, and the exercise would then mark a right answer wrong.
    if (sample.expect !== undefined) {
      const recorded = sample.expect;
      const same =
        recorded?.output === expect.output &&
        Array.isArray(recorded.lines) &&
        recorded.lines.length === expect.lines.length &&
        recorded.lines.every((line, at) => line === expect.lines[at]);
      if (!same) {
        problem(
          "records/wasm/manifest.json",
          `sample "${sample.id}" carries an expected output that is not the ` +
            `digest of the output recorded beside it. Regenerate with: npm ` +
            `run record:wasm`,
        );
      }
    }

    entries.push({
      file: `${sample.id.replace(/\//g, "-")}.json`,
      data: {
        id: sample.id,
        set: sample.set,
        path: sample.path,
        sourceSha256: sample.sourceSha256,
        wasm: sample.wasm ?? null,
        bytes: sample.bytes ?? null,
        sha256: sample.sha256 ?? null,
        exitCode: sample.exitCode,
        /* A curated sample's note explains a difference between its two runs;
         * a native-only sample's reason explains why there is only one. Both
         * are the one sentence the recording asked the page to carry. */
        note: sample.note ?? sample.reason ?? null,
        expect,
        diagnostic: caseAt[sample.path] ?? null,
        recorded: manifest.recorded,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Fail, or publish
// ---------------------------------------------------------------------------

if (problems.length > 0) {
  throw new Error(
    `the committed records do not check out, so the site will not build:\n\n` +
      problems.map((line) => `  ${line}`).join("\n") +
      `\n\nRegenerate on a machine with the iyi compiler and wasi-sdk:\n` +
      `  npm run record\n`,
  );
}

mkdirSync(publicWasm, { recursive: true });
const publishing = new Set(wasmFiles);
for (const name of readdirSync(publicWasm)) {
  if (!publishing.has(name)) rmSync(join(publicWasm, name));
}
for (const name of wasmFiles) {
  writeFileSync(join(publicWasm, name), readFileSync(join(records, "wasm", name)));
}

// The entries, written after the gate rather than before it, so a record that
// does not check out leaves no slice of itself behind for a page to import.
// A file for a sample the manifest no longer names would still parse and would
// still render, which is exactly the stale evidence this pipeline refuses, so
// the directory is pruned to what was just written.
mkdirSync(generated, { recursive: true });
const written = new Set(entries.map((entry) => entry.file));
for (const name of readdirSync(generated)) {
  if (!written.has(name)) rmSync(join(generated, name));
}
for (const entry of entries) {
  writeFileSync(
    join(generated, entry.file),
    `${JSON.stringify(entry.data, null, 2)}\n`,
    "utf8",
  );
}

const cases = diagnostics.cases.length;
const listings = Object.keys(highlight.files).length;
const marked = entries.filter((entry) => entry.data.diagnostic !== null).length;
console.log(
  `records: ${wasmFiles.length} wasm modules verified and published, ` +
    `${cases} diagnostics, ${listings} listings, ` +
    `${entries.length} playground entries written to src/generated/playground/` +
    (marked ? ` (${marked} carrying a recorded diagnostic)` : "") +
    (agent ? ", agent record verified" : "") +
    (cli ? `, ${cli.verbs?.length ?? 0} cli verbs verified` : "") +
    `, recorded at ${manifest.recorded.commit.slice(0, 9)}`,
);
