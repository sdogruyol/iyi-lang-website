/**
 * One sample's slice of the recording, and the only part of it a browser gets.
 *
 * WHY THIS FILE EXISTS. `records/wasm/manifest.json` is the recording of every
 * curated sample: for each one a module name, a byte count, two digests, an
 * exit status, and both the native and the wasm run's standard output. That is
 * the right shape for the record and the wrong shape for a page. A playground
 * route carries exactly one sample, and the manifest reached the browser
 * through `samples.ts`, which the engine imported, which the island imported:
 * every visitor of every sample page was served every entry in the record so
 * that one of them could be checked, and nearly all of what they were served
 * was other pages' data.
 *
 * So the build slices it. `scripts/records.mjs` verifies the manifest and
 * writes one of these per sample into `src/generated/playground/`, the route
 * imports the one it is rendering, and the shell serialises it into a
 * `data-entry` attribute. The island parses that attribute. Nothing in the
 * island's module graph reaches the manifest, the diagnostics record or the
 * highlight record, and `samples.ts` is now a build-time module.
 *
 * WHAT IS NOT HERE, deliberately: the output. `nativeStdout` and `wasmStdout`
 * are the bulk of a manifest entry, and a page that already runs the program
 * does not need to be told what it will print. Where a page shows a recorded
 * run, the build renders that text into the HTML.
 *
 * NODE SAFETY: the build imports this too, so nothing here touches a browser
 * global at import time. `crypto.subtle` is reached only from the shell, which
 * only runs in a browser.
 */

/** The machine stamp, the same five fields every record in this tree carries. */
export interface EntryProvenance {
  compiler: string;
  commit: string;
  machine: string;
  command: string;
  when: string;
}

/**
 * A recorded compiler diagnostic that lands on this sample's own listing.
 *
 * Only present when a case in `records/diagnostics.json` names this sample's
 * path, which is what lets the build put the marker on the line the compiler
 * pointed at. `width` is the length of the compiler's own caret run, so the
 * span on the listing covers what the caret line covers and not a guess.
 */
export interface EntryDiagnostic {
  rule: string | null;
  line: number;
  column: number;
  width: number;
  command: string;
}

/** One sample, as the client is allowed to see it. */
export interface SampleEntry {
  id: string;
  set: "tour" | "iyi";
  path: string;
  /** SHA-256 of the sample's own source bytes when the module was built from
   * them. The pane is editable, so this is how the page knows whether the text
   * on screen is still that file. */
  sourceSha256: string;
  /** Null for a sample the compiler refuses for wasm32-wasi: it has no module,
   * so the page shows what it printed natively and offers no Run. */
  wasm: string | null;
  bytes: number | null;
  sha256: string | null;
  exitCode: number;
  identical: boolean;
  note: string | null;
  diagnostic: EntryDiagnostic | null;
  recorded: EntryProvenance;
}

/**
 * Read and check one serialised entry.
 *
 * Strict, and it throws rather than returning null. An entry that is not an
 * entry means the build wrote something wrong into the page, and a shell that
 * carried on with a half-read record would run the wrong module or check a
 * digest that is not there. The caller shows the message.
 */
export function parseEntry(json: string | null | undefined): SampleEntry {
  if (!json) {
    throw new Error(
      "the page carries no data-entry, so this script has no record of which " +
        "sample it is on. The route writes it from src/generated/playground/.",
    );
  }

  const entry = JSON.parse(json) as SampleEntry;

  for (const field of ["id", "path", "sourceSha256"] as const) {
    if (typeof entry[field] !== "string" || entry[field] === "") {
      throw new Error(`the entry on this page has no ${field}`);
    }
  }
  if (entry.wasm !== null && (entry.sha256 === null || entry.bytes === null)) {
    throw new Error(
      `the entry for ${entry.id} names a module and does not say what it ` +
        `hashes to, and this page does not run bytes it cannot check`,
    );
  }

  return entry;
}

/* ---------------------------------------------------------------------------
 * The entry the engine runs.
 *
 * The engine used to look a sample up in the manifest, which is how the
 * manifest got into the browser in the first place. Now the page hands it the
 * one entry it is about, before it asks for a run, and an engine asked to run
 * something nobody handed it says so rather than guessing. The registry is a
 * map rather than a single slot because a page may one day carry two
 * listings, and because a run that named the wrong entry should fail loudly.
 * ------------------------------------------------------------------------- */

const provided: Record<string, SampleEntry> = {};

/** Hand the engine the record for one sample, by id and by path, because a
 * caller holds one or the other. */
export function provideEntry(entry: SampleEntry): void {
  provided[entry.id] = entry;
  provided[entry.path] = entry;
}

/** The entry for an id or a repository relative path, or null. */
export function providedEntry(pathOrId: string): SampleEntry | null {
  return provided[pathOrId] ?? null;
}
