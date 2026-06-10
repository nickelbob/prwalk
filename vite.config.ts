import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The client is a standalone SPA built into dist/client, which the Node
// server serves as static assets in the installed/global flow.
export default defineConfig({
  root: resolve(__dirname, "src/client"),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist/client"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    // In dev, proxy API calls to a locally-running `prwalk serve --dev`.
    proxy: {
      "/api": "http://localhost:7777",
    },
  },
});
