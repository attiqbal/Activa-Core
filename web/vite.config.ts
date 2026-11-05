import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

// Public origin of the site, used for canonical links, Open Graph tags, the sitemap and robots.txt.
// Set SITE_URL when building for a real domain (for example SITE_URL=https://example.com npm run build).
const SITE_URL = (process.env.SITE_URL ?? "https://virtualnafree.com").replace(/\/+$/, "");

/** Public, indexable pages. App and onboarding pages are noindex and stay out of the sitemap. */
const INDEXED_PAGES = ["/"];

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/**
 * SEO plugin (ECC `seo` skill): fills %SITE_URL%, adds JSON-LD built from what the page actually shows
 * (the FAQ schema is generated from the FAQ markup, so the two cannot drift), and emits robots.txt and sitemap.xml.
 */
function seo(): Plugin {
  return {
    name: "virtual-nafree-seo",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        let out = html.replaceAll("%SITE_URL%", SITE_URL);
        if (!ctx.filename.endsWith("/index.html")) return out;
        const faqs = [...out.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(([, q = "", a = ""]) => ({
          "@type": "Question",
          name: decode(q),
          acceptedAnswer: { "@type": "Answer", text: decode(a) },
        }));
        const graph = [
          { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "Virtual Nafree", url: `${SITE_URL}/`, logo: `${SITE_URL}/favicon.svg` },
          { "@type": "WebSite", "@id": `${SITE_URL}/#site`, name: "Virtual Nafree", url: `${SITE_URL}/`, publisher: { "@id": `${SITE_URL}/#org` }, inLanguage: "en" },
          ...(faqs.length ? [{ "@type": "FAQPage", "@id": `${SITE_URL}/#faq`, mainEntity: faqs }] : []),
        ];
        const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
        return out.replace("</head>", `<script type="application/ld+json">${json}</script>\n</head>`);
      },
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n\n# App and onboarding pages are noindex via meta tag; they stay crawlable so the tag is seen.\nSitemap: ${SITE_URL}/sitemap.xml\n` });
      const urls = INDEXED_PAGES.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n");
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
    },
  };
}

// Multi-page static site: landing, onboarding flow and the control center.
export default defineConfig({
  plugins: [seo()],
  // In development the website talks to the API started with `npm run dev:api` in the repo root.
  // The setup form and Admin manager messages are imported from the backend's pure modules (../src).
  server: { proxy: { "/api": "http://localhost:8787" }, fs: { allow: [".."] } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        onboarding: resolve(__dirname, "onboarding.html"),
        app: resolve(__dirname, "app.html"),
      },
    },
  },
});
