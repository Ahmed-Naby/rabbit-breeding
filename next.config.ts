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
};

export default nextConfig;

