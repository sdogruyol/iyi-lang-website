import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";

// GitHub Pages serves this repository at `iyi.dev` (the CNAME under public/,
// which the build copies into dist/ - so the domain is this file's and a
// deploy carries it), at the root. Override both to preview under another
// origin or path.
const site = process.env.SITE_ORIGIN ?? "https://iyi.dev";
const base = process.env.SITE_BASE ?? "/";

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  integrations: [mdx(), sitemap()],

  // SmartyPants is on by default and it rewrites the text it renders: straight
  // quotes become curly, `...` becomes an ellipsis, and prose `--` becomes an
  // em dash. It is off because doc/ART-DIRECTION.md forbids an em dash and an
  // en dash in authored copy, and the lessons are markdown: a pass that
  // invented one on the way to the page would put it there in the one place
  // the prohibition cannot be seen in the source.
  //
  // Declared on the processor rather than as `markdown.smartypants`, which
  // Astro 7 deprecates and warns about on every build. A build that prints a
  // warning every time teaches people to read past its output, which is how a
  // real failure gets missed.
  markdown: { processor: unified({ smartypants: false }) },
  build: { format: "directory" },
  devToolbar: { enabled: false },
  vite: {
    build: {
      // The site argues for small binaries. Shipping a megabyte of JavaScript
      // to say so would be the same failure as transcribing a number.
      assetsInlineLimit: 0,
    },
  },
});
