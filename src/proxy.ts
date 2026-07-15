import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The Android/Electron offline apps (and the /app PWA) load a bundle from
// their own origin (e.g. https://localhost in the Capacitor WebView) and
// call /api/sync/* on this deployment's origin — a cross-origin fetch that
// needs real CORS headers, including answering the preflight OPTIONS request
// browsers/WebViews send ahead of the actual POST/GET because of the custom
// x-sync-key header. There's no cookie/session involved (auth.ts checks a
// shared-secret header only), so a wildcard origin carries no CSRF risk.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  // Must list every header sync-manager.ts's syncFetch() actually sends
  // (see src/mobile/sync/sync-manager.ts) — the preflight is rejected
  // client-side if any requested header isn't explicitly allowed here.
  "Access-Control-Allow-Headers": "Content-Type, x-sync-key, Cache-Control, Pragma, Expires",
};

export function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/sync/:path*",
};
