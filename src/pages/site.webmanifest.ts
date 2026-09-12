/**
 * The web app manifest, built from the tokens rather than beside them.
 *
 * It was a static file under `public/` carrying two literal colours,
 * `#ffffff` and `#d1333d`. Both were a second place for the palette to
 * disagree with itself, and one of them already had: `#d1333d` is the accent,
 * and nothing along the top of any page on this site is the accent, so the
 * colour an installed shell painted its chrome had never matched the page it
 * framed. Neither could follow the dark scheme, because a manifest has no
 * media queries.
 *
 * So it is generated. `background_color` is the ground a shell paints while
 * the page is still loading and `theme_color` is the chrome around it, and
 * both are `--paper`, read out of `src/styles/tokens.css`, because that is the
 * colour the masthead is. A manifest cannot answer `prefers-color-scheme`, so
 * it answers with the light scheme the site defaults to; the two
 * `<meta name="theme-color">` tags in the layout are what carry the dark one,
 * and they can, because a meta takes a media query.
 *
 * Renaming the token fails this build. That is the point of reading it.
 */
import tokensCss from "../styles/tokens.css?raw";

const token = (name: string): string => {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(tokensCss);
  if (!found) {
    throw new Error(
      `site.webmanifest: src/styles/tokens.css declares no --${name}. The ` +
        `manifest's colours are read from the palette so there is one place ` +
        `they are decided, and that place no longer has this name.`,
    );
  }
  return found[1];
};

export const GET = () => {
  const paper = token("paper");

  return new Response(
    `${JSON.stringify(
      {
        name: "iyi",
        short_name: "iyi",
        description: "A friendly, fast language for people and their agents.",
        start_url: "/",
        display: "browser",
        background_color: paper,
        theme_color: paper,
        icons: [
          { src: "/favicon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/favicon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      null,
      2,
    )}\n`,
    { headers: { "content-type": "application/manifest+json" } },
  );
};
