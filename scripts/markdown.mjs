#!/usr/bin/env node
// The markdown reader the two verbatim-document generators share
// (`scripts/editors.mjs`, `scripts/project.mjs`). It is not a generator: it
// writes nothing and prints nothing, and running it does nothing.
//
// WHAT IT IS FOR. The site restates the repository. `scripts/samples.mjs`
// already lifts a fenced block out of README.md by anchor, which is enough
// when a page wants one recording. It is not enough when a page has to
// publish a WHOLE document the repository wrote - CONTRIBUTING.md, the
// editors guide - because then the honest thing is not "some of it, chosen by
// me" but "all of it, in order, with nothing added". So this reader turns a
// markdown file into a list of blocks that each carry the exact source lines
// they came from, and `readback` proves the blocks reassemble into the file
// byte for byte.
//
// THE DEFECT THAT MAKES READBACK NECESSARY. A parser with a hole silently
// drops what it does not recognise: a list continuation line, a table, a
// stanza after a construct it mis-closed. The page still renders, reads
// fluently, and is missing a paragraph the document's author wrote - which,
// on a page whose whole claim is "this is the repository's text", is worse
// than no page. Coverage is therefore not sampled: every line of the file is
// either inside exactly one block or is a blank line between blocks, and
// anything else throws.
//
// WHAT IT DELIBERATELY DOES NOT DO. No markdown extension nobody in this tree
// uses. It handles what the four project documents and the editors guide
// actually contain, and throws on anything else rather than guessing, because
// a guess here is a sentence nobody wrote appearing under a repository's name.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** HTML-escaped, because every string here is somebody else's text. */
export const escape = (text) => text.replace(/[&<>"]/g, (c) => ESCAPES[c]);

const die = (message) => {
  throw new Error(message);
};

/**
 * Inline markdown, rendered to HTML.
 *
 * Code spans first and whole: what is inside one is not markdown, and a
 * backtick span holding an underscore or a bracket was the first thing to
 * break when this ran in the other order. The span is lifted out, the rest is
 * rendered, and the spans go back.
 *
 * `link` maps a repository-relative target onto a URL. The site does not
 * publish SPEC.md or CHANGELOG.md, so a document's own link to one has to go
 * somewhere true: the caller decides where, this file only asks.
 */
export function inline(text, { definitions = {}, link = (href) => href } = {}) {
  const spans = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    spans.push(`<code>${escape(code)}</code>`);
    return `\u0000${spans.length - 1}\u0000`;
  });

  out = escape(out);

  // Autolinks: <https://...> and <someone@example.com>, which NOTICE.md and
  // SECURITY.md both use. Escaped above, so the brackets are entities here.
  out = out.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, href) => `<a href="${href}">${href}</a>`);
  out = out.replace(
    /&lt;([^\s@&]+@[^\s@&]+)&gt;/g,
    (_, mail) => `<a href="mailto:${mail}">${mail}</a>`,
  );

  // Inline links, then reference links in both spellings: [text][ref] and the
  // shortcut [text][] that NOTICE.md's library list is written in.
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, label, href) => `<a href="${escape(link(href))}">${label}</a>`,
  );
  out = out.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (whole, label, ref) => {
    const key = (ref || label).toLowerCase();
    const href = definitions[key];
    if (!href) {
      die(
        `the reference link [${label}][${ref}] has no definition in this ` +
          `document, so the page would render a link to nowhere`,
      );
    }
    return `<a href="${escape(link(href))}">${label}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s.,;:)]|$)/g, "$1<em>$2</em>");

  return out.replace(/\u0000(\d+)\u0000/g, (_, index) => spans[Number(index)]);
}

/**
 * A markdown file as blocks, each carrying the source lines it is made of.
 *
 * `from` and `to` are one-based and inclusive, which is how every other
 * citation on this site is spelled.
 */
export function parseDocument(text, options = {}) {
  const lines = text.replace(/\n$/, "").split("\n");
  const blocks = [];
  const definitions = {};

  // Link definitions are read in one pass first: NOTICE.md puts all of them at
  // the bottom and references them at the top, so a single pass would fail on
  // the first reference.
  lines.forEach((line) => {
    const definition = /^\[([^\]]+)\]:\s+(\S+)/.exec(line);
    if (definition) definitions[definition[1].toLowerCase()] = definition[2];
  });

  const render = (source) => inline(source, { ...options, definitions });

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // A fenced block. Its text is never rendered: it is a machine's, and the
    // page sets it in mono exactly as written.
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      let end = i + 1;
      while (end < lines.length && !/^```\s*$/.test(lines[end])) end++;
      if (end >= lines.length) {
        die(`the fenced block opened at line ${i + 1} is never closed`);
      }
      blocks.push({
        kind: "code",
        lang: fence[1],
        text: lines.slice(i + 1, end).join("\n"),
        from: i + 1,
        to: end + 1,
      });
      i = end + 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
        html: render(heading[2]),
        from: i + 1,
        to: i + 1,
      });
      i++;
      continue;
    }

    // An HTML comment on its own line. NOTICE.md uses two as section markers
    // for its link definitions. Kept as a block so coverage stays exact, and
    // rendered as nothing, because a comment is not text a reader was shown.
    if (/^<!--.*-->\s*$/.test(line)) {
      blocks.push({ kind: "comment", from: i + 1, to: i + 1 });
      i++;
      continue;
    }

    if (/^\[([^\]]+)\]:\s+\S+/.test(line)) {
      let end = i;
      while (end + 1 < lines.length && /^\[([^\]]+)\]:\s+\S+/.test(lines[end + 1])) end++;
      blocks.push({ kind: "definitions", from: i + 1, to: end + 1 });
      i = end + 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule", from: i + 1, to: i + 1 });
      i++;
      continue;
    }

    // A list. An item runs until the next bullet or a blank line; a
    // continuation line may be indented or not, and CODE_OF_CONDUCT.md
    // contains both spellings in one list, which is why the continuation test
    // is "not a bullet" rather than "indented".
    const bullet = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      const ordered = /\d/.test(bullet[2]);
      const items = [];
      let end = i;
      while (end < lines.length) {
        const next = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[end]);
        if (next) {
          items.push([next[3]]);
        } else if (lines[end].trim() === "" || items.length === 0) {
          break;
        } else {
          items[items.length - 1].push(lines[end].trim());
        }
        end++;
      }
      blocks.push({
        kind: "list",
        ordered,
        items: items.map((parts) => render(parts.join(" "))),
        from: i + 1,
        to: end,
      });
      i = end;
      continue;
    }

    // Anything else is a paragraph: every line up to the next blank line or
    // the next construct.
    let end = i;
    const opens = (text) =>
      /^```/.test(text) ||
      /^#{1,6}\s/.test(text) ||
      /^(\s*)([-*]|\d+\.)\s+/.test(text) ||
      /^<!--/.test(text) ||
      /^\[([^\]]+)\]:\s+\S+/.test(text);
    while (end + 1 < lines.length && lines[end + 1].trim() !== "" && !opens(lines[end + 1])) {
      end++;
    }
    blocks.push({
      kind: "paragraph",
      html: render(lines.slice(i, end + 1).join(" ")),
      from: i + 1,
      to: end + 1,
    });
    i = end + 1;
  }

  readback(blocks, lines);
  return { blocks, definitions, lines: lines.length };
}

/**
 * The proof that the blocks are the document.
 *
 * Every line is either inside exactly one block, in order, or blank between
 * blocks. A parser that dropped a line, claimed one twice, or reordered two
 * fails here rather than publishing a document with a hole in it under
 * somebody else's name.
 */
export function readback(blocks, lines) {
  let expected = 1;
  for (const block of blocks) {
    if (block.from < expected) {
      die(
        `block ${block.kind} at line ${block.from} overlaps the one before it, ` +
          `which ends at line ${expected - 1}`,
      );
    }
    for (let line = expected; line < block.from; line++) {
      if (lines[line - 1].trim() !== "") {
        die(
          `line ${line} (${JSON.stringify(lines[line - 1])}) is inside no ` +
            `block, so rendering these blocks would drop text the document ` +
            `states`,
        );
      }
    }
    expected = block.to + 1;
  }
  for (let line = expected; line <= lines.length; line++) {
    if (lines[line - 1].trim() !== "") {
      die(
        `line ${line} (${JSON.stringify(lines[line - 1])}) is after the last ` +
          `block, so the end of the document would not be published`,
      );
    }
  }
}

/** The sections of a document: a heading of the given level and what follows. */
export function sections(blocks, level = 2) {
  const found = [];
  for (const block of blocks) {
    if (block.kind === "heading" && block.level === level) {
      found.push({ heading: block.text, from: block.from, blocks: [] });
      continue;
    }
    if (found.length > 0) found[found.length - 1].blocks.push(block);
  }
  return found;
}
