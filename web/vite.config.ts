import { resolve } from "node:path";
import { defineConfig } from "vite";

// Multi-page static site: landing, onboarding flow and the control center.
export default defineConfig({
  // The setup form and Admin manager messages are imported from the backend's pure modules (../src).
  server: { fs: { allow: [".."] } },
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
