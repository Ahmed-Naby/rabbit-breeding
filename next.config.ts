import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project; a stray lockfile in the home dir
  // otherwise makes Next guess the wrong root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      {
        source: "/rabbits",
        destination: "/mothers",
        permanent: true,
      },
      {
        source: "/breedings",
        destination: "/mating",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // The offline PWA bundle (vite.config.web.ts -> public/app/) is a static
      // SPA with client-side routing. Next's public-folder file serving only
      // matches exact file paths, so /app and /app/<sub-route> (e.g. /app/does,
      // deep-linked or reloaded) need to be rewritten to the SPA's index.html
      // rather than 404ing. manifest.webmanifest/sw.js/icons/assets are real
      // files and match before this catch-all runs.
      {
        source: "/app",
        destination: "/app/index.html",
      },
      {
        source: "/app/:path*",
        destination: "/app/index.html",
      },
    ];
  },
};

export default nextConfig;

