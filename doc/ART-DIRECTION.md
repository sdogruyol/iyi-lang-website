# iyi website: art direction

These are decisions, not options. Where a decision could reasonably have gone
the other way, the reason it did not is written down. Rendered proof is in
`doc/screenshots/`, produced from the running site rather than drawn.

## The concept

**A plain, friendly site with a mascot, and every number on it checkable.**
The one line above the fold says what iyi is for: a friendly, fast language for
people and their agents. Beside it stands the mascot, a red heart with an `i`
on each cheek, waving. Under it a real program, read out of the repository at
build time, and the bytes the compiler printed when it ran that program. The
site's job is to be readable in one pass by someone who has never heard of iyi,
and to stay honest under the reader who checks: every figure on a page is
either counted from the tree or stamped with the machine that measured it, and
`scripts/no-transcription.mjs` fails the build if one is typed by hand.

The look is deliberately unremarkable. White ground, a sans-serif, a mono for
anything a machine printed, one accent, rounded cards, and nothing else. The
mascot supplies all the character the page needs; a second ornament would
compete with it.

## The mascot

`public/mascot.webp`, cut out of its background so it sits on the page ground
in either scheme. It appears in three places and no more: large in the hero,
small beside the wordmark in the header, and at the foot of every page. It is
never used as a bullet, a spinner, a badge or a reaction. The `i` on each
cheek is the tittle, the dot that in Turkish orthography separates `i` from
dotless `ı`; the same dot terminates every section rule on the site.

## Palette

Committed values, in `src/styles/tokens.css`, each with its contrast on white
recorded beside it.

| Token | Value | Where it is used |
|---|---|---|
| `--paper` | `#ffffff` | Page ground. |
| `--raise` | `#f7f7f8` | Alternating bands, cards, code blocks, the footer. |
| `--ink` | `#1c1c1e` | Text and headings. |
| `--graphite` | `#4d4f53` | Secondary prose, captions, console output. |
| `--mute` | `#6f7277` | Labels, ticks, elision marks. |
| `--hairline` | `#e3e4e8` | Every border. |
| `--brand` | `#d1333d` | The mascot's red. Buttons, figures, the tittle. |
| `--brand-deep` | `#ad1f29` | Links and any brand text that has to pass AA on white. |
| `--glove` | `#ecb643` | The mascot's yellow. Reserved; the mascot carries it. |

`--signal` is an alias of `--brand-deep`, because the measurement components
address the accent by that name and a loss and a link get the same colour: the
site has one accent, taken from the mascot, and spends it on what a reader can
act on or should notice.

Dark is designed, not inverted: the ground is `#121316`, the accent lightens to
`#e5565f` and its text cut to `#f07a81`, because the light values fail
contrast on a dark ground.

## Type

Two families. **The sans is the author, the mono is the machine.** Anything a
command printed is set in mono, without exception.

**Figtree** (OFL, variable) for prose and display. A friendly geometric sans
with enough weight range to carry an 800 headline and a 400 paragraph, and it
ships `latin-ext`, which is a requirement rather than a nicety: the project's
name is Turkish and `ı İ ş ğ ç ö ü` must render.

**IBM Plex Mono** (OFL) for code, commands, output, labels and the evidence
rail. Ligatures are disabled (`font-variant-ligatures: none`), because a site
about a language's syntax must not silently redraw that syntax. Its true italic
is what comments use.

Both are vendored through `@fontsource`, never fetched from a CDN. A site
arguing that a program should link only what it uses does not pull webfonts
off a third party.

Numerals are tabular everywhere so figures in a column compare by eye. The
scale is fluid, ratio 1.25, `--step--2` through `--step-5`.

## Layout

Two containers, declared once in `src/styles/base.css`.

`.wrap` is the page: `min(72rem, 100% - 2 * edge)`, centred. The header, the
footer and every home page section use it, and the home page alternates white
and `--raise` bands across the full width with a hairline between them.

`.spread` is the reading page: a `68ch` measure with a `21ch` rail beside it,
as named grid lines, so a component can opt into `main`, `rail`, `wide` or
`full` without knowing the page. Below 62rem the rail collapses under the
measure. The rail is where provenance lives, at a fixed position, never behind
a hover: a fact whose source you have to go looking for is being presented as
trust rather than as evidence.

Cards have an 8px radius, 14px on the home page grid. Hairlines separate;
there are no shadows.

## Code display

**The token stream is the compiler's.** Every listing is highlighted at record
time by `src/crystal/syntax_highlighter/html.cr`, the compiler's own
highlighter, into `records/highlight.json`, so what counts as a token is
answered by the lexer and never by a grammar this site maintains. The site adds
one class after the fact: `.tok-rule`, weight 700, on the keywords that are
iyi's and not Crystal's (`module`, `import`, `using`, `pub`, `trait`, `impl`,
`type`, `abstract`). Everything else is weight, not hue. `forall` and `derive`
are contextual in iyi's parser and reach the page as bare text; emphasising
them is a change to the compiler's highlighter, not to this site.

**The filename is load-bearing.** A module's path is its file's path, so a
source block shows its path in a header.

**Three block types, because they are three kinds of evidence.** A `.source`
block is code you could write. A `.console` block is a recording of a real
run: terminal chrome, a mute `$` prompt, and output that is never highlighted
because nothing highlighted it in the terminal. A `.diagnostic` block is a
compiler error, caret line preserved exactly, with the rule it cites pulled
into a footer that links to the spec.

## Measurements

**Two classes of number, and they must not look alike.**

A **structural** number is a line count, a target count, a sample count. It is
counted from the tree, identical on every machine, and rendered flat and inline
by `Measure`, which throws if the key is absent from `facts.json`.

A **recorded** number is a second, a byte, a millisecond: a machine, not a
language. It is rendered only by `Stamped`, inside a card that carries the
machine that produced it and the command that prints it, and the build fails
if either is missing. The card's left edge is a ruler of ticks so the eye reads
"this came off an instrument" before it reads any text. The headline of the
card is the ratio, because a ratio survives the machine; the absolute sits in
the body beside its spread.

`DurationChart` draws duration at real speed, once, when scrolled to, with a
run-again control. Reduced motion shows the settled state rather than a faster
animation, because a shortened animation would be a false reading. Size
comparisons are drawn at true area, not true width, because bar length would
flatter the smaller number.

## Imagery

The mascot, and the artifact. There is no photography, no stock, no gradient
and no decorative abstraction. Beyond the mascot, every visual is generated
from something the repository produces: duration figures from the measurement
record, mass figures at true area, and structure diagrams set typographically
in mono with hairline edges. An emoji is never an icon.

## Rendered proof

Captured from the running site in a browser, both schemes by emulating
`prefers-color-scheme`.

| File | What it shows |
|---|---|
| `screenshots/40-home-{light,dark}.png` | The home page: the one line, the mascot, the listing that runs, the four cards, the measurement card, and the four ways in. |
| `screenshots/41-why-light.png` | The argument in named axes, with the true-area mass figure. |
| `screenshots/42-learn-light.png` | The path's entrance and one step of it. |
| `screenshots/43-sample-run-light.png` | A sample route: `hello.wasm` fetched, its digest matched against the manifest, instantiated in the page, printing the program's own output. |
| `screenshots/44-spec-light.png` | The generated specification index with its generated-from banner. |

## Prohibitions

Recorded because each is a way this specific site could fail.

- No gradient, no glassmorphism, no floating orbs, no icon strip.
- No emoji used as an icon, and no mascot used as one.
- No em-dash and no en-dash in authored copy. A verbatim record, compiler
  output, README quotation or sample source, is reproduced exactly, dashes
  included, because editing a recording to satisfy a house style turns it into
  a paraphrase.
- No hue in syntax highlighting.
- No recorded number outside a measurement card.
- No hand-transcribed number anywhere. See `doc/STACK.md`.
- No time estimate in any copy, including anything implying how long learning
  or building takes.
- No claim about the playground beyond what it does today. It runs recorded
  modules; it does not compile what a visitor types, and the page says so.
