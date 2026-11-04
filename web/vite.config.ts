import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

/**
 * Shared page pieces (head, header, footer, logo) live once in web/partials and are pasted in at build time,
 * so every page has the same navigation with no script needed.
 * Usage in a page:  <!--@include header-->   or   <!--@include head title="Pricing" description="..."-->
 */
function partials(): Plugin {
  const read = (name: string) => readFileSync(resolve(__dirname, "partials", `${name}.html`), "utf8");
  const expand = (html: string, depth = 0): string =>
    depth > 3
      ? html
      : html.replace(/<!--@include (\w+)((?:\s+\w+="[^"]*")*)\s*-->/g, (_m, name: string, attrs: string) => {
          let out = read(name);
          for (const [, k, v] of attrs.matchAll(/(\w+)="([^"]*)"/g)) out = out.replaceAll(`{{${k}}}`, v!);
          return expand(out, depth + 1);
        });
  return { name: "partials", transformIndexHtml: { order: "pre", handler: (html) => expand(html) } };
}

// Multi-page static site: landing, onboarding flow and the control center.
export default defineConfig({
  plugins: [partials()],
  // In development the website talks to the API started with `npm run dev:api` in the repo root.
  // The setup form and Admin manager messages are imported from the backend's pure modules (../src).
  server: { proxy: { "/api": "http://localhost:8787" }, fs: { allow: [".."] } },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        onboarding: resolve(__dirname, "onboarding.html"),
        app: resolve(__dirname, "app.html"),
        signin: resolve(__dirname, "signin.html"),
        employees: resolve(__dirname, "employees.html"),
        pricing: resolve(__dirname, "pricing.html"),
        security: resolve(__dirname, "security.html"),
        notFound: resolve(__dirname, "404.html"),
      },
    },
  },
});
