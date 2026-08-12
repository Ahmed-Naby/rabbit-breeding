import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/web-session";

// The Android/Electron offline apps (and the /app PWA) load a bundle from
// their own origin (e.g. https://localhost in the Capacitor WebView) and
// call /api/sync/* on this deployment's origin — a cross-origin fetch that
// needs real CORS headers, including answering the preflight OPTIONS request
// browsers/WebViews send ahead of the actual POST/GET because of the custom
// x-sync-key header. There's no cookie/session involved (auth.ts checks a
// shared-secret header only), so a wildcard origin carries no CSRF risk.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  // Must list every header the offline app actually sends — syncFetch()'s
  // legacy x-sync-key plus the auth scheme's Authorization/x-farm-id (see
  // src/mobile/sync/sync-manager.ts and src/mobile/auth.ts) — the preflight
  // is rejected client-side if any requested header isn't explicitly allowed.
  "Access-Control-Allow-Headers":
    "Content-Type, x-sync-key, Authorization, x-farm-id, Cache-Control, Pragma, Expires",
};

function withCors(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * The web app's front door: anything that isn't the login page needs a session
 * cookie.
 *
 * Deliberately an *optimistic* check — cookie present or absent, no database
 * lookup. Proxy runs on every request including prefetches, and the real
 * enforcement is one layer down anyway: resolveFarmId() throws NoSessionError
 * rather than falling back to DEFAULT_FARM_ID, so a forged cookie gets past
 * this file and then reaches no farm data at all. This exists to turn that
 * error into a redirect for the ordinary logged-out visitor, not to be the
 * security boundary.
 */
/**
 * Marks a request as "this route is behind the session gate", so the root
 * layout can redirect instead of letting the page explode.
 *
 * The gap it closes: a cookie that exists but no longer resolves (token
 * revoked, database reset) sails past the optimistic check below, and then
 * every query throws NoSessionError — a 500 with no way out but clearing
 * cookies by hand. The layout can't tell that case from rendering /login
 * itself, because Server Components can't read the pathname; this header is
 * how it finds out, and it is only ever set on routes this matcher covers,
 * which /login is not.
 */
export const GATED_HEADER = "x-rabbittrack-gated";

function withSession(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)) {
    const headers = new Headers(request.headers);
    headers.set(GATED_HEADER, "1");
    return NextResponse.next({ request: { headers } });
  }

  const { pathname, search } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // Where they were headed, so signing in lands them there rather than on the
  // dashboard. Always a same-origin path off nextUrl — never a caller URL.
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  // /api is Bearer-authenticated for the mobile and desktop apps, which carry
  // no cookies — gating it on a session would break every sync.
  return request.nextUrl.pathname.startsWith("/api")
    ? withCors(request)
    : withSession(request);
}

export const config = {
  matcher: [
    "/api/sync/:path*",
    "/api/auth/:path*",
    "/api/farm",
    "/api/farm/:path*",
    // Called by the offline app exactly like /api/sync/*, so it needs the same
    // CORS answer. This list is opt-in per route: a route left off it works
    // from curl and fails only in a browser, at the preflight, with an error
    // carrying no status to explain itself.
    "/api/insights",
    // Every page except the login form itself, Next's assets, and static
    // files served from /public.
    //
    // `app` is excluded because /app is the offline PWA bundle, not a Next
    // page: it ships its own Bearer-token login (src/mobile/pages/login-page)
    // and stores the token in localStorage, so it has no session cookie and
    // gating it here would bounce every phone straight to a form it can't use.
    "/((?!api|app|login|_next/static|_next/image|favicon.ico|fonts|icons|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
};
