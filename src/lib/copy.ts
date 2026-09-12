/**
 * Copy controls. A button carries the text it copies in `data-copy`, so the
 * script reads nothing off the rendered page, and one call wires every such
 * button on it.
 *
 * The async clipboard needs a secure context and a permission some browsers
 * withhold; the fallback is the old selection-and-copy through a scratch
 * textarea, which works everywhere a user gesture is in flight.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    scratch.remove();
    return ok;
  }
}

/**
 * The one place copy feedback is spoken.
 *
 * THE DEFECT THIS FIXES. Every copy button on the site carries an
 * `aria-label` ("Copy the commands", "Copy the program"), and an `aria-label`
 * wins over an element's text. So swapping `textContent` to "Copied" changed
 * what a sighted reader sees and changed nothing at all in the accessibility
 * tree: the button's name stayed "Copy the commands", no event fired, and a
 * screen reader user pressed a button that gave them no answer, including
 * when the copy had failed.
 *
 * One region for the whole document rather than one per button. A live region
 * has to be in the page BEFORE the text goes into it, or the change is not a
 * change and nothing is announced; a per-button region would also mean a
 * dozen of them on the playground, all silent, all polling.
 *
 * `role="status"` carries an implicit `aria-live="polite"`, and both are set
 * because the pairing is what older screen readers actually key off.
 */
function statusRegion(): HTMLElement {
  const existing = document.getElementById("copy-status");
  if (existing) return existing;

  // The layout emits this element on every page. Creating it here as well
  // costs one node and means a copy control still speaks if it is ever
  // rendered somewhere the layout does not wrap.
  const made = document.createElement("p");
  made.id = "copy-status";
  made.className = "visually-hidden";
  made.setAttribute("role", "status");
  made.setAttribute("aria-live", "polite");
  document.body.appendChild(made);
  return made;
}

export function wireCopyButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-copy]")) {
    if (button.dataset.wired === "true") continue;
    button.dataset.wired = "true";
    const idle = button.textContent ?? "Copy";
    const what = button.getAttribute("aria-label") ?? idle;
    button.addEventListener("click", async () => {
      const ok = await copyText(button.dataset.copy ?? "");
      button.textContent = ok ? "Copied" : "Could not copy";

      // Named, because "Copied" alone is useless on a page holding several of
      // these: the reader needs to know which one answered. Cleared first so
      // that copying the same thing twice is two announcements and not one
      // unchanged string a screen reader is entitled to ignore.
      const status = statusRegion();
      status.textContent = "";
      window.setTimeout(() => {
        status.textContent = ok ? `Copied: ${what}` : `Could not copy: ${what}`;
      }, 50);

      setTimeout(() => {
        button.textContent = idle;
        status.textContent = "";
      }, 1600);
    });
  }
}
