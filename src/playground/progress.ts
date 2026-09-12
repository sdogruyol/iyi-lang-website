/**
 * How far through the tour a visitor got, kept on their own machine.
 *
 * WHY LOCAL STORAGE AND NOTHING ELSE. The same reason the share codec puts a
 * program in a URL fragment rather than in a database: a server that knew
 * which programs you had read would be a server that knew something about
 * you, for a static site whose whole argument is that you can check what it
 * did. Nothing here leaves the tab, there is no account, and clearing site
 * data clears it.
 *
 * WHAT IS RECORDED, and it is one thing. `visited` is every step whose page
 * was opened, which is a fact about navigation and nothing more. There used
 * to be a second set, the steps whose "what does this print" exercise had
 * been answered, and the table of contents counted them. The question went,
 * so the count went with it: a store that kept a score for a quiz nobody is
 * asked is a store that has outlived its reason.
 *
 * NODE SAFETY: the build imports this file to type the island, so nothing here
 * touches `localStorage` at import time, and every read and write is wrapped.
 * A browser in private mode throws on access rather than returning null, and
 * an island that died on load because storage was refused would take the
 * editor and the run control down with it over a progress mark.
 */

const KEY = "iyi:playground:tour";

/** The steps a visitor has opened. */
export interface TourProgress {
  visited: string[];
}

const EMPTY: TourProgress = { visited: [] };

/**
 * What is stored, or nothing.
 *
 * Anything that is not the shape this file writes is treated as nothing: the
 * key is in a namespace a visitor can edit and a future version of this file
 * may write something else into. Losing a progress mark is recoverable, and
 * rendering a tick against a step from a half-read record is not.
 */
export function readProgress(): TourProgress {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === null) return EMPTY;
    const parsed = JSON.parse(stored) as TourProgress;
    if (!Array.isArray(parsed?.visited)) {
      return EMPTY;
    }
    return {
      visited: parsed.visited.filter((id) => typeof id === "string"),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Add one step to the set and store the result.
 *
 * Returns what is now stored, so a caller that has just marked something can
 * render from it without reading the key back and without holding a second
 * copy that could drift from the stored one.
 */
export function markStep(id: string): TourProgress {
  const visited = new Set(readProgress().visited);
  visited.add(id);
  const next: TourProgress = { visited: [...visited] };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Storage refused, which a visitor chose and the page does not argue
     * with. The marks are still right for this tab's lifetime because the
     * caller renders from what it was handed back. */
  }
  return next;
}

/** Forget everything, for the visitor who wants to walk the tour again. */
export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nothing to do and nothing to say: a storage that cannot be written
     * cannot be holding anything either. */
  }
}
