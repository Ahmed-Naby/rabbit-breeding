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
    farms: resolved.memberships.map((m) => ({
      farmId: m.farmId,
      role: m.role,
      name: m.farmName,
      location: m.farmLocation,
      allowedPages: m.allowedPages,
    })),
  });
}

/** Lets any signed-in account (owner or supervisor) set/edit its own display name — there's no registration UI to set it at, since supervisors never self-register. */
export async function PATCH(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resolved = await resolveToken(authHeader.slice(7).trim());
  if (!resolved) return Response.json({ error: "INVALID_TOKEN" }, { status: 401 });

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: resolved.userId },
    data: { name: body.name?.trim() || null },
    select: { id: true, email: true, name: true },
  });
  return Response.json({ user });
}
