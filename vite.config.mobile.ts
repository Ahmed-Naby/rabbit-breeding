import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the Capacitor app's own bundle — completely separate from `next build`
// (which still serves the Vercel deployment). Output goes to `www/`, matching
// capacitor.config.ts's `webDir`. Reuses the same `@/*` -> `src/*` alias as
// tsconfig.json so mobile code can import shared, framework-agnostic modules
// (src/lib/enums.ts, dates.ts, units.ts, does-board.ts, i18n dictionaries) with
// no path rewriting.
export default defineConfig({
  root: path.resolve(__dirname, "src/mobile"),
  base: "",
  envDir: path.resolve(__dirname),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "www"),
    emptyOutDir: true,
  },
});
