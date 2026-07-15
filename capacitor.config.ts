import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rabbittrack.app",
  appName: "RabbitTrack",
  webDir: "www",
  // Loads the local offline-first bundle (built by vite.config.mobile.ts)
  // instead of the live Vercel deployment — the app shell's "Open full
  // site" button (@capacitor/browser) covers screens still out of the
  // offline scope. See the sync plan's Phase 3 section.
  server: {
    androidScheme: "https",
  },
};

export default config;
