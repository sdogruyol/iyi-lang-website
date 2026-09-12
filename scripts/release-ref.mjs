// The release the site is about, and how to read the iyi tree at it.
//
// WHY THIS EXISTS. Every recorder wrote what it saw in the sibling working
// tree, and `records.mjs` checked the committed records against that same
// working tree. So the records went stale on every commit to the language,
// whether or not the commit touched anything the site publishes: the tenth
// commit after a release edited a comment in `samples/iyi/calc.iyi`, the
// digest moved, and `npm run check` refused to build a site whose pages were
// all still correct. A gate that fires on work it is not about is a gate
// people learn to disable.
//
// It was also publishing the wrong thing. The install page tells a reader to
// install the latest release, and the playground was serving modules compiled
// from master: a tour step whose program is not in the tarball the reader was
// just told to download, and on one day a step for a sample that did not exist
// in any release at all. The records are evidence about a release, so the
// release is what they are recorded from and checked against.
//
// WHICH RELEASE. The one `CHANGELOG.md` states first, which is the same answer
// `scripts/releases.mjs` writes into `releases.json` and the site prints in
// its colophon, on the home page and in the install command. A release is a
// tag, `v` and that version, because that is the tag `install.sh` downloads
// its tarball from - so the tree this reads is the tree that release ships.
//
// IT FAILS RATHER THAN FALLING BACK. No tag for the stated release means the
// changelog and the repository disagree about what is out, and the download
// link the install page builds out of that version points at nothing. A
// shallow clone with no tags means the same thing from the other direction.
// Both say so by name instead of quietly reading the working tree, which is
// the thing this file exists to stop.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* A release heading, as CHANGELOG.md writes it: `## 0.12.0 — 2026-09-11`.
 * Mirrored from scripts/releases.mjs, which reads the same file for the same
 * version and would otherwise be a second answer to one question. Anything
 * else at this level is a heading that is not a release - `Unreleased`, and
 * whatever comes next - and is skipped rather than guessed at. */
const HEADING = /^##\s+(\d+\.\d+\.\d+)\s+[—-]+\s+(\d{4}-\d{2}-\d{2})\s*$/;

const git = (repo, args) =>
  spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });

/**
 * The release the site publishes, and the commit the tag for it names.
 *
 * @param {string} repo the iyi checkout
 * @returns {{ version: string, date: string, tag: string, commit: string }}
 */
export function releaseRef(repo) {
  const changelog = resolve(repo, "CHANGELOG.md");
  let text;
  try {
    text = readFileSync(changelog, "utf8");
  } catch {
    throw new Error(
      `no CHANGELOG.md at ${changelog}, so nothing here can say which ` +
        `release the site is about. Point IYI_REPO at an iyi checkout.`,
    );
  }

  const stated = text
    .split("\n")
    .map((line) => HEADING.exec(line))
    .find((match) => match !== null);
  if (!stated) {
    throw new Error(
      `${changelog} states no release, so nothing here can say which one is ` +
        `current. A release heading reads "## 0.12.0 — 2026-09-11".`,
    );
  }

  const [, version, date] = stated;
  const tag = `v${version}`;

  const inside = git(repo, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0) {
    throw new Error(
      `${repo} is not a git checkout, so the tree at ${tag} cannot be read. ` +
        `The records are evidence about a release and are checked against ` +
        `the tag that publishes it.`,
    );
  }

  const found = git(repo, ["rev-parse", "--verify", `${tag}^{commit}`]);
  if (found.status !== 0) {
    throw new Error(
      `${changelog} states ${version} and ${repo} has no ${tag}. Either the ` +
        `tags are not fetched here - "git -C ${repo} fetch --tags" - or the ` +
        `changelog names a release that was never tagged, in which case the ` +
        `install page is already building a download URL for a tarball that ` +
        `is not published.`,
    );
  }

  return { version, date, tag, commit: found.stdout.trim() };
}

/**
 * One file's bytes as the release ships them, or null where the release has
 * no such file.
 *
 * `cat-file blob` rather than a checkout: the bytes are wanted, not a tree on
 * disk, and reading them out of the object store cannot be confused by
 * anything a developer has in front of them.
 */
export function blobAt(repo, tag, path) {
  const read = spawnSync("git", ["-C", repo, "cat-file", "blob", `${tag}:${path}`], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (read.status !== 0) return null;
  return read.stdout;
}

/** Every path under one directory of the release, repository relative. */
export function treeAt(repo, tag, dir) {
  const list = git(repo, ["ls-tree", "-r", "--name-only", tag, dir]);
  if (list.status !== 0) return [];
  return list.stdout.split("\n").filter((line) => line !== "");
}

/**
 * Refuse a recording taken from anything but the release.
 *
 * A recorder needs a tree on disk and a compiler beside it: it compiles the
 * samples, runs them, and reads what they print. So it cannot read the tag out
 * of the object store the way the checker does, and the honest arrangement is
 * the plain one - the checkout it is pointed at *is* the release. That is two
 * questions: is this commit the tag, and is the tree it holds unedited.
 *
 * The recipe in the message is the one this repository uses: a detached
 * worktree at the tag, built there, so a developer's own branch and build
 * directory are left alone.
 */
export function requireReleaseTree(repo, release, verb) {
  const head = git(repo, ["rev-parse", "HEAD"]);
  if (head.status !== 0) {
    throw new Error(`${repo} is not a git checkout, so ${verb} cannot say what it recorded`);
  }
  const at = head.stdout.trim();
  const dirty = git(repo, ["status", "--porcelain"]);
  const edited = dirty.status === 0 ? dirty.stdout.trim() : "";

  if (at === release.commit && edited === "") return;

  const why =
    at !== release.commit
      ? `${repo} is at ${at.slice(0, 9)} and ${release.tag} is ${release.commit.slice(0, 9)}`
      : `${repo} is at ${release.tag} with edits in the tree`;

  throw new Error(
    `${verb} records what a release ships, and ${why}. Record from the tag:\n\n` +
      `  git -C ${repo} worktree add --detach /tmp/iyi-${release.version} ${release.tag}\n` +
      `  make -C /tmp/iyi-${release.version} all -j"$(nproc)"\n` +
      `  IYI_REPO=/tmp/iyi-${release.version} IYI_BUILD=/tmp/iyi-${release.version}/.build npm run record\n\n` +
      `Commits after ${release.tag} reach the site when they are released, ` +
      `which is what keeps the playground running the tarball the install ` +
      `page tells a reader to download.`,
  );
}

/**
 * Refuse a compiler that was not built from the release.
 *
 * `iyi --version` prints the commit it was built at, so a binary left over
 * from a developer's branch is caught here rather than in a recording that
 * names a release and was produced by something else. The provenance line on
 * every page carries this string.
 */
export function requireReleaseCompiler(iyi, release, verb) {
  const version = execFileSync(iyi, ["--version"], { encoding: "utf8" }).split("\n")[0].trim();
  if (version.includes(release.commit.slice(0, 9))) return version;
  throw new Error(
    `${iyi} prints "${version}", which does not name ${release.commit.slice(0, 9)}, ` +
      `the commit ${release.tag} is. ${verb} would then stamp a release onto a ` +
      `recording made by another build. Build the compiler in the worktree at ` +
      `the tag: make -C <worktree> all -j"$(nproc)".`,
  );
}
