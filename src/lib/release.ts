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
