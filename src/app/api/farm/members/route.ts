import { prisma } from "@/lib/prisma";
import { authenticateSync, requireOwner } from "../../sync/auth";

/**
 * Farm membership management, owner-only. There is no email-invitation
 * flow: the person registers their own account first (getting an empty
 * farm of their own), then the owner adds them here by email — one
 * account can belong to several farms.
 */
export async function GET(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;
  const roleError = requireOwner(auth);
  if (roleError) return roleError;

  const members = await prisma.farmMember.findMany({
    where: { farmId: auth.farmId },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({
    members: members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      isSelf: m.userId === auth.userId,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;
  const roleError = requireOwner(auth);
  if (roleError) return roleError;

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const role = body.role === "owner" ? "owner" : "worker";
  if (!email) return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return Response.json({ error: "USER_NOT_FOUND" }, { status: 404 });

  await prisma.farmMember.upsert({
    where: { farmId_userId: { farmId: auth.farmId, userId: user.id } },
    create: { farmId: auth.farmId, userId: user.id, role },
    update: { role },
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;
  const roleError = requireOwner(auth);
  if (roleError) return roleError;

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  if (!body.userId) return Response.json({ error: "USER_ID_REQUIRED" }, { status: 400 });

  const target = await prisma.farmMember.findUnique({
    where: { farmId_userId: { farmId: auth.farmId, userId: body.userId } },
  });
  if (!target) return Response.json({ error: "NOT_A_MEMBER" }, { status: 404 });
  if (target.role === "owner") {
    const owners = await prisma.farmMember.count({ where: { farmId: auth.farmId, role: "owner" } });
    if (owners <= 1) return Response.json({ error: "CANNOT_REMOVE_LAST_OWNER" }, { status: 400 });
  }

  await prisma.farmMember.delete({
    where: { farmId_userId: { farmId: auth.farmId, userId: body.userId } },
  });
  return Response.json({ ok: true });
}
