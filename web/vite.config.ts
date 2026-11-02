import { resolve } from "node:path";
import { defineConfig } from "vite";

// Multi-page static site: landing, onboarding flow and the control center.
export default defineConfig({
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
