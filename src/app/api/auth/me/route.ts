import { prisma } from "@/lib/prisma";
import { resolveToken } from "@/lib/auth/tokens";

/**
 * Current identity + LIVE farm memberships for the presented token. Clients
 * cache the farms list from login; this is how a device learns it was added
 * to (or removed from) a farm afterwards without logging out and back in.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resolved = await resolveToken(authHeader.slice(7).trim());
  if (!resolved) return Response.json({ error: "INVALID_TOKEN" }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: resolved.userId },
    select: { id: true, email: true, name: true },
  });
  return Response.json({
    user,
    farms: resolved.memberships.map((m) => ({ farmId: m.farmId, role: m.role, name: m.farmName, allowedPages: m.allowedPages })),
  });
}
