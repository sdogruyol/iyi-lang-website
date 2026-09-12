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

`src/assets/mascot.webp`, cut out of its background so it sits on the page
ground in either scheme. It appears in four places and no more: large in the
hero, small beside the wordmark in the header, at the foot of every page, and
as the favicon, cropped to the face. It is
never used as a bullet, a spinner, a badge or a reaction. The `i` on each
cheek is the tittle, the dot that in Turkish orthography separates `i` from
dotless `ı`; the same dot terminates every section rule on the site.

It is a source asset rather than a public file, and that is a decision. The
drawing is 1200px across; the header mark is 28px. Served out of `public/` it
was the same file every time, so a reader paid the hero's weight to draw a mark
the width of a word, four times a page. Through `astro:assets` each call site
asks for the size it draws at, `densities={[1, 2]}` covers a retina screen, and
the build emits exactly those. The hero keeps `fetchpriority="high"` because it
is the largest thing painted above the fold; every other placement is lazy.

## Palette

Committed values, in `src/styles/tokens.css`. The contrast of every pair they
are used in is computed by `scripts/contrast.mjs` on each build and the build
fails under the floor the pair's role requires, so no ratio is written down
here or there: the file that once recorded five of them had four wrong.

| Token | Value | Where it is used |
|---|---|---|
| `--paper` | `#ffffff` | Page ground. |
| `--raise` | `#f7f7f8` | Alternating bands, cards, code blocks, the footer. |
| `--ink` | `#1c1c1e` | Text and headings. |
| `--graphite` | `#4d4f53` | Secondary prose, captions, console output. |
| `--mute` | `#676a6f` | Labels, ticks, elision marks. |
| `--hairline` | `#e3e4e8` | Every separator between two areas of the page. |
| `--track` | `#eceef1` | The unfilled part of a gauge. |
| `--boundary` | `#85888f` | The edge of a control, and nothing else. |
| `--brand` | `#d1333d` | The mascot's red. Buttons, figures, the tittle. |
| `--brand-deep` | `#ad1f29` | Links and any brand text that has to pass AA on white. |
| `--brand-soft` | `#fdeeee` | The tinted ground a caveat sits on. |
| `--glove` | `#ecb643` | The mascot's yellow. Reserved; the mascot carries it. |
| `--signal-deep` | `#8a151d` | The darkest cut of the accent, for a loss set small. |

`--signal` is an alias of `--brand-deep`, because the measurement components
address the accent by that name and a loss and a link get the same colour: the
site has one accent, taken from the mascot, and spends it on what a reader can
act on or should notice.

`--hairline` and `--boundary` are not interchangeable and the split is the
point. A hairline separates two areas of the page, which WCAG 1.4.11 exempts,
and it is drawn faint on purpose. A boundary is the edge of a thing you can
press, which 1.4.11 does not exempt, and every control on the site draws with
it: the copy button, the ghost CTA, the declaration toggle, the chart's replay
and the menu button. They used to draw with the hairline, which put every
control's edge far under the floor.

### The dark scheme

This document used to say there was one scheme, because a second palette would
be a second design to keep honest. That objection is answered rather than
abandoned: `scripts/contrast.mjs` computes every declared pair on every build
and fails under the floor, and the dark pairs are in its list, so the second
palette is kept honest by the same machinery as the first. A dark scheme that
was not gated would be exactly the thing the refusal was about.

| Token | Value | Note |
|---|---|---|
| `--paper-dark` | `#141418` | Ground. Not an inverted white, which reads as a smudge. |
| `--raise-dark` | `#1d1d23` | Bands, cards, code blocks. |
| `--ink-dark` | `#f0f0f2` | Text and headings. |
| `--graphite-dark` | `#c3c5cb` | Secondary prose, captions, console output. |
| `--mute-dark` | `#9ba0a8` | Labels, ticks, elision marks. |
| `--hairline-dark` | `#33343c` | Separators. |
| `--track-dark` | `#2b2c33` | Gauge track. |
| `--boundary-dark` | `#6b6d76` | Control edges. |
| `--brand-dark` | `#f4636d` | The accent, lifted so it carries against a dark ground. |
| `--brand-deep-dark` | `#ff8f96` | The cut that passes AA as running text. |
| `--brand-soft-dark` | `#2b171a` | The tinted ground a caveat sits on. |
| `--glove-dark` | `#f0c25e` | Reserved, as in the light scheme. |
| `--signal-deep-dark` | `#ffb3b8` | A loss set small. |

Three rules hold it together. Every colour is a literal declared once in the
base `:root`, and both scheme switches only alias them, so no component knows
which scheme it is in and the gate can see both palettes. The default switch
is `@media screen and (prefers-color-scheme: dark)`, and the `screen` is load
bearing: a print query matches a reader's colour preference too, and without it
printing a lesson under a dark preference would empty a toner cartridge into
the page.

And the machine's answer can be overruled. The masthead carries one control,
a mono word naming what the press will do, that writes `data-theme` onto
`<html>` and remembers it. It is `display: none` until a script claims the
masthead, the same handshake the menu button uses, so nothing that cannot
work is ever offered: with scripts blocked the page is still whatever the
machine prefers, which is what the media query decided before any of this.
That is why the alias list is written twice in `src/styles/tokens.css`, once
behind the preference and once behind the attribute, and the preference block
carries `:not([data-theme="light"])` so the override can turn it off.

The word is a word and not a glyph on purpose. The first draft used a moon
and a sun, both outside the latin and latin-ext subsets the site ships, so
they fell back to whatever the reader's machine had; and an emoji is never an
icon here.

The mascot is cut out of its background and the code is set in weight rather
than hue, which is why one drawing and one highlighting scheme serve both
grounds.

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

**And it links only what it uses.** `scripts/fonts.mjs` reads the installed
packages and writes `src/generated/fonts.css`, which is the only font import in
`src/layouts/Page.astro`. It keeps `woff2` and drops the legacy `woff` that sits
beside every `@fontsource` face, and it keeps `latin` and `latin-ext` and drops
`cyrillic`, `cyrillic-ext` and `vietnamese`. Importing the packages' own
stylesheets shipped all of it: two thirds of the font payload was alphabets no
page here contains and a format no browser capable of rendering this site would
request. The `unicode-range` of each face is read out of the package and never
authored, because typing it here would be a transcription of a machine value
that goes stale silently, which is the defect this whole publication is
arranged around.

Four mono faces ship, and they are the four the stylesheets ask for: 400, 400
italic, 500 and 600. There is deliberately no 700. `code.css` used to ask for
one for `.tok-rule`, the site's single typographic emphasis, and no 700 face
was ever loaded, so that emphasis was either a synthetic smear or a silent
match to the 600 depending on the reader's browser. It asks for the 600 it
gets. Figtree is variable, so 650 and 800 are real interpolations.

Two faces are preloaded, the latin sans and the latin mono, because every page
needs both before it can draw a word and they are otherwise discovered a round
trip late. The rest are left to be discovered: preloading a face a page does
not use is the waste this section is about.

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
one class after the fact: `.tok-rule`, weight 600, on the keywords that are
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
into a footer that names the SPEC.md section and line the premise is stated
at. It names them rather than linking them: the site does not publish SPEC.md,
and a citation to a file is checkable by anyone holding the repository.

## Measurements

**Two classes of number, and they must not look alike.**

A **structural** number is a line count, a target count, a sample count. It is
counted from the tree, identical on every machine, and rendered flat and inline
by `Measure`, which throws if the key is absent from `facts.json`.

A **recorded** number is a second, a byte, a millisecond: a machine, not a
language. It is rendered only by `Stamped`, whose left edge is a ruler of ticks
so the eye reads "this came off an instrument" before it reads any text. The
headline of the card is the ratio, because a ratio survives the machine; the
absolute sits in the body beside its spread.

The card does not print the box it came off. It did, as a labelled `MACHINE`
and `PRINTS IT` rail under every claim, and with six recorded facts on the
site that was four rows of near-identical furniture per card: evidence that
had started reading as decoration. The gate moved rather than went.
`scripts/facts.mjs` refuses to write `facts.json` when a recorded group names
no command or no machine, so a figure with no box still cannot reach a page,
because it cannot reach the record. The colophon on every page names the
generator and the commit, and `facts.json` is in the tree for anyone checking.

`DurationChart` draws duration at real speed, once, when scrolled to, with a
run-again control. Size comparisons are drawn at true area, not true width,
because bar length would flatter the smaller number.

**The settled figure is the default and the animation is the addition.** The
bars carry their finished widths in the built HTML and the stylesheet draws
them; the script only ever takes the figure away and gives it back at real
speed. It used to be the other way round, and the flagship measurement on the
home page and the why page rendered as an empty frame for anyone with scripting
off. A site whose rule is that a figure must be visible to be checkable does
not get to make its evidence conditional on a script. The run-again control is
hidden until a script claims the chart, for the same reason the menu button is:
a control that cannot do anything is not offered.

## Motion

The site declares motion in four places and no more: the CTA's background
transition, the hamburger's bars, and the chart's two keyframe animations.

Every one of them is switched off under `@media (prefers-reduced-motion:
reduce)`, in CSS, next to the rule it disables. Not in a script. The preference
was honoured only by a `matchMedia` check inside the chart's client script,
which meant it was honoured only for readers who run scripts, and there was no
`prefers-reduced-motion` query in any stylesheet at all.

Nothing is hidden to satisfy the preference. Reduced motion shows the settled
state rather than a faster animation, because a shortened animation would be a
false reading, and the settled state is what the page draws anyway.

## Reachability

Three decisions, each of them a defect that was on the page.

**A link inside running text is underlined.** Colour alone does not mark it:
`--brand-deep` against `--ink` body copy is nowhere near the separation a
colour-only distinction needs, and hover is not a cue, because it does not
exist on a touch screen and it is not there when the eye first crosses the
sentence. The rule is drawn by element context, `p a`, `dd a`, `td a`,
`figcaption a`, `blockquote a`, `.prose a`, `.evidence a`, so a nav row, a
card, a step and a CTA opt out by being what they are rather than by carrying a
class.

**A pane that scrolls sideways is focusable and named.** A listing, a compiler
diagnostic and the comparison table all scroll horizontally, and a scrolling
box with nothing focusable inside it cannot be reached with a keyboard at all:
the content is on the page and unreadable without a mouse. Each is a
`role="region"` with `tabindex="0"` and a name built from what the component
already knows, the sample path or the caption, because a region announced as
"region" tells nobody where they landed. The class is `.scroll-x`, declared
once in `base.css`. A pane whose content is already focusable, the playground's
editable listing, is exempt: it is a tab stop in its own right and wrapping it
would make two.

**A control's answer is spoken.** Copy buttons take their name from an
`aria-label`, which wins over their text, so swapping the text to "Copied"
changed what a sighted reader sees and nothing whatever in the accessibility
tree. One polite live region is emitted by the layout on every page and
`src/lib/copy.ts` writes into it, naming what was copied, because "Copied"
alone is useless on a page holding several of them.

## Print

The five lessons are a printed surface, and there was no `@media print`.
`src/styles/print.css` is it.

What the default printout did wrong, worst first. It truncated the code:
`.source` and `.diagnostic` clip a long line and offer a scrollbar, and paper
has no scrollbar, so every listing wider than the measure lost its right-hand
end with no mark to say so. They wrap on paper instead. It printed the
furniture: a masthead, a hamburger that cannot be tapped, a footer nav of links
that cannot be clicked. Those are gone, along with every control. And it
dropped the links, so prose links print their href.

The provenance stays. The evidence rails, the citation footers and the
measurement cards print exactly as they are, and the chart's bars are the one
thing on the site allowed to insist on printing their background colour,
because the bars are the measurement.

## Imagery

The mascot, and the artifact. There is no photography, no stock, no gradient
and no decorative abstraction. Beyond the mascot, every visual is generated
from something the repository produces: duration figures from the measurement
record, mass figures at true area, and structure diagrams set typographically
in mono with hairline edges. An emoji is never an icon.

## Rendered proof

Captured from the running site in a browser.

| File | What it shows |
|---|---|
| `screenshots/40-home.png` | The home page: the one line, the mascot, the listing that runs, the Crystal section with the README's Kemal server, the four cards, the measurement card, and the ways in. |
| `screenshots/41-why.png` | The argument in named axes, with the true-area mass figure. |
| `screenshots/42-learn.png` | The path's entrance and one step of it. |
| `screenshots/43-sample-run.png` | A sample route after Run: the program on the left, its output on the right, the module and exit status on one line under it. |
| `screenshots/45-tour.png` | The playground's table of contents: the tour in sections, each step a page. |

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
- No figure that only exists once a script has run. Every measurement is drawn
  by the stylesheet from data in the built HTML, and a script may animate it,
  never reveal it.
- No control offered where it cannot act. A menu button and a replay button
  appear only once a script has claimed them.
- No colour outside `src/styles/tokens.css`. Both schemes are literals in the
  base `:root`; the dark scheme only aliases them. A `<meta name="theme-color">`
  and the web manifest take a literal and no variable, so they read the token
  file at build time rather than repeating it.
- No control edge drawn with `--hairline`. That token separates areas; a
  control's edge is `--boundary`.
- No font subset or format the site cannot use. `scripts/fonts.mjs` decides
  what ships, and its `unicode-range` values are read from the package.
