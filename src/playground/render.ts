/**
 * One renderer for a diagnostic, used on both sides of the build.
 *
 * The playground's diagnostics pane is rendered during the static build, so a
 * visitor with no JavaScript still gets the real compiler output, and it is
 * re-rendered in the browser from the engine's event stream, so the pane is fed
 * by the path a checking engine would feed rather than by a special case. Those
 * are two different environments: one composes an HTML string, the other writes
 * into a live element. If each had its own renderer the two would drift, and
 * the drift would be a diagnostic that looks different depending on whether
 * scripts ran.
 *
 * So there is one function, it emits a string, and the browser assigns that
 * string. It escapes everything it emits, so assigning it is not a way for
 * compiler output to become markup.
 *
 * The treatment is the one `src/styles/code.css` defines for
 * `.diagnostic`, and the classification is the same as `Quote.astro` applies to
 * a diagnostic quoted from README.md, because a compiler error should not look
 * like two different things on two pages of the same site:
 *
 *   .where    the compiler's own `In file:line:column` header
 *   .caret    the caret line, preserved character for character
 *   .verdict  the `Error:` line
 *   .cites    the rule, pulled into a footer under a hairline
 *
 * and one more that sits on the listing rather than in the block:
 *
 *   .flagged  the source line the compiler pointed at, with the caret's own
 *             column and width carried as custom properties
 */
import type { RunEvent } from "./types";

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Classify one line of compiler output.
 *
 * Every character of the line reaches the page: the only decision is which span
 * it sits in. Nothing is reflowed, nothing is trimmed, and in particular the
 * caret line keeps its leading spaces, because those spaces are how it points
 * at a column.
 */
function markLine(line: string): string {
  const text = line.replace(/[&<>"']/g, (char) => ESCAPE[char]);
  if (line.startsWith("In ")) return `<span class="where">${text}</span>`;
  if (/^\s*\^/.test(line)) return `<span class="caret">${text}</span>`;
  if (line.startsWith("Error:")) return `<span class="verdict">${text}</span>`;
  return text;
}

/**
 * The inner HTML of a `.diagnostic` block for one diagnostic event.
 *
 * The caller supplies the wrapper, because the build supplies it as markup and
 * the browser supplies it as an element, and both then carry the same class.
 *
 * `cite` is appended to the footer after the rule. The playground uses it to
 * name the command that produced the output, which is the same provenance rule
 * the rest of the site follows: the thing that prints a fact is named beside
 * the fact.
 */
export function diagnosticHtml(
  event: Extract<RunEvent, { kind: "diagnostic" }>,
  cite?: string,
): string {
  const body = event.message.split("\n").map(markLine).join("\n");
  const footer = [
    event.rule === null
      ? "the compiler cited no rule for this one"
      : `rule: ${event.rule}, SPEC.md`,
    cite,
  ]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(". ")
    .replace(/[&<>"']/g, (char) => ESCAPE[char]);

  return `<pre>${body}</pre><span class="cites">${footer}</span>`;
}

/**
 * Where a diagnostic lands on the listing it is about.
 *
 * The compiler prints a location header and, under the offending source line,
 * a caret run: `^` under the first column of the thing it is complaining
 * about, then dashes for the rest of its width. The header is already parsed
 * structurally in `diagnostics.ts`; the width is not, because until now
 * nothing needed it. It is read out of the caret line rather than guessed,
 * for the same reason the position is: a span that covers a different piece
 * of the line than the compiler pointed at is a plausible, wrong annotation.
 *
 * Null when the message carries no caret line at all. The caller then renders
 * the diagnostic without a marker rather than marking a column it is not sure
 * about.
 */
export function caretWidth(message: string): number | null {
  const caret = /^[ \t]*(\^-*)[ \t]*$/m.exec(message);
  return caret === null ? null : caret[1].length;
}

/**
 * Put the marker on one line of a highlighted listing.
 *
 * `lines` is the recorded colouring, one balanced HTML string per line, which
 * is what `highlightedLines` hands back. The marked line is wrapped whole, so
 * the wrapper cannot land inside a token span and produce markup that nests
 * wrongly; the column and the width ride on custom properties and the
 * treatment is `.flagged` in the page's own stylesheet. Nothing is inserted
 * into the text, which matters twice: the listing is editable and its text is
 * hashed against the record, and a marker made of characters would change
 * both.
 *
 * Out of range is not an error here. A recorded case that names a line the
 * file no longer has is caught by the records gate, which has the file; this
 * has only the lines it was handed, so it returns them untouched.
 */
export function markListing(
  lines: readonly string[],
  line: number,
  column: number,
  width: number,
): string[] {
  const marked = [...lines];
  const at = line - 1;
  if (at < 0 || at >= marked.length) return marked;
  marked[at] =
    `<span class="flagged" style="--col: ${Math.max(column - 1, 0)}; ` +
    `--wide: ${Math.max(width, 1)}">${marked[at]}</span>`;
  return marked;
}
