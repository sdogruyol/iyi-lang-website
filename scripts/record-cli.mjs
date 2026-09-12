#!/usr/bin/env node
// Records what `iyi <verb> --help` actually prints, for every verb the
// compiler dispatches.
//
// WHY THIS IS A RECORDING AND NOT A BUILD-TIME READ. The help text of a verb
// is assembled by the binary: `iyi build --help` is Crystal's option parser
// printing the switches it was handed, not a string sitting in a file a
// generator could lift. There is no honest way to produce this page without
// running the compiler, so it is produced the way every other figure that
// needs the compiler is: recorded here, committed under records/, verified at
// build time by scripts/records.mjs, and stamped with the five fields that say
// which binary, which commit, which box, which command and when.
//
// THE DEFECT IT PREVENTS. A CLI reference is the documentation that rots
// first: a switch is added, the page still lists yesterday's. Here a switch
// that moves changes this record or nothing, because nobody types the switch
// list. And a verb that is ADDED is the harder half, because a missing verb
// looks like a complete page. So the verb list is cross-checked, below,
// against the compiler's own dispatch table rather than trusted.
//
// THE THREE SOURCES, AND WHY THE THIRD IS NOT THE COMPLETION FILES.
//
//   1. `Iyi::USAGE` in src/compiler/iyi.cr, the `Command:` rows. What the
//      binary tells a person there is.
//   2. `Iyi::DELEGATED` in the same file, the list `run` actually dispatches
//      on. A verb in one list and not the other is a bug in the compiler and
//      a lie on the site, so disagreement is fatal here.
//   3. The binary itself: each verb is invoked and has to answer with a usage
//      line naming itself.
//
// The assignment asked for the cross-check to be against etc/completion.zsh.
// That file is Crystal's own completion, inherited with the fork: its first
// line is `#compdef crystal` and it names `init`, `docs`, `play` and `spec`,
// none of which iyi has, and none of `mcp`, `migrate`, `bind` or `vet`, which
// it does. Cross-checking against it would compare iyi's verbs with another
// compiler's and pass on nonsense. So the dispatch table is the second source,
// and the completion files are checked conditionally: the moment any of them
// starts naming an iyi-only verb, it has to name all of them.
//
// Regenerate with: npm run record:cli

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "records", "cli.json");

const ENTRY = "src/compiler/iyi.cr";
const COMPLETIONS = ["etc/completion.zsh", "etc/completion.bash", "etc/completion.fish"];

const die = (message) => {
  throw new Error(message);
};

// ---------------------------------------------------------------------------
// Toolchain
// ---------------------------------------------------------------------------

// A built tree's compiler first, because that is the one a person hacking on
// the compiler wants recorded; otherwise the installed one, which is what the
// site's own toolchain has. Either way the exact build is written into the
// record, so the two cannot be confused after the fact.
const built = resolve(process.env.IYI_BUILD ? resolve(process.env.IYI_BUILD) : resolve(repo, ".build"), "iyi");
const iyi = existsSync(built) ? built : "iyi";
const env = { ...process.env, IYI_PATH: resolve(repo, "src") };

const run = (args) => {
  const result = spawnSync(iyi, args, {
    cwd: site,
    encoding: "utf8",
    env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) {
    die(`could not run \`iyi ${args.join(" ")}\`: ${result.error.message}`);
  }
  if (result.status !== 0) {
    die(
      `\`iyi ${args.join(" ")}\` exited ${result.status}. A verb that cannot ` +
        `print its own help is not a verb this site can document:\n${result.stderr}`,
    );
  }
  return result.stdout;
};

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

const version = execFileSync(iyi, ["--version"], { encoding: "utf8", env })
  .split("\n")[0]
  .trim();
if (!version) {
  die(`${iyi} --version printed nothing, so the record cannot say which compiler made it`);
}

const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

const machine = (() => {
  const uname = execFileSync("uname", ["-srm"], { encoding: "utf8" }).trim();
  // Same two spellings the other recorders use: sysctl on darwin, /proc on
  // Linux. A record is made on either.
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
  command: "npm run record:cli",
  when: new Date().toISOString(),
};
for (const [key, value] of Object.entries(recorded)) {
  if (!value) die(`provenance field "${key}" came out empty`);
}

// ---------------------------------------------------------------------------
// The usage text, and the proof that the binary is this tree's
// ---------------------------------------------------------------------------

const entryLines = readFileSync(resolve(repo, ENTRY), "utf8").split("\n");

// The heredoc body, dedented the way Crystal's `<<-` dedents it: by the least
// indented non-blank line. Read from source rather than from the binary so the
// page can cite the lines it came from, and compared with the binary's own
// output below so the citation is not merely plausible.
const usage = (() => {
  const open = entryLines.findIndex((line) => line.includes("USAGE = <<-USAGE"));
  if (open < 0) die(`${ENTRY} no longer opens a USAGE heredoc, so this script cannot find the command list`);
  let close = open + 1;
  while (close < entryLines.length && !/^\s*USAGE\s*$/.test(entryLines[close])) close++;
  if (close >= entryLines.length) die(`${ENTRY}:${open + 1} opens a USAGE heredoc that never closes`);
  const body = entryLines.slice(open + 1, close);
  const indent = Math.min(...body.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  return {
    text: body.map((line) => line.slice(indent)).join("\n"),
    from: open + 2,
    to: close,
  };
})();

const printed = run(["help"]).replace(/\n$/, "");
if (printed !== usage.text) {
  die(
    `\`iyi help\` does not print what ${ENTRY}:${usage.from} says. The binary ` +
      `being recorded was built from a different tree than the one this ` +
      `record cites, and a page that quoted both would be quoting two ` +
      `compilers.`,
  );
}

// The `Command:` rows: a verb and the sentence beside it, as a reader of
// `iyi help` meets them. Anything outside that block is a switch or prose.
const rows = (() => {
  const lines = usage.text.split("\n");
  const start = lines.findIndex((line) => line.trim() === "Command:");
  if (start < 0) die(`${ENTRY}'s usage has no "Command:" block`);
  const found = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") break;
    const row = /^\s{4,}(\S+)\s{2,}(\S.*)$/.exec(lines[i]);
    if (!row) die(`${ENTRY}'s command list has a row this script cannot read: ${JSON.stringify(lines[i])}`);
    found.push({ name: row[1], summary: row[2].trim() });
  }
  if (found.length === 0) die(`${ENTRY}'s "Command:" block lists nothing`);
  return found;
})();

// ---------------------------------------------------------------------------
// The dispatch table, and the disagreement that is fatal
// ---------------------------------------------------------------------------

const wordList = (constant) => {
  const line = entryLines.find((text) => text.trimStart().startsWith(`${constant} = %w(`));
  if (!line) die(`${ENTRY} no longer declares ${constant}, which is how this script knows which verbs the binary dispatches`);
  const inside = /%w\(([^)]*)\)/.exec(line);
  if (!inside) die(`${ENTRY}'s ${constant} is no longer a one-line %w() list`);
  return {
    names: inside[1].trim().split(/\s+/),
    line: entryLines.indexOf(line) + 1,
  };
};

const delegated = wordList("DELEGATED");
const crystalOnly = wordList("CRYSTAL_ONLY");

// `help` and `version` are answered by `Iyi.run` itself, before dispatch, so
// they are named in the usage and absent from the table by construction. Every
// other row has to be a verb the binary dispatches, and every verb it
// dispatches has to be a row.
const SELF_ANSWERED = ["help", "version"];
const dispatched = new Set(delegated.names);
const listed = new Set(rows.map((row) => row.name));

const undocumented = delegated.names.filter((name) => !listed.has(name));
if (undocumented.length > 0) {
  die(
    `${ENTRY}:${delegated.line} dispatches ${undocumented.join(", ")}, which ` +
      `\`iyi help\` does not list. A verb the site cannot see is exactly what ` +
      `this cross-check is for: add the row, then record again.`,
  );
}

const undispatched = rows
  .map((row) => row.name)
  .filter((name) => !dispatched.has(name) && !SELF_ANSWERED.includes(name));
if (undispatched.length > 0) {
  die(
    `\`iyi help\` lists ${undispatched.join(", ")}, which ${ENTRY}:${delegated.line} ` +
      `does not dispatch and \`Iyi.run\` does not answer itself. One of the ` +
      `two is stale and the site will not publish either until they agree.`,
  );
}

// The completion files, conditionally, and the condition is the file's own
// declaration of which binary it completes rather than a search for verb
// names in it. Searching for names was the first attempt and it fired on
// Crystal's fish completion, which says "check" inside an English
// description of a switch: a gate that fails on prose teaches people to
// delete gates. Today all three files complete `crystal`, so none of them is
// a claim about iyi's verbs. The day one is regenerated for `iyi`, it has to
// name every verb the binary dispatches, because a completion that is one
// verb short puts a stale command list into somebody's shell.
const COMPLETES = [/^#compdef\s+(\S+)/m, /complete\s+-c\s+(\S+)/, /complete\b[^\n]*\s(\S+)\s*$/m];
for (const relative of COMPLETIONS) {
  const path = resolve(repo, relative);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  const completes = COMPLETES.map((pattern) => pattern.exec(text)?.[1]).find(Boolean);
  if (completes !== "iyi") continue;
  const missing = delegated.names.filter(
    (name) => !new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(text),
  );
  if (missing.length === 0) continue;
  die(
    `${relative} completes iyi but never names ${missing.join(", ")}, so a ` +
      `shell completing an iyi command line would offer a verb list this ` +
      `binary has outgrown.`,
  );
}

// ---------------------------------------------------------------------------
// Ask every verb for its help
// ---------------------------------------------------------------------------

// In the order the usage lists them, which is the order a reader met them.
const order = new Map(rows.map((row, index) => [row.name, index]));
const verbs = [];

for (const name of [...delegated.names].sort((a, b) => order.get(a) - order.get(b))) {
  const args = [name, "--help"];
  const help = run(args).replace(/\n$/, "");

  // The verb has to name itself in its own usage line. Without this, a verb
  // whose flag parsing changed could answer with the general usage and the
  // page would show the same text eighteen times.
  const first = help.split("\n")[0];
  if (!first.startsWith(`Usage: iyi ${name}`)) {
    die(
      `\`iyi ${name} --help\` answers with ${JSON.stringify(first)}, which does ` +
        `not open "Usage: iyi ${name}". Either the verb stopped handling ` +
        `--help or it printed somebody else's help.`,
    );
  }

  verbs.push({
    name,
    summary: rows[order.get(name)].summary,
    // Written by name, not by path: the path is per machine and
    // `recorded.compiler` already pins the build.
    command: `iyi ${args.join(" ")}`,
    help,
    lines: help.split("\n").length,
  });
}

if (verbs.length !== delegated.names.length) {
  die(`recorded ${verbs.length} verbs of ${delegated.names.length}, which cannot happen without a hole in this script`);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const record = {
  recorded,
  usage: {
    ...usage,
    source: ENTRY,
    cite: `${ENTRY}, lines ${usage.from} to ${usage.to}`,
    dispatch: `${ENTRY}:${delegated.line}`,
  },
  verbs,
  // The three verbs iyi refuses by name rather than pretending not to know.
  // A page that listed the commands without these would leave a reader to
  // discover `iyi spec` the hard way.
  crystal_only: crystalOnly.names.map((name) => ({ name, line: crystalOnly.line })),
  self_answered: SELF_ANSWERED.map((name) => ({
    name,
    summary: rows[order.get(name)].summary,
  })),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");

const total = verbs.reduce((n, verb) => n + verb.lines, 0);
console.log(
  `cli: ${verbs.length} verbs, ${total} lines of help, usage from ` +
    `${ENTRY}:${usage.from} to ${usage.to}, at ${commit.slice(0, 9)}`,
);
