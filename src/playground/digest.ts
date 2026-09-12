/**
 * One hash, in one place, because three things now compare digests and a
 * second implementation would let two of them disagree.
 *
 * `engines/execute.ts` checks a module's bytes against the record before it
 * instantiates them. The shell hashes the text in the pane against the
 * `sourceSha256` the recorder wrote for that sample, which is how the page
 * knows whether the program on screen is still the program the module was
 * built from. The exercise hashes what a visitor typed against the digest of
 * the output the recorder captured. All three are SHA-256 over UTF-8 bytes,
 * and all three would be quietly wrong in the same way if one of them padded,
 * trimmed or hashed a view instead of a copy.
 *
 * This file lives outside `engines/` on purpose. The engine is loaded only
 * when a visitor presses Run, in a chunk of its own, and the shell needs a
 * digest before that: importing `execute.ts` for eight lines of hashing would
 * pull the whole WASI host into the page's first bundle and undo the split.
 */

/** Hex sha256 of exactly these bytes. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  /* A fresh copy, because `crypto.subtle` wants an ArrayBuffer and a subarray
   * view would hash the whole underlying buffer. */
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

