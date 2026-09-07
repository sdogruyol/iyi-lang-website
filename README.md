# iyi-lang.sdogruyol.io

The website for [iyi](https://github.com/sdogruyol/iyi), published at
https://iyi-lang.sdogruyol.io.

The site restates the iyi repository rather than describing it: every number,
listing and reference page is generated at build time from that tree - its
README.md, SPEC.md, CHANGELOG.md, the programs under `samples/`, and the
measurements `bench/doc_numbers.py` already gates there. Nothing on a page is
typed by hand, and `scripts/no-transcription.mjs` fails the build if a figure
is.

## Building

The scripts look for an iyi checkout beside this one, named `iyi`, or wherever
`IYI_REPO` points:

    git clone git@github.com:sdogruyol/iyi.git ../iyi
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
    WASI_SDK=/path/to/wasi-sdk npm run record

## Layout

    doc/          the art direction, the stack, the fact base, the playground
                  feasibility and service notes, and screenshots
    scripts/      the generators: facts, reference, samples, records, and
                  the gates on the built output
    records/      committed recordings (see above)
    src/          the Astro site
    bench/        the two Python checks the build runs
