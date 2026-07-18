import { prisma } from "@/lib/prisma";
import { resolveToken } from "@/lib/auth/tokens";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * Lets a signed-in account change its own password. Requires the current
 * password (a stolen device token alone can't silently reset it) and a new
 * password of at least 8 characters. Bearer-token auth only — the legacy
 * shared-secret has no user to attach a password to.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resolved = await resolveToken(authHeader.slice(7).trim());
  if (!resolved) return Response.json({ error: "INVALID_TOKEN" }, { status: 401 });

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const newPassword = body.newPassword ?? "";
  if (newPassword.length < 8) {
    return Response.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: resolved.userId } });
  if (!verifyPassword(body.currentPassword ?? "", user.passwordHash)) {
    return Response.json({ error: "WRONG_CURRENT_PASSWORD" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword) },
  });
  return Response.json({ ok: true });
}
