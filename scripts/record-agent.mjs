#!/usr/bin/env node
// Records the loop an agent actually runs, by running it.
//
// WHAT THIS IS FOR. The site's first line says iyi is a language for people
// and their agents. Every other claim on the site is measured or replayed;
// that one was four paragraphs of prose about verbs, and prose about a
// compiler is a claim about a compiler rather than a reading of one. So the
// claim is recorded instead: a real project, in the state an agent meets it,
// taken to green by the compiler's own verbs, with every frame's command,
// exit code and bytes kept exactly as they came out.
//
// THE PROJECT IS COMMITTED AND BROKEN ON PURPOSE. `records/agent/` holds four
// modules: a consumer with one misspelled call, the dependency it imports, a
// test, and a module nothing imports so test selection has a change it can
// prove no test reaches. It stays broken in the tree, because the first frame
// of the loop is the compiler refusing it. The loop runs on a copy, so a
// recording never edits the thing it records.
//
// TWO GATES THIS SCRIPT APPLIES, and both are claims the site makes.
//
// 1. Every frame declares the exit code it expects. A verb that starts
//    succeeding where the page shows it failing, or the reverse, fails the
//    recording rather than quietly changing what the page teaches. This is
//    the contract `scripts/record-diagnostics.mjs` keeps with its `expect`
//    substrings, applied to a status instead of a sentence.
//
// 2. The site says a harness gets over MCP byte for byte what a shell would
//    have printed. That is checkable, so it is checked: the recorder runs
//    `iyi check -f json` in a shell and calls the `check` tool over MCP
//    stdio, and refuses to write a record whose two answers differ. A
//    sentence about a wire protocol that nobody compared is exactly the kind
//    of sentence this site exists to refuse.
//
// PATHS ARE NORMALISED, and that is the one edit made to any output. The
// compiler prints absolute paths, which name the machine that recorded rather
// than the program that ran. The working copy's root becomes `agent`, and the
// iyi checkout becomes `<iyi>`, which is the same substitution
// `records/diagnostics.json` already carries in its commands. Nothing else in
// any frame is touched.
//
// Regenerate with: npm run record:agent

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const corpus = resolve(site, "records", "agent");
const out = resolve(site, "records", "agent.json");

// ---------------------------------------------------------------------------
// Toolchain
// ---------------------------------------------------------------------------

const buildDir = process.env.IYI_BUILD ? resolve(process.env.IYI_BUILD) : resolve(repo, ".build");
const iyi = join(buildDir, "iyi");
if (!existsSync(iyi)) {
  throw new Error(
    `no iyi compiler at ${iyi}. Build it, or set IYI_BUILD to the directory ` +
      `holding the iyi and crystal binaries.`,
  );
}
if (!existsSync(corpus)) {
  throw new Error(`no project at ${corpus}, so there is no loop to record`);
}

const env = { ...process.env, IYI_PATH: resolve(repo, "src"), NO_COLOR: "1" };

// ---------------------------------------------------------------------------
// Provenance, in the shape every other record here carries
// ---------------------------------------------------------------------------

const version = execFileSync(iyi, ["--version"], { encoding: "utf8" }).split("\n")[0].trim();
if (!version) {
  throw new Error(`${iyi} --version printed nothing, so the record cannot say which compiler made it`);
}

const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const machine = (() => {
  const uname = execFileSync("uname", ["-srm"], { encoding: "utf8" }).trim();
  const cpu =
    process.platform === "darwin"
      ? execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], { encoding: "utf8" }).trim()
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
  command: "npm run record:agent",
  when: new Date().toISOString(),
};
for (const [key, value] of Object.entries(recorded)) {
  if (!value) throw new Error(`provenance field "${key}" came out empty`);
}

// ---------------------------------------------------------------------------
// The working copy
// ---------------------------------------------------------------------------

const work = mkdtempSync(join(tmpdir(), "iyi-agent-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));
cpSync(corpus, work, { recursive: true });

/** Every `.iyi` in the committed project, keyed by its path in this tree. */
const project = (() => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.endsWith(".iyi")) continue;
      const text = readFileSync(path, "utf8");
      files.push({
        path: relative(site, path).split("\\").join("/"),
        name: relative(corpus, path).split("\\").join("/"),
        text,
        lines: text.replace(/\n$/, "").split("\n").length,
        bytes: Buffer.byteLength(text, "utf8"),
      });
    }
  };
  walk(corpus);
  if (files.length === 0) throw new Error(`${corpus} holds no .iyi program`);
  return files;
})();

/* The absolute paths out of any output, longest first.
 *
 * Order is load-bearing and got this wrong once: this site's directory is
 * `iyi-lang-website` and the compiler's is `iyi`, so substituting the
 * compiler's path first turned `.../iyi-lang-website/records/agent/app.iyi`
 * into `<iyi>-lang-website/...`. The working copy and the committed corpus
 * both normalise to `agent`, which is the path a reader can check, and the
 * two roots that are only ever a machine's become named placeholders. */
const clean = (text) =>
  [
    [work, "agent"],
    [corpus, "agent"],
    [site, "<site>"],
    [repo, "<iyi>"],
  ]
    .reduce((carry, [from, to]) => carry.split(from).join(to), text)
    .replace(/\r\n/g, "\n");

/**
 * One frame: run the verb, keep what it said, and refuse when its status is
 * not the one the page is built on.
 *
 * `expect` is the exit code this frame exists to show. A frame that shows the
 * compiler refusing a program is worthless if the compiler stopped refusing
 * it, and a frame that shows it accepting one is worse.
 *
 * `payload` names the stream this verb answers on, and it is not decoration.
 * `mod context` and `mod diff` answer on stdout; `check -f json` answers on
 * stderr, because an error is an error whatever its format, and a harness
 * that read stdout for a verdict would read an empty string as a pass. The
 * page shows the stream the verb actually used, so nobody learns the wrong
 * plumbing from it.
 */
const frames = [];
function frame({ id, title, note, args, expect, payload = "stdout", cwd = work }) {
  const run = spawnSync(iyi, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (run.error) {
    throw new Error(`could not run "iyi ${args.join(" ")}": ${run.error.message}`);
  }
  if (run.signal) {
    throw new Error(`"iyi ${args.join(" ")}" was killed by ${run.signal}`);
  }
  if (run.status !== expect) {
    throw new Error(
      `"iyi ${args.join(" ")}" exited ${run.status} and the recording is ` +
        `built on ${expect}. The verb's verdict moved, so the page that shows ` +
        `this frame would be describing a compiler that no longer exists.\n\n` +
        `${clean(run.stdout)}${clean(run.stderr)}`,
    );
  }
  const entry = {
    id,
    title,
    note,
    command: `iyi ${args.join(" ")}`,
    exitCode: run.status,
    payload,
    stdout: clean(run.stdout),
    stderr: clean(run.stderr),
  };
  if (entry[payload].trim() === "" && expect !== 0) {
    throw new Error(`"iyi ${args.join(" ")}" wrote nothing to ${payload}, which is where this frame reads its answer`);
  }
  frames.push(entry);
  return entry;
}

/** What a frame answered, off the stream it answers on. */
const answer = (entry) => entry[entry.payload].trim();

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/* 1. Ground the edit. `mod context` reads every import's exported surface out
 * of source without compiling the file being edited, which is the whole point:
 * the pack is available before the program is correct. */
const ground = frame({
  id: "ground",
  title: "Read the interface, not the repository",
  note:
    "Every import's exported surface as data: signatures, doc comments and the " +
    "interface hash they are keyed by, with no body anywhere in it. Read out of " +
    "source, without compiling the file being edited, so it is available while " +
    "the program is still wrong.",
  args: ["mod", "context", "--json", "app.iyi"],
  expect: 0,
});

/* What the pack cost against what it replaces. The comparison the site can
 * make honestly is the one the pack is a substitute for: the sources of every
 * module `app.iyi` imports. Computed here, from the same bytes, rather than
 * stated. */
const packed = (() => {
  const pack = JSON.parse(answer(ground));
  const imports = pack.imports.map((entry) => entry.import);
  const sourceBytes = project
    .filter((file) => imports.some((name) => file.name === `${name}.iyi`))
    .reduce((total, file) => total + file.bytes, 0);
  if (sourceBytes === 0) {
    throw new Error(
      `the pack names imports ${imports.join(", ")} and none of them matches a ` +
        `file in ${corpus}, so the site cannot say what the pack replaced`,
    );
  }
  return {
    imports,
    bytes: Buffer.byteLength(answer(ground), "utf8"),
    sourceBytes,
    interfaceHashes: Object.fromEntries(
      pack.imports.map((entry) => [entry.import, entry.api.interface_hash]),
    ),
  };
})();

/* 2. Ask the compiler. Under `-f json` every error is data, and where the
 * compiler knows the fix it carries the exact replacement span. */
const verdict = frame({
  id: "check",
  title: "The verdict as data",
  note:
    "`check` is a build with no codegen and its name said plainly. Under " +
    "`-f json` each error is a record: the file, the line, the column, the " +
    "span's size, the message, and a `suggested_edit` naming the exact " +
    "replacement when the compiler knows one.",
  args: ["check", "-f", "json", "app.iyi"],
  payload: "stderr",
  expect: 1,
});

/* The edit the compiler offered, lifted out of its own JSON so the page can
 * name it without retyping it. */
const suggested = (() => {
  const errors = JSON.parse(answer(verdict));
  const withEdit = errors.filter((error) => error.suggested_edit);
  if (withEdit.length === 0) {
    throw new Error(
      `iyi check -f json on the recorded project offered no suggested_edit, ` +
        `and the page's whole argument is that it does. Either the project ` +
        `stopped carrying a fixable mistake or the compiler stopped offering ` +
        `the span.\n\n${verdict.stdout}`,
    );
  }
  return withEdit.map((error) => error.suggested_edit);
})();

/* 3. Apply it. `fix` recompiles after each edit and stops at the first error
 * that carries none, so it converges or it says why. */
const applied = frame({
  id: "fix",
  title: "Apply the compiler's own edit",
  note:
    "`fix` applies the suggested edits and recompiles after each one, until " +
    "the file is clean or an error carries no edit. The agent spends no round " +
    "on a repair the compiler already knows how to make.",
  args: ["fix", "app.iyi"],
  expect: 0,
});
if (!applied.stdout.includes("fixed")) {
  throw new Error(
    `iyi fix printed no edit, so the recording has no repair to show:\n\n${applied.stdout}${applied.stderr}`,
  );
}

/* The file as the fix left it, so the page can show the one line that moved
 * without anyone transcribing it. */
const repaired = (() => {
  const path = join(work, "app.iyi");
  const before = project.find((file) => file.name === "app.iyi");
  if (!before) throw new Error(`records/agent/app.iyi is not in the project`);
  const after = readFileSync(path, "utf8");
  if (after === before.text) {
    throw new Error(`iyi fix reported an edit and app.iyi is byte identical, which cannot both be true`);
  }
  const a = before.text.split("\n");
  const b = after.split("\n");
  const changed = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) changed.push({ line: i + 1, before: a[i] ?? null, after: b[i] ?? null });
  }
  return { text: after, changed };
})();

/* 4. Confirm. Nothing to print on success: the verdict is the exit code. */
frame({
  id: "clean",
  title: "Green, and silent about it",
  note:
    "The verdict is the exit code, so a clean program prints nothing. There is " +
    "no output for a harness to parse for the word success.",
  args: ["check", "app.iyi"],
  expect: 0,
});

/* 5. Re-run what the change can reach, and nothing else. The rule is the
 * transitive import closure, computed by parsing, so the answer is exact
 * rather than a heuristic. Both directions are recorded, because the half
 * that is easy to claim is the half where tests run. */
frame({
  id: "affected-hit",
  title: "Re-run what the change reaches",
  note:
    "A test is affected exactly when the changed file is in its transitive " +
    "import closure. The closure is parsed, never compiled, because R-1 makes " +
    "the import list syntax.",
  args: ["test", "--affected", "app/greeter.iyi"],
  expect: 0,
});
const missed = frame({
  id: "affected-miss",
  title: "And skip what it does not",
  note:
    "The same question about a module nothing imports. The selection is exact, " +
    "so the skip is a fact rather than an optimisation that might be wrong.",
  args: ["test", "--affected", "other.iyi"],
  expect: 0,
});
if (!missed.stdout.includes("skipped")) {
  throw new Error(
    `iyi test --affected other.iyi skipped nothing, so the recording cannot ` +
      `show test selection refusing to run:\n\n${missed.stdout}`,
  );
}
frame({
  id: "tests-json",
  title: "The run as data",
  note: "`--json` for a harness that has to read the result rather than a person who reads it.",
  args: ["test", "--json", "."],
  expect: 0,
});

/* 6. Does the edit reach the consumers? Two `.iyimod` artifacts of one module
 * answer it, and the answer is the language's whole thesis in one line: a body
 * that changed and an interface that did not means nobody rebuilds. */
execFileSync(iyi, ["build", "--emit-iyimod", "before", "--no-codegen", "app.iyi"], { cwd: work, env });

const greeter = join(work, "app", "greeter.iyi");
const greeterBefore = readFileSync(greeter, "utf8");

/* A body-only edit: the greeting a function returns, not its signature. */
const bodyEdit = greeterBefore.replace('"Hello"', '"Merhaba"');
if (bodyEdit === greeterBefore) {
  throw new Error(`records/agent/app/greeter.iyi no longer carries the body this recording edits`);
}
writeFileSync(greeter, bodyEdit, "utf8");
execFileSync(iyi, ["build", "--emit-iyimod", "after-body", "--no-codegen", "app.iyi"], { cwd: work, env });
const diffBody = frame({
  id: "diff-body",
  title: "A body moved, so nobody rebuilds",
  note:
    "One module's greeting changed and its declarations did not. `mod diff` " +
    "reads the two artifacts and answers whether the change reaches anyone, " +
    "which is the question the whole rule exists to make answerable.",
  args: ["mod", "diff", "before/app/greeter.iyimod", "after-body/app/greeter.iyimod"],
  expect: 0,
});
if (!/interface\s+unchanged/.test(diffBody.stdout)) {
  throw new Error(
    `a body-only edit moved the interface, so this frame no longer shows what ` +
      `it claims:\n\n${diffBody.stdout}`,
  );
}

/* A signature edit: the same file, one exported type written differently. */
const apiEdit = bodyEdit.replace(
  "pub def shout(name : String) : String",
  "pub def shout(name : String, times : Int32) : String",
);
if (apiEdit === bodyEdit) {
  throw new Error(`records/agent/app/greeter.iyi no longer carries the signature this recording edits`);
}
writeFileSync(greeter, apiEdit, "utf8");
execFileSync(iyi, ["build", "--emit-iyimod", "after-api", "--no-codegen", "app.iyi"], { cwd: work, env });
const diffApi = frame({
  id: "diff-api",
  title: "A declaration moved, so they do",
  note:
    "The same file again, with one exported signature written differently. " +
    "The artifact names what went and what arrived, so a consumer's rebuild is " +
    "a consequence rather than a guess.",
  args: ["mod", "diff", "before/app/greeter.iyimod", "after-api/app/greeter.iyimod"],
  expect: 0,
});
if (!/interface\s+changed/.test(diffApi.stdout)) {
  throw new Error(
    `a signature edit left the interface unchanged, so this frame no longer ` +
      `shows what it claims:\n\n${diffApi.stdout}`,
  );
}
writeFileSync(greeter, greeterBefore, "utf8");

// ---------------------------------------------------------------------------
// The same verbs over the protocol, and the comparison that makes that a fact
// ---------------------------------------------------------------------------

/* The shell's answer first, on the file in the state the page shows it in: the
 * working copy's `app.iyi` has been fixed, so this asks the committed one. */
const shellCheck = spawnSync(iyi, ["check", "-f", "json", "app.iyi"], {
  cwd: corpus,
  env,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
if (shellCheck.status !== 1) {
  throw new Error(`iyi check on the committed project exited ${shellCheck.status}, expected 1`);
}

const rpc = (id, method, params) =>
  JSON.stringify(params === undefined ? { jsonrpc: "2.0", id, method } : { jsonrpc: "2.0", id, method, params });

const mcp = spawnSync(
  iyi,
  ["mcp"],
  {
    cwd: corpus,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    input:
      [
        rpc(1, "initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "iyi.dev recorder", version: "1" },
        }),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        rpc(2, "tools/list"),
        rpc(3, "tools/call", { name: "check", arguments: { file: "app.iyi" } }),
      ].join("\n") + "\n",
  },
);
if (mcp.error) throw new Error(`could not run "iyi mcp": ${mcp.error.message}`);

const answers = new Map();
for (const line of mcp.stdout.split("\n")) {
  const text = line.trim();
  if (!text) continue;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    throw new Error(`iyi mcp wrote a line that is not JSON-RPC:\n${text}`);
  }
  if (message.id !== undefined) answers.set(message.id, message);
}
for (const id of [1, 2, 3]) {
  if (!answers.has(id)) {
    throw new Error(`iyi mcp never answered request ${id}. It wrote:\n${mcp.stdout}`);
  }
}

const wire = {
  /* The handshake, kept as the server sent it. */
  initialize: answers.get(1).result,
  tools: answers.get(2).result.tools.map((tool) => tool.name),
  /* THE COMPARISON. Same verb, same file, two doors. */
  /* `check` answers on stderr, so that is the answer being compared. */
  shell: clean(shellCheck.stderr.trim()),
  mcp: clean(
    answers
      .get(3)
      .result.content.map((part) => part.text)
      .join("")
      .trim(),
  ),
};
wire.identical = wire.shell === wire.mcp;
wire.bytes = Buffer.byteLength(wire.shell, "utf8");

if (!wire.identical) {
  throw new Error(
    `the site says a harness gets over MCP byte for byte what a shell would ` +
      `have printed, and the two differ, so that sentence cannot be published.\n\n` +
      `shell:\n${wire.shell}\n\nmcp:\n${wire.mcp}\n`,
  );
}
if (wire.tools.length === 0) {
  throw new Error(`iyi mcp advertised no tools, so there is no catalogue to show`);
}

// ---------------------------------------------------------------------------
// Write it
// ---------------------------------------------------------------------------

const record = {
  recorded,
  project,
  frames,
  pack: packed,
  suggested,
  repaired,
  wire,
};

writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");

console.log(
  `agent: ${frames.length} frames over ${project.length} modules, ` +
    `${wire.tools.length} MCP tools (${wire.tools.join(", ")}), ` +
    `shell and wire byte identical at ${wire.bytes} bytes, ` +
    `recorded by ${version.split(" ")[1]} at ${commit.slice(0, 9)}`,
);
