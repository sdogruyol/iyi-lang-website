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

export function wireCopyButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-copy]")) {
    if (button.dataset.wired === "true") continue;
    button.dataset.wired = "true";
    const idle = button.textContent ?? "Copy";
    button.addEventListener("click", async () => {
      const ok = await copyText(button.dataset.copy ?? "");
      button.textContent = ok ? "Copied" : "Could not copy";
      setTimeout(() => {
        button.textContent = idle;
      }, 1600);
    });
  }
}
