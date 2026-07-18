import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { authenticateSync, requireOwner } from "../../sync/auth";

/**
 * Farm membership management, owner-only. Supervisors don't self-register:
 * the owner creates the account here (email + password) and it's added
 * straight to the owner's farm as a member. If the email already belongs to
 * an account, that account is added to the farm without touching its
 * password. One account can belong to several farms.
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
      allowedPages: (m.allowedPages as string[] | null) ?? null,
      isSelf: m.userId === auth.userId,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;
  const roleError = requireOwner(auth);
  if (roleError) return roleError;

  let body: { email?: string; password?: string; name?: string; role?: string; allowedPages?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const role = body.role === "owner" ? "owner" : "worker";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  // null (or omitted) = all pages; otherwise a plain list of route hashes.
  let allowedPages: string[] | null = null;
  if (Array.isArray(body.allowedPages)) {
    allowedPages = body.allowedPages.filter((p): p is string => typeof p === "string").slice(0, 50);
  }

  // Create the account on the fly when the email is new — the owner sets its
  // password. An existing account keeps its own password.
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const password = body.password ?? "";
    if (password.length < 8) {
      return Response.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
    }
    user = await prisma.user.create({
      data: { email, passwordHash: hashPassword(password), name: body.name?.trim() || null },
    });
  }

  try {
    await prisma.farmMember.upsert({
      where: { farmId_userId: { farmId: auth.farmId, userId: user.id } },
      create: {
        farmId: auth.farmId,
        userId: user.id,
        role,
        allowedPages: allowedPages === null ? Prisma.DbNull : (allowedPages as Prisma.InputJsonValue),
      },
      update: {
        role,
        allowedPages: allowedPages === null ? Prisma.DbNull : (allowedPages as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    // Surface the real cause to the owner-only client instead of a bare 500 —
    // this endpoint is not public, so echoing the DB message is acceptable and
    // makes field-level failures diagnosable without server-log access.
    console.error("[farm/members] upsert failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "MEMBER_UPSERT_FAILED", detail }, { status: 500 });
  }
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
