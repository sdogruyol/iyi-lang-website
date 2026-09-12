/**
 * The slot the recorded diagnostics arrive through.
 *
 * `diagnostics.ts` reads `records/diagnostics.json`, which carries the
 * compiler's whole standard error for every recorded case. Exactly one page
 * renders that material, `/playground/evidence/`, and it renders it during the
 * static build. The engine used to import the record so that a request for the
 * `diagnostics` capability could stream it, and because the engine is in the
 * browser that put every case's stderr in the bundle of every sample page,
 * none of which shows a diagnostic.
 *
 * So the record moves to the edge that has it. The evidence page reads it, in
 * node, and hands it here before it drains the engine's stream; the engine
 * reads it from here and streams it back as `diagnostic` events, which keeps
 * the pane fed by the event path a checking engine would feed and keeps the
 * page's three gates over that path meaningful. An engine nobody handed
 * anything streams nothing, and the evidence page fails its own build when
 * that happens, which is the behaviour that was already specified.
 *
 * This file deliberately imports nothing. The moment it imports the record,
 * the record is back in the engine's graph and the split is undone.
 */
import type { RunEvent } from "./types";

type Diagnostic = Extract<RunEvent, { kind: "diagnostic" }>;

let cases: readonly Diagnostic[] = [];

/**
 * Hand the engine the recorded cases. Called by the one page that renders
 * them, with the events `diagnostics.ts` parsed out of the record.
 */
export function provideDiagnostics(events: readonly Diagnostic[]): void {
  cases = events;
}

/** The cases somebody provided, in the order they provided them. */
export function providedDiagnostics(): readonly Diagnostic[] {
  return cases;
}
