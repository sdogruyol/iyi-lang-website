/**
 * The latest release, read out of CHANGELOG.md's headings as
 * `scripts/releases.mjs` recorded them, and the tarballs it publishes, read out
 * of `install.sh` as `scripts/install-targets.mjs` recorded them. A version
 * number and a target name are facts about the tree like any other figure
 * here, so neither is typed into a page: one generator refuses to write a
 * record whose changelog states no release, the other refuses one whose
 * installer and README disagree about what a release ships for.
 *
 * The site does not publish the changelog itself. So everything here that
 * points a reader at a release points at the repository, which is where the
 * notes and the artifacts both live - and at the URL the installer would
 * fetch, rather than one this file assembles out of strings of its own.
 */
import record from "../generated/releases.json";
import install from "../generated/install-targets.json";

export interface Release {
  version: string;
  date: string;
}

export function latestRelease(): Release {
  const [first] = record.releases;
  if (first === undefined) {
    throw new Error(
      `release: ${record.provenance.source} states no release, so the site ` +
        `cannot say which one is current`,
    );
  }
  return { version: first.version, date: first.date };
}

/** Every release the changelog states, newest first. */
export function releases(): Release[] {
  return record.releases.map(({ version, date }) => ({ version, date }));
}

/**
 * Where a release is published: the tag `install.sh` downloads from, which is
 * the version prefixed with `v`. The repository is the one that script asks,
 * so a fork or a rename moves this link with it. The page that lists a
 * release's notes and its artifacts is the repository's, not this site's.
 */
export function releaseUrl(release: Release = latestRelease()): string {
  return `https://github.com/${install.repo}/releases/tag/v${release.version}`;
}

/**
 * The tarballs a release publishes: one per target `install.sh` accepts, named
 * and located the way that script names and locates them.
 *
 * Nothing here is written down twice. `scripts/install-targets.mjs` reads the
 * targets out of the installer's own `case` arms, cross-checks them against the
 * refusal it prints and against README.md, and carries the `asset=` and
 * `base=` strings across with `$version` and `$target` still in them; this
 * fills those in from the recorded release. The pairs were a literal here
 * until then, which meant a third published tarball would have appeared
 * nowhere on this site and a renamed asset would have made every download link
 * a 404 with nothing in the build able to see it.
 */
export interface ReleaseAsset {
  /** The target, as the installer names the tarball it fetches. */
  target: string;
  /** The machine, in README.md's own words for that platform. */
  machine: string;
  file: string;
  url: string;
}

/** install.sh's own template, with the shell's placeholders filled in. */
const fill = (template: string, version: string, target?: string): string =>
  template.replaceAll("$version", version).replaceAll("$target", target ?? "");

export function releaseAssets(release: Release = latestRelease()): ReleaseAsset[] {
  return install.targets.map(({ target, machine }) => {
    const file = fill(install.asset, release.version, target);
    return { target, machine, file, url: `${fill(install.download, release.version)}/${file}` };
  });
}
