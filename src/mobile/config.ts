// Vite build-time env (see vite.config.mobile.ts, Phase 3) — VITE_-prefixed
// vars are the only ones Vite exposes to client code, unlike Next's
// NEXT_PUBLIC_ convention. Cast rather than relying on ambient
// ImportMetaEnv typing, since this file is also walked by Next's
// whole-project tsc, which has no vite/client types loaded.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

// Falls back to the same deployment capacitor.config.ts points the WebView
// shell at, so sync works even before Phase 3 wires up the mobile build's
// own .env. Not sensitive, so a fallback is fine here.
export const SYNC_API_BASE_URL = env.VITE_SYNC_API_BASE_URL ?? "https://rabbit-breeding-ahmed-nabys-projects.vercel.app";

// No fallback: the shared secret must always come from the build-time env so
// it's never committed to source. Missing it fails the build loudly instead
// of silently shipping a bundle that can't authenticate against /api/sync/*.
if (!env.VITE_SYNC_SHARED_SECRET) {
  throw new Error("VITE_SYNC_SHARED_SECRET is not set — add it to .env.local (dev) or the Vercel project's env vars (build).");
}
export const SYNC_SHARED_SECRET = env.VITE_SYNC_SHARED_SECRET;
