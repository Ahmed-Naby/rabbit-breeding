import { resolveToken } from "@/lib/auth/tokens";
import { DEFAULT_FARM_ID } from "@/lib/tenant";

export type SyncAuthContext = {
  farmId: string;
  userId: string | null; // null for legacy shared-secret clients
  role: "owner" | "worker";
};

/**
 * Authenticates a sync request and resolves which farm it operates on.
 *
 * Preferred: `Authorization: Bearer <device token>` from login/register.
 * A member of several farms picks one via the `x-farm-id` header; with a
 * single membership the header is optional.
 *
 * Legacy fallback: the old baked-in `x-sync-key` shared secret, mapped to
 * the default farm with owner powers — this is what keeps already-installed
 * desktop/APK builds syncing during the auth rollout, and it goes away once
 * every device runs a login-capable build.
 */
export async function authenticateSync(request: Request): Promise<SyncAuthContext | Response> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const resolved = await resolveToken(authHeader.slice(7).trim());
    if (!resolved) return Response.json({ error: "INVALID_TOKEN" }, { status: 401 });
    if (resolved.memberships.length === 0) {
      return Response.json({ error: "NO_FARM_MEMBERSHIP" }, { status: 403 });
    }
    const requestedFarm = request.headers.get("x-farm-id");
    const membership = requestedFarm
      ? resolved.memberships.find((m) => m.farmId === requestedFarm)
      : resolved.memberships.length === 1
        ? resolved.memberships[0]
        : null;
    if (!membership) {
      return Response.json(
        { error: requestedFarm ? "NOT_A_MEMBER_OF_FARM" : "FARM_ID_REQUIRED" },
        { status: 403 }
      );
    }
    return { farmId: membership.farmId, userId: resolved.userId, role: membership.role as "owner" | "worker" };
  }

  const legacySecret = process.env.SYNC_SHARED_SECRET;
  if (legacySecret && request.headers.get("x-sync-key") === legacySecret) {
    return { farmId: DEFAULT_FARM_ID, userId: null, role: "owner" };
  }

  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/** Danger-zone gate: wipe/full-import are owner-only. */
export function requireOwner(ctx: SyncAuthContext): Response | null {
  if (ctx.role !== "owner") {
    return Response.json({ error: "OWNER_ROLE_REQUIRED" }, { status: 403 });
  }
  return null;
}
