import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { issueToken } from "@/lib/auth/tokens";
import { DEFAULT_FARM_ID } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";

/**
 * Creates an account. The first account ever registered claims ownership of
 * the default farm (where all pre-auth data was backfilled by the
 * multi_farm_tenancy migration); every later account gets a fresh farm of
 * its own. Returns a device token — registering IS logging in.
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string; name?: string; farmName?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
  }

  const defaultFarmUnclaimed =
    (await prisma.farmMember.count({ where: { farmId: DEFAULT_FARM_ID } })) === 0 &&
    (await prisma.farm.count({ where: { id: DEFAULT_FARM_ID } })) === 1;

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, passwordHash: hashPassword(password), name: body.name?.trim() || null },
      });
      if (defaultFarmUnclaimed) {
        await tx.farmMember.create({
          data: { farmId: DEFAULT_FARM_ID, userId: created.id, role: "owner" },
        });
      } else {
        const farm = await tx.farm.create({
          data: { name: body.farmName?.trim() || "مزرعتي" },
        });
        await tx.farmMember.create({
          data: { farmId: farm.id, userId: created.id, role: "owner" },
        });
        await tx.settings.create({ data: { farmId: farm.id } });
      }
      return created;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "EMAIL_IN_USE" }, { status: 409 });
    }
    throw e;
  }

  const token = await issueToken(user.id, body.name ?? email);
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
