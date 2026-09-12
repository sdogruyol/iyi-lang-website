# iyi-lang.com

The website for [iyi](https://github.com/iyilang/iyi), published at
https://iyi-lang.com from this repository.

The site restates the iyi repository rather than describing it: every number,
listing and quotation is generated at build time from that tree - its
README.md, SPEC.md, CHANGELOG.md, its CI workflow, the programs under
`samples/`, and the measurements `bench/doc_numbers.py` already gates there.
The one thing this repository authors in iyi is the playground's tour under
`samples/tour/`: short programs in the sections `samples/tour/tour.json` lays
out, and those go through the same recorders as the repository's own. Nothing
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
show, and the syntax highlighting of every listing. They are committed, and the
build refuses to publish if they no longer describe the iyi tree it was given.
Regenerate them after the samples or the compiler change:

    make -C ../iyi                          # the compiler
    WASI_SDK=/path/to/wasi-sdk-24 npm run record

wasi-sdk 24, not a later one: the modules are linked for `wasm32-wasi`, the
target README.md publishes, and wasi-sdk renamed that sysroot to
`wasm32-wasip1` and dropped the old name afterwards. `record:wasm` refuses one
without that sysroot by name rather than failing at the linker.

## Layout

    doc/          the art direction, the stack, the fact base, the playground
                  feasibility and service notes, and screenshots
    samples/tour/ the playground's tour: short programs, this site's own
    scripts/      the generators: facts, targets, releases, samples,
                  records, and the gates on the palette and the built output
    records/      committed recordings (see above)
    src/          the Astro site
    bench/        the two Python checks the build runs
