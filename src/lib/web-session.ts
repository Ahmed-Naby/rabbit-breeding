import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { resolveToken, type TokenUser } from "@/lib/auth/tokens";

/**
 * The web app's session: the same opaque DeviceToken the mobile app stores,
 * carried in an httpOnly cookie instead of an Authorization header.
 *
 * Deliberately NOT a second auth system. Reusing DeviceToken means one revoke
 * list, one hashing scheme, and a browser session that shows up in the same
 * place a phone does — rather than a JWT scheme that would drift from the
 * mobile one and have to be kept in sync by hand.
 */
export const SESSION_COOKIE = "rabbittrack_session";

/**
 * Which of the user's farms the browser is currently looking at. Separate from
 * the session cookie on purpose: switching farms must not re-issue the token
 * (that would log every other tab out), and a stale/hostile value here is
 * harmless because it is always intersected with real memberships below.
 */
export const FARM_COOKIE = "rabbittrack_farm";

/** A year. Farm devices stay signed in; revocation is via DeviceToken, not expiry. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

export type WebSession = TokenUser & {
  /** The membership the browser is acting under — never outside `memberships`. */
  activeFarmId: string;
};

/**
 * The current session, or null.
 *
 * `cache()`-memoized per render pass, which matters more here than usual: the
 * Prisma extension resolves the farm through this on EVERY query, so without
 * memoization a page with forty queries would do forty token lookups.
 *
 * Returns null rather than throwing when there is no request context at all —
 * `cookies()` throws outside a request, and the same Prisma client is used by
 * seed scripts and the vitest suite, which resolve their farm from the env
 * fallback instead (see tenant.ts).
 */
export const getWebSession = cache(async (): Promise<WebSession | null> => {
  let token: string | undefined;
  let preferredFarmId: string | undefined;
  try {
    const jar = await cookies();
    token = jar.get(SESSION_COOKIE)?.value;
    preferredFarmId = jar.get(FARM_COOKIE)?.value;
  } catch {
    return null; // no request context (script, test, background job)
  }
  if (!token) return null;

  const user = await resolveToken(token);
  if (!user || user.memberships.length === 0) return null;

  // The cookie only gets to *pick among* memberships, never to name a farm.
  // Anything else — a farm the user was removed from, or a hand-edited cookie
  // pointing at someone else's farm — falls back to their first membership.
  const active =
    user.memberships.find((m) => m.farmId === preferredFarmId) ?? user.memberships[0];

  return { ...user, activeFarmId: active.farmId };
});

/**
 * Three-way, because "nobody is signed in" and "there is no browser here at
 * all" must not be treated the same way. Falling back to DEFAULT_FARM_ID for
 * an anonymous *browser* is exactly the hole this whole layer exists to close
 * — it is what made production serve a real farm's 199 does to any visitor.
 * A seed script or a vitest run has no cookie jar and legitimately needs the
 * env fallback, so tenant.ts distinguishes the two on this value.
 */
export type FarmContext =
  | { kind: "session"; farmId: string }
  | { kind: "anonymous" }
  | { kind: "no-request" };

export async function getFarmContext(): Promise<FarmContext> {
  try {
    await cookies();
  } catch {
    return { kind: "no-request" };
  }
  const session = await getWebSession();
  return session ? { kind: "session", farmId: session.activeFarmId } : { kind: "anonymous" };
}

/** The membership row for the farm currently being viewed. */
export async function currentMembership() {
  const session = await getWebSession();
  if (!session) return null;
  return session.memberships.find((m) => m.farmId === session.activeFarmId) ?? null;
}
