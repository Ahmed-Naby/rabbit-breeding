import { prisma } from "@/lib/prisma";
import { authenticateSync, requireOwner } from "../sync/auth";

/**
 * The active farm's editable profile (name + location), owner-only. Kept
 * separate from the per-farm Settings model (units/breeding config) — those
 * sync through the outbox, whereas the farm's identity is edited directly.
 */
export async function PATCH(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;
  const roleError = requireOwner(auth);
  if (roleError) return roleError;

  let body: { name?: string; location?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (name !== undefined && name.length === 0) {
    return Response.json({ error: "INVALID_FARM_NAME" }, { status: 400 });
  }
  // Empty location string clears it back to null.
  const location = body.location === undefined ? undefined : body.location.trim() || null;

  const farm = await prisma.farm.update({
    where: { id: auth.farmId },
    data: { ...(name !== undefined ? { name } : {}), ...(location !== undefined ? { location } : {}) },
    select: { name: true, location: true },
  });
  return Response.json({ ok: true, farm });
}
