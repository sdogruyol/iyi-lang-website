#!/usr/bin/env node
// Records what the real compiler does with every curated sample on
// wasm32-wasi: cross-compile, link with wasi-sdk, run the linked module under
// node:wasi, run the same sample natively, compare the two outputs byte for
// byte.
//
// This runs on a machine with the toolchain, never in the Pages build. The
// build only verifies what this wrote (see records.mjs), because GitHub's
// runner has no iyi compiler and no wasi-sdk, and a page that invents a byte
// count is worse than a page that fails to build.
//
// What each field of a manifest entry means, because two of them could be
// read either way. `bytes` and `sha256` are the linked module beside the
// manifest, not the compiler's unlinked object. `exitCode` is the wasm run's,
// since that is the run the record exists to describe; a sample whose native
// run is not clean fails this script instead of reaching the manifest.
// `sourceSha256` is the other file entirely: the sample's own text at `path`,
// hashed as it sat on disk when this ran.
//
// That last field is here for the playground. The editor has to decide
// whether the text in front of the visitor is still the program that was
// recorded or something they changed, because an unedited curated sample can
// run straight from its recorded module while edited text has to go to the
// compile service. The only copy of the recorded text the client can reach is
// records/highlight.json, which is roughly a quarter of a megabyte of
// listings; importing that into an engine to answer one yes-or-no question
// would ship all of it to every visitor. A digest is a few dozen bytes and
// answers the same question. It doubles as a staleness gate: a sample edited
// since this ran no longer matches its own recorded module either, and
// records.mjs says so by name.
//
// `expect` is the same idea applied to the run rather than to the source: the
// digests of the output this script watched the program produce, so a tour
// step can ask what a program prints and check the answer in the browser
// without the answer being anywhere on the page. It is written here, by the
// thing that saw the output, and nowhere else; see "The answer key" below.
//
// Regenerate with: npm run record:wasm

import { execFileSync, spawnSync } from "node:child_process";
import {
  createHash,
} from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const samplesDir = resolve(repo, "samples", "iyi");
const tourDir = resolve(site, "samples", "tour");
const out = resolve(site, "records", "wasm");

// ---------------------------------------------------------------------------
// The answer key
// ---------------------------------------------------------------------------

// Every tour step asks what its program prints before it will run it, and the
// answer is checked in the visitor's browser. The answer therefore must not be
// on the page, and it must not be typed anywhere at all: an expected output
// written by hand is a second copy of a run, and the one thing this whole
// pipeline exists to prevent is a second copy drifting from the first.
//
// So the key is digests of the output this run actually produced. `output`
// covers the whole of it and `lines` covers each line, so a visitor who is
// close can be told how many lines they have right without being told what the
// rest are. Sixteen hex characters per line rather than the full digest
// because this is a quiz and not a signature, and a line of a program's output
// is bandwidth a reader pays for once per line of every sample they open.
//
// NORMALISATION, mirrored in src/playground/entry.ts and recomputed by
// scripts/records.mjs. Trailing whitespace is invisible, so a visitor who
// typed it has still typed the right answer; trailing blank lines appear in a
// textarea by pressing return. Nothing else is touched, because case, inner
// spacing and punctuation are the program's output.
const normalise = (text) =>
  text
    .split("\n")
    .map((line) => line.replace(/[\s\uFEFF]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");

const digest = (text) => createHash("sha256").update(text, "utf8").digest("hex");

// The output the page shows for this sample: what the module printed where
// there is a module, and what the native binary printed where the compiler
// refused the target. Asking about the other one would be asking about a run
// the reader cannot see.
function answerKey(shown) {
  const text = normalise(shown);
  return {
    output: digest(text),
    lines: text === "" ? [] : text.split("\n").map((line) => digest(line).slice(0, 16)),
  };
}

// A sample whose wasm run does not match its native run needs a sentence
// saying why, and the sentence is prose so it is written here rather than
// guessed at. The script fails if a mismatch has no note, and fails if a note
// describes a sample that now matches, so this table cannot go stale quietly.
// A sample that does not compile for wasm32-wasi at all, and the sentence
// saying why: recorded as native only, with the compiler's refusal kept as
// the evidence and, for a tour step, what the native run printed, so the page
// can show the program and its output without offering a Run it cannot do.
// The script fails if a sample listed here now compiles, so this table cannot
// go stale quietly either.
const TASKS_ON_WASM =
  "Tasks and channels run on Linux and macOS arm64 and nowhere else yet: a " +
  "program that names `group` or `Channel` on wasm32 does not compile, " +
  "because src/iyi/concurrency.iyi refuses to ship a spelling without the " +
  "feature (SPEC.md III.4.8).";
const NATIVE_ONLY = {
  "iyi/workers": TASKS_ON_WASM,
  tasks: TASKS_ON_WASM,
  channels: TASKS_ON_WASM,
};

const NOTES = {
  "iyi/files":
    "The wasm build refuses File at run time by design: src/iyi/prelude.iyi " +
    "panics with \"File is not available on wasm32-wasi: path_open needs a " +
    "preopened directory fd\", because a WASI module reaches the filesystem " +
    "only through directory handles the host granted it, and this module " +
    "asks for none.",
  "iyi/socket":
    "There are no sockets on wasm32-wasi to open: src/std/socket.iyi binds " +
    "the calls per platform and wasm32 falls to the branch that has none, " +
    "so the first line panics with \"IyiSocket is not supported on this " +
    "platform\" and the module prints nothing. WASI preview1 can accept, " +
    "read and write a socket the host handed it, and has no call that " +
    "creates or binds one; natively the same program runs both ends of the " +
    "exchange on loopback.",
};

// ---------------------------------------------------------------------------
// Toolchain
// ---------------------------------------------------------------------------

// The compiler that measures this is the one in the tree, or one named
// explicitly. There is no third possibility: a record produced by an unknown
// compiler is not a record.
const buildDir = process.env.IYI_BUILD
  ? resolve(process.env.IYI_BUILD)
  : resolve(repo, ".build");
const iyi = join(buildDir, "iyi");
if (!existsSync(iyi)) {
  throw new Error(
    `no iyi compiler at ${iyi}. Build it, or set IYI_BUILD to the ` +
      `directory holding the iyi and crystal binaries.`,
  );
}

// wasi-sdk provides the only linker that turns the compiler's unlinked module
// into a loadable one, and the one that answered is printed, because a record
// whose linker is unknown is not a record.
//
// An explicit setting is binding rather than preferred. Treating WASI_CLANG as
// the first entry in a search list meant that pointing it at the wrong path
// silently linked with whatever was found next, and the record would then
// attribute its bytes to a linker the operator did not choose. So a setting
// that does not resolve is refused by name, and only the unset case searches.
const clang = (() => {
  if (process.env.WASI_CLANG) {
    const named = process.env.WASI_CLANG;
    if (!existsSync(named)) {
      throw new Error(
        `WASI_CLANG is set to ${named}, which is not there. Fix it or unset ` +
          `it; this script will not quietly link with a different clang than ` +
          `the one you named.`,
      );
    }
    return named;
  }
  if (process.env.WASI_SDK) {
    const named = join(process.env.WASI_SDK, "bin", "clang");
    if (!existsSync(named)) {
      throw new Error(
        `WASI_SDK is set to ${process.env.WASI_SDK}, which has no ` +
          `bin/clang. Fix it or unset it; this script will not quietly link ` +
          `with a different wasi-sdk than the one you named.`,
      );
    }
    return named;
  }
  const searched = [
    "/opt/wasi-sdk/bin/clang",
    "/usr/local/wasi-sdk/bin/clang",
    "/opt/homebrew/opt/wasi-sdk/bin/clang",
    "/tmp/wasi-sdk/bin/clang",
  ];
  const found = searched.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `no wasi-sdk clang found. Looked at:\n  ${searched.join("\n  ")}\n` +
        `Install wasi-sdk and set WASI_SDK to its root, or set WASI_CLANG to ` +
        `the clang binary.`,
    );
  }
  return found;
})();

// The link below is `--target=wasm32-wasi`, which needs a sysroot of that
// name. wasi-sdk renamed it to wasm32-wasip1 and dropped the old name after
// 24, so a newer sdk fails here with `cannot open crt1.o`, which says nothing
// about the version. Say it instead: this is a toolchain to install, not a
// bug in the tree.
const sysroot = resolve(dirname(dirname(clang)), "share", "wasi-sysroot");
if (existsSync(sysroot) && !existsSync(join(sysroot, "lib", "wasm32-wasi"))) {
  throw new Error(
    `${clang} has no wasm32-wasi sysroot: ${join(sysroot, "lib")} holds ` +
      `${readdirSync(join(sysroot, "lib")).join(", ")}. This records the ` +
      `wasm32-wasi target README.md publishes, so it links against that ` +
      `sysroot by name. Use wasi-sdk 24, the last one that carries it, or ` +
      `point WASI_SDK at one that does.`,
  );
}

const env = { ...process.env, IYI_PATH: resolve(repo, "src") };

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

const version = execFileSync(iyi, ["--version"], { encoding: "utf8" })
  .split("\n")[0]
  .trim();
if (!version) {
  throw new Error(`${iyi} --version printed nothing, so the record cannot say`
    + ` which compiler made it`);
}

const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

const machine = (() => {
  const uname = execFileSync("uname", ["-srm"], { encoding: "utf8" }).trim();
  // The CPU's name, asked of the platform that knows it: sysctl is darwin's
  // spelling and /proc/cpuinfo is Linux's. A record is made on either.
  const cpu = process.platform === "darwin"
    ? execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], {
        encoding: "utf8",
      }).trim()
    : readFileSync("/proc/cpuinfo", "utf8")
        .split("\n")
        .find((line) => line.startsWith("model name"))
        .split(":")[1]
        .trim();
  return `${uname}, ${cpu}`;
})();

const recorded = {
  compiler: version,
  commit,
  machine,
  command: "npm run record:wasm",
  when: new Date().toISOString(),
};
for (const [key, value] of Object.entries(recorded)) {
  if (!value) {
    throw new Error(`provenance field "${key}" came out empty`);
  }
}

// ---------------------------------------------------------------------------
// The curated set
// ---------------------------------------------------------------------------

// Two families. The tour is this site's own: short programs in the order a
// first reader meets them, sectioned in samples/tour/tour.json so the order
// is a decision, and a file that list does not name is an error rather than
// a surprise. The repository's samples are discovered, not listed, so adding
// one to the tree adds it to the record; each stands behind `iyi/` so a
// lesson's program stays runnable without sharing a name with the tour's.
const toc = JSON.parse(readFileSync(join(tourDir, "tour.json"), "utf8"));
if (!Array.isArray(toc.sections) || toc.sections.length === 0) {
  throw new Error(`${tourDir}/tour.json has no sections`);
}
const TOUR = toc.sections.flatMap((section) => {
  if (typeof section.title !== "string" || !Array.isArray(section.steps) || section.steps.length === 0) {
    throw new Error(`${tourDir}/tour.json: a section needs a title and at least one step`);
  }
  return section.steps;
});
if (new Set(TOUR).size !== TOUR.length) {
  throw new Error(`${tourDir}/tour.json names a step twice`);
}
const tourFiles = readdirSync(tourDir)
  .filter((name) => name.endsWith(".iyi"))
  .map((name) => name.slice(0, -".iyi".length))
  .sort();
for (const id of tourFiles) {
  if (!TOUR.includes(id)) {
    throw new Error(`${tourDir}/${id}.iyi is not in tour.json, so it has no place in the tour`);
  }
}
for (const id of TOUR) {
  if (!tourFiles.includes(id)) {
    throw new Error(`tour.json names ${id}, and ${tourDir} has no ${id}.iyi`);
  }
}
const repoIds = readdirSync(samplesDir)
  .filter((name) => name.endsWith(".iyi"))
  .map((name) => name.slice(0, -".iyi".length))
  .sort();
if (repoIds.length === 0) {
  throw new Error(`${samplesDir} has no .iyi files, so the set is not the curated set`);
}

// `slug` is the id with its slash folded, for the file names a module and its
// work directory take.
const order = [
  ...TOUR.map((id) => ({
    id,
    slug: id,
    set: "tour",
    relative: `samples/tour/${id}.iyi`,
    source: resolve(tourDir, `${id}.iyi`),
  })),
  ...repoIds.map((id) => ({
    id: `iyi/${id}`,
    slug: `iyi-${id}`,
    set: "iyi",
    relative: `samples/iyi/${id}.iyi`,
    source: resolve(samplesDir, `${id}.iyi`),
  })),
];

// ---------------------------------------------------------------------------
// The runner, written where it runs
// ---------------------------------------------------------------------------

// node:wasi writes through real file descriptors, so the module's output has
// to be captured from a child process rather than from inside this one. The
// child writes the exit code to a sidecar file, which keeps stdout exactly
// what the module printed and nothing else. node's own ExperimentalWarning
// goes to stderr and is therefore never mistaken for program output.
const RUNNER = `import { WASI } from "node:wasi";
import { readFileSync, writeFileSync } from "node:fs";

const [, , modulePath, name, codePath] = process.argv;
const wasi = new WASI({
  version: "preview1",
  args: [name],
  env: {},
  returnOnExit: true,
});
const module = await WebAssembly.compile(readFileSync(modulePath));
const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
const code = wasi.start(instance);
writeFileSync(codePath, String(code));
`;

const work = mkdtempSync(join(tmpdir(), "iyi-record-wasm-"));
const runner = join(work, "run-wasi.mjs");
writeFileSync(runner, RUNNER, "utf8");

// ---------------------------------------------------------------------------
// Record each sample
// ---------------------------------------------------------------------------

const samples = [];
const nativeOnly = [];

for (const { id, slug, set, relative, source } of order) {
  const dir = join(work, slug);
  mkdirSync(dir, { recursive: true });

  // Step 1: cross-compile. The compiler writes an unlinked module and prints
  // the link command it would have run, which is the command this script then
  // runs with wasi-sdk's clang in place of `cc`. Taking the command from the
  // compiler rather than composing one means the flags cannot drift.
  const cross = spawnSync(
    iyi,
    [
      "build",
      "--cross-compile",
      "--target",
      "wasm32-wasi",
      "-o",
      `${slug}.obj`,
      source,
    ],
    { cwd: dir, encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024 },
  );
  if (cross.status !== 0) {
    const reason = NATIVE_ONLY[id];
    if (!reason) {
      throw new Error(
        `${relative} does not cross-compile for wasm32-wasi (exit ` +
          `${cross.status}):\n${cross.stderr || cross.stdout}`,
      );
    }
    // The compiler's own last line is the evidence: the sentence above says
    // why, the refusal says that it happened.
    const refusal = (cross.stderr || cross.stdout)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("Error:"))
      .pop();
    // What it prints when it does run. Same directory, same empty stdin as
    // the runs below, so the record is of the program and not of a terminal.
    const nativeRun = spawnSync(iyi, ["run", source], {
      cwd: dir,
      encoding: "utf8",
      env,
      input: "",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (nativeRun.status !== 0) {
      throw new Error(
        `${relative} does not run natively either (exit ${nativeRun.status}), ` +
          `so there is nothing to record for it:\n${nativeRun.stderr}`,
      );
    }
    nativeOnly.push({
      id,
      set,
      path: relative,
      sourceSha256: createHash("sha256").update(readFileSync(source)).digest("hex"),
      refusal: refusal ?? null,
      reason,
      exitCode: nativeRun.status,
      nativeStdout: nativeRun.stdout,
      expect: answerKey(nativeRun.stdout),
    });
    continue;
  }
  if (NATIVE_ONLY[id]) {
    throw new Error(
      `${relative} cross-compiles for wasm32-wasi now, so it is not native ` +
        `only. Remove it from NATIVE_ONLY.`,
    );
  }
  const printed = cross.stdout.trim();
  if (!printed) {
    throw new Error(
      `${relative} cross-compiled without printing a link command, so there ` +
        `is nothing to link it with`,
    );
  }

  // Step 2: link, with the compiler's own argument list.
  const tokens = printed.split(/\s+/);
  if (tokens[0] !== "cc") {
    throw new Error(
      `${relative}: the compiler's link command no longer starts with "cc", ` +
        `it starts with "${tokens[0]}". Read it before trusting this script:` +
        `\n${printed}`,
    );
  }
  const dashO = tokens.indexOf("-o");
  if (dashO === -1 || !tokens[dashO + 1]) {
    throw new Error(
      `${relative}: the compiler's link command names no output:\n${printed}`,
    );
  }
  const object = tokens[1];
  if (!existsSync(join(dir, object))) {
    throw new Error(
      `${relative}: the compiler's link command reads ${object}, which it ` +
        `did not write`,
    );
  }
  const linkArgs = tokens.slice(1);
  // The linked module's own name is the only thing about it that depends on
  // where it was built, so it is linked straight to the name the record uses
  // and the recorded bytes are the bytes on disk.
  linkArgs[dashO] = `${slug}.wasm`;
  const link = spawnSync(clang, linkArgs, {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (link.status !== 0) {
    throw new Error(
      `${relative} does not link for wasm32-wasi with ${clang} (exit ` +
        `${link.status}):\n${link.stderr || link.stdout}`,
    );
  }
  const linked = join(dir, `${slug}.wasm`);
  if (!existsSync(linked)) {
    throw new Error(`${relative} linked without producing ${slug}.wasm`);
  }

  // Step 3: run the module. A run that never reached the module at all, a
  // broken runner or a module the engine refuses, is a failure of this script
  // and is reported as one.
  //
  // `input` is empty on purpose and on both runs below. Twelve of the linked
  // modules import four WASI functions and `calc.wasm` imports a fifth,
  // `fd_read`, so stdin is reachable from the prelude and a recorder invoked
  // from a terminal would otherwise hand the two runs different input.
  const codePath = join(dir, "exit-code");
  const wasmRun = spawnSync(
    process.execPath,
    [runner, linked, slug, codePath],
    {
      cwd: dir,
      encoding: "utf8",
      input: "",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (wasmRun.status !== 0) {
    throw new Error(
      `${relative}: node could not run ${slug}.wasm under node:wasi (exit ` +
        `${wasmRun.status}):\n${wasmRun.stderr}`,
    );
  }
  if (!existsSync(codePath)) {
    throw new Error(
      `${relative}: the wasm run left no exit code, so it did not finish`,
    );
  }
  const exitCode = Number(readFileSync(codePath, "utf8"));
  if (!Number.isInteger(exitCode)) {
    throw new Error(
      `${relative}: the wasm run recorded "${readFileSync(codePath, "utf8")}"` +
        ` as its exit code, which is not a number`,
    );
  }
  const wasmStdout = wasmRun.stdout;

  // Step 4: run it natively, for something to compare against. Both runs
  // happen in the same directory, so a sample that touches the filesystem
  // touches the same place either way.
  const native = spawnSync(iyi, ["run", source], {
    cwd: dir,
    encoding: "utf8",
    env,
    input: "",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (native.status !== 0) {
    throw new Error(
      `${relative} does not run natively (exit ${native.status}), so there ` +
        `is nothing to compare the wasm run against:\n${native.stderr}`,
    );
  }
  const nativeStdout = native.stdout;

  const identical = wasmStdout === nativeStdout;
  const note = NOTES[id] ?? null;
  if (!identical && !note) {
    throw new Error(
      `${relative}: the wasm run and the native run print different things ` +
        `and nothing in this script says why. Add the sentence to NOTES, or ` +
        `fix the difference.\n` +
        `wasm32-wasi printed:\n${wasmStdout}\n` +
        `natively it printed:\n${nativeStdout}`,
    );
  }
  if (identical && note) {
    throw new Error(
      `${relative}: NOTES explains a difference that no longer exists. ` +
        `Remove the note.`,
    );
  }

  const bytes = readFileSync(linked);
  // The sample's own bytes, not its text: hashing the file rather than a
  // decoded string keeps the digest identical to what `shasum -a 256` on the
  // sample prints, and to what a browser gets from hashing the editor's
  // contents encoded as UTF-8.
  const sourceBytes = readFileSync(source);
  samples.push({
    id,
    set,
    path: relative,
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    wasm: `${slug}.wasm`,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    exitCode,
    nativeStdout,
    wasmStdout,
    identical,
    note,
    expect: answerKey(wasmStdout),
  });
}

if (samples.length + nativeOnly.length !== order.length) {
  throw new Error(
    `recorded ${samples.length} samples and ${nativeOnly.length} native ` +
      `only of ${order.length}, which cannot happen without a hole in this ` +
      `script`,
  );
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

mkdirSync(out, { recursive: true });

// A module left behind by a sample that no longer exists would still verify,
// which is exactly the kind of stale evidence this pipeline exists to refuse.
const keep = new Set(samples.map((sample) => sample.wasm));
for (const name of readdirSync(out)) {
  if (name.endsWith(".wasm") && !keep.has(name)) {
    rmSync(join(out, name));
  }
}

for (const sample of samples) {
  const from = join(work, sample.wasm.slice(0, -".wasm".length), sample.wasm);
  copyFileSync(from, join(out, sample.wasm));
  const written = statSync(join(out, sample.wasm)).size;
  if (written !== sample.bytes) {
    throw new Error(
      `${sample.wasm} is ${written} bytes where the record says ` +
        `${sample.bytes}`,
    );
  }
}

writeFileSync(
  join(out, "manifest.json"),
  `${JSON.stringify({ recorded, samples, nativeOnly }, null, 2)}\n`,
  "utf8",
);

rmSync(work, { recursive: true, force: true });

const differing = samples.filter((sample) => !sample.identical);
const total = samples.reduce((sum, sample) => sum + sample.bytes, 0);
console.log(
  `wasm: ${samples.length} samples, ${total} bytes linked, ` +
    `${differing.length} differing from native` +
    (differing.length
      ? ` (${differing.map((sample) => sample.id).join(", ")})`
      : "") +
    (nativeOnly.length
      ? `, ${nativeOnly.length} native only (${nativeOnly.map((sample) => sample.id).join(", ")})`
      : "") +
    `, ${clang}, at ${commit.slice(0, 9)}`,
);
