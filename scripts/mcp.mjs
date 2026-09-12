#!/usr/bin/env node
// The MCP tool catalogue, taken out of the compiler that serves it.
//
// THE HOLE THIS FILLS. The site's pitch is "for people and their agents" and
// it shows an agent nothing it could point a harness at. The catalogue exists:
// `MCP_TOOLS` in src/compiler/iyi/command/mcp.cr is a verbatim JSON literal of
// five tools, each with the description and the input schema a harness reads
// at `tools/list`. What an agent is told over the wire and what the site says
// an agent is told have to be the same bytes, so the literal is lifted rather
// than described.
//
// THE READBACK. A schema is the one kind of text where a paraphrase is
// undetectable and fatal: a wrong `required` list is a tool call that fails at
// the harness, and nobody reads a schema closely enough to notice a missing
// field. So the extraction is proved three ways before anything is written:
//
//   1. The lifted text parses as JSON. A literal the compiler embeds that this
//      script cannot parse means the span is wrong, not that JSON moved on.
//   2. The lifted text, re-indented the way the source indents it, is compared
//      byte for byte with the source slice it came from. That is what proves
//      the span is exactly the literal and the dedent lost nothing.
//   3. Every tool in the catalogue is dispatched by `mcp_call`, and everything
//      `mcp_call` dispatches is in the catalogue. A tool advertised and not
//      implemented is an agent's failed call; a tool implemented and not
//      advertised is one no agent will ever make.
//
// The site's /agents/ page records a live handshake with this server. This
// file is the contract, not the transcript: nothing here runs the compiler and
// nothing here is a measurement.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inline } from "./markdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated", "mcp.json");

const SERVER = "src/compiler/iyi/command/mcp.cr";
const LSP = "src/compiler/iyi/lsp/server.cr";

const die = (message) => {
  throw new Error(message);
};

const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

const serverText = readFileSync(resolve(repo, SERVER), "utf8");
const serverLines = serverText.replace(/\n$/, "").split("\n");

// ---------------------------------------------------------------------------
// The literal
// ---------------------------------------------------------------------------

const literal = (() => {
  const open = serverLines.findIndex((line) => /MCP_TOOLS\s*=\s*<<-JSON\s*$/.test(line));
  if (open < 0) die(`${SERVER} no longer declares MCP_TOOLS as a <<-JSON heredoc, which is the whole catalogue`);
  let close = open + 1;
  while (close < serverLines.length && !/^\s*JSON\s*$/.test(serverLines[close])) close++;
  if (close >= serverLines.length) die(`${SERVER}:${open + 1} opens a JSON heredoc that never closes`);

  const body = serverLines.slice(open + 1, close);
  // Crystal's `<<-` strips the indentation of the least indented line. The
  // page shows the literal as JSON, so it is dedented here and re-indented
  // below to prove nothing else was touched.
  const indent = Math.min(...body.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  const text = body.map((line) => line.slice(indent)).join("\n");

  const reindented = text.split("\n").map((line) => (line === "" ? "" : " ".repeat(indent) + line));
  if (reindented.join("\n") !== body.join("\n")) {
    die(
      `the catalogue lifted out of ${SERVER}:${open + 2} does not re-indent ` +
        `back into the source slice it came from, so the extracted span is ` +
        `not the literal the compiler serves`,
    );
  }

  return { text, from: open + 2, to: close, indent };
})();

let catalogue;
try {
  catalogue = JSON.parse(literal.text);
} catch (error) {
  die(`${SERVER}:${literal.from} does not parse as JSON: ${error.message}. The compiler embeds this text and serves it as the catalogue, so a span that will not parse is the wrong span.`);
}
if (!Array.isArray(catalogue) || catalogue.length === 0) {
  die(`${SERVER}:${literal.from} parses as ${typeof catalogue}, not a non-empty array of tools`);
}

// ---------------------------------------------------------------------------
// The catalogue against the implementation
// ---------------------------------------------------------------------------

// The `when "name"` arms of `mcp_call`: what the server will actually run.
const dispatched = (() => {
  const start = serverLines.findIndex((line) => line.includes("private def mcp_call"));
  if (start < 0) die(`${SERVER} no longer defines mcp_call, which is what turns a tool name into a command`);
  const names = [];
  for (let i = start; i < serverLines.length; i++) {
    if (/^\s*private def mcp_tool_error/.test(serverLines[i])) break;
    const arm = /^\s*when "([a-z_]+)"\s*$/.exec(serverLines[i]);
    if (arm) names.push({ name: arm[1], line: i + 1 });
  }
  if (names.length === 0) die(`${SERVER}'s mcp_call dispatches on nothing this script can read`);
  return names;
})();

const advertised = catalogue.map((tool) => tool.name);
const missing = advertised.filter((name) => !dispatched.some((arm) => arm.name === name));
if (missing.length > 0) {
  die(
    `${SERVER} advertises ${missing.join(", ")} in MCP_TOOLS and mcp_call ` +
      `dispatches no such tool. An agent that called it would get "unknown tool".`,
  );
}
const unadvertised = dispatched.filter((arm) => !advertised.includes(arm.name));
if (unadvertised.length > 0) {
  die(
    `${SERVER}:${unadvertised[0].line} implements ${unadvertised.map((arm) => arm.name).join(", ")}, ` +
      `which MCP_TOOLS does not list, so no harness will ever call it and the ` +
      `site would be publishing a catalogue the server has outgrown.`,
  );
}

// The command each tool becomes, read out of the arm's own argv literal. "A
// shell around the same binary" is the claim the page makes, and this array
// is the line that either supports it or does not.
//
// Scraping every quoted string out of the arm was the first attempt and it
// produced `iyi target doc`: an arm's body also holds the error sentence a
// guard prints and the keys it digs out of the call. So only the argv literal
// is read, and a bare word in it is a value the call supplies, written as a
// placeholder rather than as though it were a fixed argument.
const commandOf = (name) => {
  const arm = dispatched.find((entry) => entry.name === name);
  let base = null;
  const appended = [];
  for (let i = arm.line; i < serverLines.length; i++) {
    const line = serverLines[i];
    if (i > arm.line && (/^\s*when "/.test(line) || /^\s*else\s*$/.test(line))) break;
    const argv = /^\s*(?:\w+ = )?\[("[^\]]*)\]\s*$/.exec(line);
    if (argv && !base) {
      base = argv[1]
        .split(",")
        .map((token) => token.trim())
        .map((token) => (token.startsWith('"') ? token.slice(1, -1) : `<${token}>`));
      continue;
    }
    // `built << "--affected" << path`: arguments appended when the call
    // carries them, which is why they are optional on the page.
    for (const match of line.matchAll(/<<\s*"([^"]+)"/g)) appended.push(match[1]);
  }
  if (!base) die(`${SERVER}:${arm.line} runs "${name}" with an argument list this script cannot read`);
  return { command: `iyi ${base.join(" ")}`, optional: appended };
};

// ---------------------------------------------------------------------------
// What the server speaks
// ---------------------------------------------------------------------------

// The `when` arms of the message loop: the subset of MCP this server serves.
// Published so a harness author can see there is no fifth thing to implement.
const methods = (() => {
  const start = serverLines.findIndex((line) => line.includes("private def mcp") && !line.includes("mcp_call"));
  const end = serverLines.findIndex((line, index) => index > start && /^\s*private def mcp_call/.test(line));
  const found = [];
  for (let i = start; i < end; i++) {
    const arm = /^\s*when ((?:"[^"]+"(?:,\s*)?)+)$/.exec(serverLines[i]);
    if (!arm) continue;
    for (const match of arm[1].matchAll(/"([^"]+)"/g)) found.push({ method: match[1], line: i + 1 });
  }
  if (found.length === 0) die(`${SERVER}'s message loop answers no method this script can read`);
  return found;
})();

// The protocol version the server falls back to when a client names none.
const protocol = (() => {
  const line = serverLines.find((text) => text.includes('"protocolVersion"'));
  const version = line && /\|\|\s*"([^"]+)"/.exec(line);
  if (!version) die(`${SERVER} no longer states a default protocolVersion, which is the one thing a harness has to agree with the server about`);
  return { version: version[1], line: serverLines.indexOf(line) + 1 };
})();

// What a client gets for a method the server does not speak, read out of the
// arm that prints it. Scoped to the `else` of the message loop: the rescue
// above it answers a line that is not JSON at all, and quoting that one as
// though it were the unknown-method answer would put the wrong code on the
// page. Which is what the first version of this did.
const unknown = (() => {
  const from = serverLines.findIndex((text, index) => /^\s*else\s*$/.test(text) && index > protocol.line);
  const line = serverLines.slice(from).find((text) => text.includes('"code": -') && text.includes('"message"'));
  const parsed = line && /"code": (-?\d+), "message": "([^"]+)"/.exec(line);
  if (!parsed) die(`${SERVER} no longer answers an unknown method with a JSON-RPC error this script can read`);
  return { code: Number(parsed[1]), message: parsed[2], line: serverLines.indexOf(line) + 1 };
})();

// ---------------------------------------------------------------------------
// The two methods beyond LSP
// ---------------------------------------------------------------------------

// `iyi/contextPack` and `iyi/surface` are the editor-side half of the same
// stance: an extension to the protocol that runs an existing verb. Read from
// the dispatch, with the verb it delegates to, so the page cannot claim a
// method the server does not answer.
const lspLines = readFileSync(resolve(repo, LSP), "utf8").split("\n");
const custom = [];
lspLines.forEach((line, index) => {
  const arm = /^\s*when "(iyi\/[A-Za-z]+)"\s*$/.exec(line);
  if (!arm) return;
  const next = lspLines[index + 1] ?? "";
  const args = [...next.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  if (args.length === 0) {
    die(`${LSP}:${index + 2} answers ${arm[1]} with something this script cannot read as a delegated command`);
  }
  custom.push({
    method: arm[1],
    delegates: `iyi ${args.join(" ")}`,
    line: index + 1,
    cite: `${LSP}:${index + 1}`,
  });
});
if (custom.length === 0) {
  die(`${LSP} answers no iyi/* method, so the two the site names are gone and the page would be naming methods no server speaks`);
}

// ---------------------------------------------------------------------------
// The tools, as a page can set them
// ---------------------------------------------------------------------------

const tools = catalogue.map((tool) => {
  const schema = tool.inputSchema;
  if (!schema || schema.type !== "object" || typeof schema.properties !== "object") {
    die(`the "${tool.name}" tool has no object inputSchema with properties, so a harness has nothing to fill in`);
  }
  const required = new Set(schema.required ?? []);
  const runs = commandOf(tool.name);
  return {
    name: tool.name,
    description: tool.description,
    // Backticks in a description are markdown the harness shows raw; the page
    // sets them as code, which is the only change this script makes to the
    // text, and it is a change of face and not of words.
    html: inline(tool.description),
    command: runs.command,
    optional: runs.optional,
    line: dispatched.find((arm) => arm.name === tool.name).line,
    arguments: Object.entries(schema.properties).map(([name, property]) => ({
      name,
      type: property.items ? `${property.type} of ${property.items.type}` : property.type,
      required: required.has(name),
      description: property.description ?? null,
      html: property.description ? inline(property.description) : null,
    })),
    schema: JSON.stringify(schema, null, 2),
  };
});

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const record = {
  provenance: {
    generator: "scripts/mcp.mjs",
    source: SERVER,
    lsp: LSP,
    commit,
  },
  catalogue: {
    text: literal.text,
    from: literal.from,
    to: literal.to,
    source: SERVER,
    cite: `${SERVER}, lines ${literal.from} to ${literal.to}`,
  },
  tools,
  methods,
  protocol,
  unknown,
  custom,
  transport: { command: "iyi mcp", url: `https://github.com/iyilang/iyi/blob/${commit}/${SERVER}` },
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");

// Once more from the written file, because the page imports the file.
const written = JSON.parse(readFileSync(out, "utf8"));
if (JSON.stringify(JSON.parse(written.catalogue.text)) !== JSON.stringify(catalogue)) {
  die(`the catalogue in ${out} is not the catalogue read out of ${SERVER}`);
}

console.log(
  `mcp: ${tools.length} tools (${advertised.join(", ")}) lifted from ` +
    `${SERVER}:${literal.from} to ${literal.to} and re-indented byte for byte, ` +
    `${methods.length} methods served, ${custom.length} LSP methods beyond the ` +
    `protocol, at ${commit.slice(0, 9)}`,
);
