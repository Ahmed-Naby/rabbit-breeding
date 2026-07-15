import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Builds the same src/mobile bundle as vite.config.mobile.ts, but targeting a
// real browser instead of a Capacitor/Electron WebView: served from the
// Next.js deployment at the /app subpath, installable as a PWA (manifest +
// Workbox service worker for full offline boot). Output goes to
// public/app/, which Next.js serves as a static passthrough — next build
// runs after this in the "build" script so it never clobbers this output.
export default defineConfig({
  root: path.resolve(__dirname, "src/mobile"),
  base: "/app/",
  envDir: path.resolve(__dirname),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        globPatterns: ["**/*.{js,css,html,wasm,png,svg,ico}"],
      },
      manifest: {
        name: "RabbitTrack",
        short_name: "RabbitTrack",
        description: "RabbitTrack offline-capable rabbit breeding tracker",
        start_url: "/app/",
        scope: "/app/",
        display: "standalone",
        lang: "ar",
        dir: "rtl",
        theme_color: "#4a7c59",
        background_color: "#fbfaf6",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "public/app"),
    emptyOutDir: true,
  },
});
