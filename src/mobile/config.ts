// Vite build-time env (see vite.config.mobile.ts, Phase 3) — VITE_-prefixed
// vars are the only ones Vite exposes to client code, unlike Next's
// NEXT_PUBLIC_ convention. Cast rather than relying on ambient
// ImportMetaEnv typing, since this file is also walked by Next's
// whole-project tsc, which has no vite/client types loaded.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

// Falls back to the same deployment capacitor.config.ts points the WebView
// shell at, so sync works even before Phase 3 wires up the mobile build's
// own .env.
export const SYNC_API_BASE_URL = env.VITE_SYNC_API_BASE_URL ?? "https://rabbit-breeding-ahmed-nabys-projects.vercel.app";
export const SYNC_SHARED_SECRET = env.VITE_SYNC_SHARED_SECRET ?? "";
