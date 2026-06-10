import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (which roots at src/client for the SPA build).
export default defineConfig({
  root: __dirname,
  test: {
    include: ["src/core/**/*.test.ts"],
    environment: "node",
  },
});
