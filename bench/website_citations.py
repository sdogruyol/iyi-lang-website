#!/usr/bin/env python3
"""Every repository path the website documents cite has to resolve.

    python3 bench/website_citations.py            # check
    python3 bench/website_citations.py --list     # every citation found

The website documents are an argument made out of citations: the art
direction points at the stylesheet that carries a colour, the stack document
points at the script that generates a number, and the feasibility report points
at the compiler line that stops a browser from type checking. A path that does
not resolve is the same defect as a transcribed number. It reads as evidence,
it is checkable, and it is wrong, and the reader who checks it is exactly the
reader this project is written for.

This gate is deliberately narrow, for the reason doc_numbers.py states about
itself: a check that flags everything gets disabled, and a disabled check is
worse than none. A token is treated as a repository path only when it is
unambiguous:

  * it has a slash, its first segment is a real top-level entry of this
    repository, and its last segment carries a file extension, or
  * it is one of the repository's root documents, named without a slash.

That leaves module names like `samples/hello`, C symbols like
`wasi_snapshot_preview1.fd_write`, artifacts like `crt1-command.o` and
hostnames like `tour.gleam.run` alone, because none of them is a claim about
a file in this tree.

A citation may carry a line number (`src/raise.cr:240`) or a range
(`src/raise.cr:240-245`), and it may end in a glob (`src/compiler/iyi/*`).
Both are resolved to the thing on disk that has to exist.

ONE CLAIM, NOT ONLY THE PATH. Resolving paths leaves a blind spot, and it is
how `doc/ART-DIRECTION.md` came to say that a diagnostic footer "links to the
spec" when no such link was ever in the built HTML: every path in the sentence
resolved, and the sentence was still false. Most of that blind spot cannot be
closed cheaply - a claim about the built page needs the built page - but one
corner of it can, and it is the corner where these documents actually
transcribe machine values: the palette table states a hex for a token that
`src/styles/tokens.css` declares.

So a line that puts a backticked custom property beside a backticked hex is
read as a statement about that declaration, and the declaration has to say the
same thing. A token the stylesheet does not declare, a value that has moved,
and a hex written for a token that is an alias of another are each a failure
naming the line.

Nothing else about a token is checked, which is what keeps this narrow enough
to stay switched on. A property mentioned without a value is left alone,
because `--crystal` and `--budget` are command line flags and no shape tells
them from a custom property; only the hex beside it makes the sentence a claim
about the stylesheet. And a token the stylesheet declares but no document
mentions is not a defect: these documents are an argument, not an inventory.
"""

from __future__ import annotations

import os
import pathlib
import re
import subprocess
import sys

# Two trees. The documents live here (`doc/`) and cite this repository's
# own files (`scripts/facts.mjs`, `records/wasm/manifest.json`) and the iyi
# repository's (`src/iyi/prelude.iyi`, `bench/gc_race.py`): a path is looked
# for here first, then there. `IYI_REPO`, or a sibling checkout named `iyi`.
SITE = pathlib.Path(__file__).resolve().parent.parent
REPO = pathlib.Path(os.environ.get("IYI_REPO") or SITE.parent / "iyi").resolve()
DOCS = sorted((SITE / "doc").glob("*.md"))

# Root documents that are cited by name, with no directory in front of them.
ROOT_DOCS = {
    "README.md",
    "SPEC.md",
    "CHANGELOG.md",
    "GC_DESIGN.md",
    "Makefile",
}

EXTENSIONS = {
    ".md", ".cr", ".iyi", ".iyimod", ".py", ".sh", ".json", ".mjs", ".ts",
    ".astro", ".mdx", ".css", ".yml", ".yaml", ".svg", ".png", ".webp", ".txt",
    ".toml", ".lock", ".wasm", ".html", ".o",
}

# A candidate inside backticks, inside a markdown link, or bare in prose.
CANDIDATE = re.compile(r"`([^`\n]+)`|\]\(([^)\s]+)\)")

# Trailing punctuation a sentence leaves on a path.
TRAILING = ".,;:!?)"

# The stylesheet the palette table is a statement about, the block that holds
# the values, and the shape of a declaration in it. Only the base `:root` block
# is read: a later block redeclares a token under a condition
# (`prefers-color-scheme: dark` points each name at its own dark literal), and
# that is a second context rather than a second value for the one the table
# states. Reading the whole file instead reports every light value as an alias.
TOKENS = "src/styles/tokens.css"
BASE = re.compile(r"^:root\s*\{\n(.*?)^\}", re.S | re.M)
DECLARATION = re.compile(r"^\s*(--[a-z0-9-]+):\s*([^;]+);", re.M)

# A line of a document that states a value for a token: one property, one hex,
# nothing to guess about which belongs to which. A row naming two of either is
# left alone rather than paired by position.
PROPERTY = re.compile(r"`(--[a-z0-9-]+)`")
HEX = re.compile(r"`(#[0-9a-fA-F]{3,8})`")


def declared() -> dict[str, str]:
    """Every custom property `tokens.css` declares at the base, and its value."""
    path = SITE / TOKENS
    try:
        text = path.read_text()
    except OSError:
        raise SystemExit(
            f"bench/website_citations.py: cannot read {TOKENS}, which is where "
            f"this site's palette is committed. Without it the values the "
            f"documents state cannot be checked against anything."
        )
    base = BASE.search(text)
    if not base:
        raise SystemExit(
            f"bench/website_citations.py: {TOKENS} has no top-level `:root` "
            f"block, so the palette this check reads has moved and it is "
            f"checking nothing."
        )
    tokens = {name: value.strip() for name, value in DECLARATION.findall(base.group(1))}
    if not tokens:
        raise SystemExit(
            f"bench/website_citations.py: {TOKENS} declares no custom property "
            f"in the shape `--name: value;`, so this check is checking "
            f"nothing. Follow the file if the declarations moved."
        )
    return tokens


def stated_colours(tokens: dict[str, str]) -> tuple[list[str], list[str]]:
    """What the documents say each token's value is, checked against it.

    Returns the lines that check out and the ones that do not, because a
    document stating nine values and a stylesheet declaring them is evidence
    worth printing under `--list` as well as a failure worth stopping for.
    """
    found: list[str] = []
    wrong: list[str] = []
    for doc in DOCS:
        rel = doc.relative_to(SITE).as_posix()
        for n, line in enumerate(doc.read_text().splitlines(), 1):
            names = PROPERTY.findall(line)
            values = HEX.findall(line)
            if len(names) != 1 or len(values) != 1:
                continue
            name, stated = names[0], values[0]
            where = f"{rel}:{n}"
            if name not in tokens:
                wrong.append(
                    f"{where}  states {stated} for `{name}`, which {TOKENS} "
                    f"does not declare. A renamed token leaves a sentence "
                    f"about a colour nothing on the site has."
                )
                continue
            value = tokens[name]
            if value.startswith("var("):
                wrong.append(
                    f"{where}  states {stated} for `{name}`, but {TOKENS} "
                    f"declares it as {value}. An alias has no value of its "
                    f"own, so this writes down a second copy of the one it "
                    f"points at."
                )
                continue
            if value.lower() != stated.lower():
                wrong.append(
                    f"{where}  states {stated} for `{name}`, {TOKENS} declares "
                    f"{value}. The palette moved and the document did not."
                )
                continue
            found.append(f"ok    {name} = {value}  ({where})")
    return found, wrong


def top_level() -> set[str]:
    return {
        p.name
        for root in (SITE, REPO)
        for p in root.iterdir()
        if not p.name.startswith(".git")
    }


def roots(path: str) -> list[pathlib.Path]:
    """The trees a citation may name, this one first: the iyi repository
    has no `scripts/`, `records/` or `doc/` at its top and this one has no
    `src/iyi/`, so the first root that carries the path's top is the one."""
    return [root for root in (SITE, REPO) if (root / path.split("/")[0]).exists()] or [REPO]


TOPS = top_level()


def candidates(text: str):
    for match in CANDIDATE.finditer(text):
        raw = match.group(1) or match.group(2) or ""
        for token in raw.split():
            yield token.strip(TRAILING)


def as_path(token: str) -> str | None:
    """The repository path this token claims, or None if it claims none."""
    if token.startswith(("http://", "https://", "#", "mailto:")):
        return None

    # `src/raise.cr:240` and `src/raise.cr:240-245` cite lines in a file.
    token = re.sub(r":\d+(-\d+)?$", "", token)
    if not token or token.startswith("-"):
        return None

    # A glob cites whatever the tree holds under it, so it resolves when the
    # pattern matches at least one file. `src/compiler/iyi/*` and
    # `src/iyi/*.iyi` are both citations a reader can check.
    if "*" in token:
        return token if token.split("/")[0] in TOPS else None

    if "/" not in token:
        return token if token in ROOT_DOCS else None

    if token.split("/")[0] not in TOPS:
        return None
    if pathlib.PurePosixPath(token).suffix not in EXTENSIONS:
        # A directory citation resolves only if the directory is really there;
        # anything else with no extension is a module name, not a path.
        return token if (REPO / token).is_dir() else None
    return token


def main() -> int:
    show_all = "--list" in sys.argv
    if not DOCS:
        print("bench/website_citations.py: no documents under doc/website")
        return 1

    seen: dict[str, list[tuple[str, int]]] = {}
    for doc in DOCS:
        rel_doc = doc.relative_to(SITE).as_posix()
        for n, line in enumerate(doc.read_text().splitlines(), 1):
            for token in candidates(line):
                path = as_path(token)
                if path:
                    seen.setdefault(path, []).append((rel_doc, n))

    def ignored(path: str) -> bool:
        """Is this path declared build output?

        A citation can name something the build writes rather than something
        the tree carries, and `src/generated/facts.json` is the case that
        found this: it exists on a machine that has built the site and nowhere
        else, so checking for the file passed locally and failed in CI. A
        `.gitignore` entry is a committed, reviewed declaration that a path is
        output, so that is what the citation is resolved against instead.
        """
        # A directory pattern (`dist/`) matches only a path spelled as a
        # directory when the directory is not on disk, so both spellings
        # are tried.
        return any(
            subprocess.run(
                ["git", "-c", "safe.directory=*", "check-ignore", "-q", spelling],
                cwd=root,
                capture_output=True,
            ).returncode
            == 0
            for root in roots(path)
            for spelling in (path, path + "/")
        )

    def resolves(path: str) -> bool:
        if "*" in path:
            return any(any(root.glob(path)) for root in roots(path))
        return any((root / path).exists() for root in roots(path)) or ignored(path)

    missing = {p: w for p, w in seen.items() if not resolves(p)}
    values, contradicted = stated_colours(declared())

    if show_all:
        for path in sorted(seen):
            where = ", ".join(f"{d}:{n}" for d, n in seen[path][:3])
            mark = "GONE" if path in missing else "ok  "
            print(f"{mark}  {path}  ({where})")
        print()
        for line in values:
            print(line)
        print()

    if missing:
        print("A WEBSITE DOCUMENT CITES SOMETHING THAT IS NOT THERE")
        print()
        for path in sorted(missing):
            for doc, n in missing[path]:
                print(f"  {doc}:{n}  cites  {path}")
        print()
        print(
            "These documents argue by citation, so a path that does not resolve\n"
            "is a claim with no evidence behind it, which is the same defect as\n"
            "a transcribed number. Follow the file if it moved, or drop the\n"
            "citation if the claim no longer stands."
        )

    if contradicted:
        print("A WEBSITE DOCUMENT STATES A COLOUR THE STYLESHEET DOES NOT")
        print()
        for line in contradicted:
            print(f"  {line}")
        print()
        print(
            f"The palette is committed in {TOKENS} and the document restates\n"
            "it, so the two are one claim written twice. Take the value from\n"
            "the stylesheet, or drop the column: a table of colours the site\n"
            "does not use reads as evidence and is not."
        )

    if missing or contradicted:
        return 1

    print(
        f"website citations: {len(seen)} paths cited across {len(DOCS)} documents, "
        f"every one resolves; {len(values)} colour values stated, every one is "
        f"what {TOKENS} declares"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
