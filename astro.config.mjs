import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

// GitHub Pages serves this repository at `iyi-lang.com` (the CNAME under
// public/, which the build copies into dist/ - so the domain is this file's
// and a deploy carries it), at the root. Override both to preview under
// another origin or path.
const site = process.env.SITE_ORIGIN ?? "https://iyi-lang.com";
const base = process.env.SITE_BASE ?? "/";

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  integrations: [mdx()],

  // SmartyPants is on by default and it rewrites the text it renders: straight
  // quotes become curly, `...` becomes an ellipsis, and prose `--` becomes an
  // em dash. The SPEC.md and CHANGELOG.md pages are generated verbatim from
  // those files, so a pass that edits punctuation on the way to the page makes
  // the generated-from banner a lie. It is off for the whole site rather than
  // for those pages, because the same pass would put em dashes in copy that is
  // written without them on purpose.
  markdown: { smartypants: false },
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
