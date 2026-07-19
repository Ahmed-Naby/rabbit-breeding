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
  plugins: {
    // The app's local DB is always opened "no-encryption", but by default the
    // SQLite plugin still initializes an Android-Keystore-backed secret store
    // in its load() — which failed on a Samsung A52 (keymaster
    // VERIFICATION_FAILED), leaving the whole plugin null and the app stuck
    // on the loading screen. Encryption is unused, so skip that machinery
    // entirely and never touch the Keystore.
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
