import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Opaque bearer tokens for devices (the mobile/desktop apps store one after
 * login; the web app keeps one in a cookie). Only the sha256 of the token is
 * persisted, so a database leak cannot be replayed as logins. Tokens are
 * long-lived by design — a farm device stays signed in until it logs out or
 * the owner revokes it.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueToken(userId: string, label?: string | null): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.deviceToken.create({
    data: { tokenHash: hashToken(token), userId, label: label ?? null },
  });
  return token;
}

export type TokenUser = {
  userId: string;
  memberships: { farmId: string; role: string; farmName: string }[];
};

/** Resolves a bearer token to its user + farm memberships, or null. */
export async function resolveToken(token: string): Promise<TokenUser | null> {
  const row = await prisma.deviceToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { memberships: { include: { farm: { select: { name: true } } } } } },
    },
  });
  if (!row) return null;
  // Fire-and-forget freshness stamp; auth must not fail on its failure.
  prisma.deviceToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return {
    userId: row.userId,
    memberships: row.user.memberships.map((m) => ({
      farmId: m.farmId,
      role: m.role,
      farmName: m.farm.name,
    })),
  };
}

export async function revokeToken(token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { tokenHash: hashToken(token) } });
}
