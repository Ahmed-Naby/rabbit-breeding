import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { issueToken } from "@/lib/auth/tokens";

export async function POST(request: Request) {
  let body: { email?: string; password?: string; deviceLabel?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  // Identical response for unknown email and wrong password — no account probing.
  if (!user || !verifyPassword(body.password ?? "", user.passwordHash)) {
    return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const token = await issueToken(user.id, body.deviceLabel ?? null);
  const memberships = await prisma.farmMember.findMany({
    where: { userId: user.id },
    include: { farm: { select: { name: true, location: true } } },
    orderBy: { farm: { createdAt: "asc" } },
  });
  return Response.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
    farms: memberships.map((m) => ({
      farmId: m.farmId,
      role: m.role,
      name: m.farm.name,
      location: m.farm.location,
      allowedPages: (m.allowedPages as string[] | null) ?? null,
    })),
  });
}
