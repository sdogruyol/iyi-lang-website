/**
 * The latest release, read out of CHANGELOG.md's headings as
 * `scripts/reference.mjs` recorded them. A version number is a fact about the
 * tree like any other, so it is never typed into a page: the build refuses to
 * publish one if the changelog's first release does not read as one.
 */
import reference from "../generated/reference/index.json";

export interface Release {
  version: string;
  date: string;
}

const HEADING = /^(\d+\.\d+\.\d+)\s+[—-]+\s+(\d{4}-\d{2}-\d{2})$/;

export function latestRelease(): Release {
  const first = reference.changelog.releases.find(
    (release) => HEADING.test(release.heading),
  );
  if (first === undefined) {
    throw new Error(
      `release: no heading in ${reference.changelog.source} reads as ` +
        `"version — date", so the site cannot say which release is current`,
    );
  }
  const [, version, date] = HEADING.exec(first.heading)!;
  return { version, date };
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
      url: `https://github.com/sdogruyol/iyi/releases/download/v${release.version}/${file}`,
    };
  });
}
