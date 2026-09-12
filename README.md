# iyi.dev

The website for [iyi](https://github.com/iyilang/iyi), published at
https://iyi.dev from this repository.

The site restates the iyi repository rather than describing it: every number,
listing and quotation is generated at build time from that tree - its
README.md, SPEC.md, CHANGELOG.md, its CI workflow, the programs under
`samples/`, and the measurements `bench/doc_numbers.py` already gates there.
Two things this repository authors in iyi, and no more: the playground's tour
under `samples/tour/`, short programs in the sections `samples/tour/tour.json`
lays out, and the agent loop's project under `records/agent/`. Both go through
the same recorders as the repository's own programs. Nothing
on a page is typed by hand, and `scripts/no-transcription.mjs` fails the build
if a figure is.

SPEC.md and CHANGELOG.md are read in the repository, not here. The site used
to publish both, cut into 57 of its 128 routes, and no page anywhere linked
in: every rule citation on the site names a SPEC.md section and line as text.
A design record marked Draft 0 is not documentation for someone learning the
language, and it was standing where a language reference should. What the site
still takes from CHANGELOG.md is which release is current, which reaches the
masthead, the home page, the install page and llms.txt through
`scripts/releases.mjs`.

## Building

The scripts look for an iyi checkout beside this one, named `iyi`, or wherever
`IYI_REPO` points:

    git clone git@github.com:iyilang/iyi.git ../iyi
    npm ci
    npm run build            # generate, build, check the built prose
    npm run dev              # the same, served locally

`bench/website_citations.py` checks that every path the documents under `doc/`
cite exists, in this tree or in iyi's.

## Records

`records/` holds what only a machine with the compiler can produce: the wasm
modules the playground runs, the diagnostics the break-this-rule exercises
show, the agent loop the agents page is a transcript of, and the syntax
highlighting of every listing. They are committed, and they are evidence about
**a release**, not about somebody's checkout.

That is what makes them checkable without making the build brittle. Every
recorder refuses to run against anything but the tag CHANGELOG.md states, and
`scripts/records.mjs` reads the recorded files out of that same tag with
`git cat-file` rather than off the working tree. So a commit to the language
after the release cannot make this site stale: the playground keeps running
the tarball the install page tells a reader to download, and commits reach the
site when they are released. Before this, the tenth commit after 0.12.0 edited
a line count inside a comment in `samples/iyi/calc.iyi` and `npm run check`
refused to build a site whose every page was still correct.

Regenerate after a release, in a worktree at its tag so your own branch and
build directory are left alone:

    git -C ../iyi worktree add --detach /tmp/iyi-0.12.0 v0.12.0
    make -C /tmp/iyi-0.12.0 all -j"$(nproc)"
    IYI_REPO=/tmp/iyi-0.12.0 IYI_BUILD=/tmp/iyi-0.12.0/.build \
      WASI_SDK=/path/to/wasi-sdk-24 npm run record

The recorders say this themselves, with the commands, when they are pointed
somewhere else; `scripts/release-ref.mjs` is where the rule lives and why.

wasi-sdk 24, not a later one: the modules are linked for `wasm32-wasi`, the
target README.md publishes, and wasi-sdk renamed that sysroot to
`wasm32-wasip1` and dropped the old name afterwards. `record:wasm` refuses one
without that sysroot by name rather than failing at the linker.

`records/agent/` is the second thing this repository authors in iyi: four
modules, left broken on purpose, that `record:agent` takes to green with the
compiler's own verbs and keeps every frame of. That recorder is also the gate
on two claims the site would otherwise only be making. It refuses to write a
record when a verb's verdict moves, when `iyi check` stops offering a
`suggested_edit`, when a body-only change starts moving an interface, or when
the answer the `check` tool gives over MCP stops matching the answer the same
verb gives in a shell.

## Layout

    doc/          the art direction, the stack, the fact base, the playground
                  feasibility and service notes, and screenshots
    samples/tour/ the playground's tour: short programs, this site's own
    records/agent/ the agent loop's project: this site's own, broken on purpose
    scripts/      the generators: facts, targets, releases, samples,
                  records, and the gates on the palette and the built output
    records/      committed recordings (see above)
    src/          the Astro site
    bench/        the two Python checks the build runs
