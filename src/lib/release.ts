/**
 * The latest release, read out of CHANGELOG.md's headings as
 * `scripts/releases.mjs` recorded them. A version number is a fact about the
 * tree like any other, so it is never typed into a page: the generator refuses
 * to write a record whose changelog states no release.
 *
 * The site does not publish the changelog itself. So everything here that
 * points a reader at a release points at the repository, which is where the
 * notes and the artifacts both live.
 */
import record from "../generated/releases.json";

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
 * the version prefixed with `v`. The page that lists its notes and its
 * artifacts is the repository's, not this site's.
 */
export function releaseUrl(release: Release = latestRelease()): string {
  return `https://github.com/iyilang/iyi/releases/tag/v${release.version}`;
}

/**
 * The tarballs a release publishes, named the way `install.sh` names them:
 * `iyi-$version-$target.tar.gz` under `releases/download/v$version`, for the
 * two `uname` pairs the script accepts. Derived from the recorded version
 * rather than typed into a page, so the links move with the changelog.
 */
export interface ReleaseAsset {
  /** The `uname` pair, as the installer prints it when it refuses one. */
  target: string;
  /** The machine, in the words the page uses around it. */
  machine: string;
  file: string;
  url: string;
}

const TARGETS: ReadonlyArray<[target: string, machine: string]> = [
  ["linux-x86_64", "Linux x86-64"],
  ["darwin-arm64", "macOS arm64"],
];

export function releaseAssets(release: Release = latestRelease()): ReleaseAsset[] {
  return TARGETS.map(([target, machine]) => {
    const file = `iyi-${release.version}-${target}.tar.gz`;
    return {
      target,
      machine,
      file,
      url: `https://github.com/iyilang/iyi/releases/download/v${release.version}/${file}`,
    };
  });
}
