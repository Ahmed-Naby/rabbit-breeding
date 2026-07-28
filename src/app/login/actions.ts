"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { issueToken, revokeToken } from "@/lib/auth/tokens";
import { getWebSession, SESSION_COOKIE, FARM_COOKIE, SESSION_MAX_AGE } from "@/lib/web-session";
import { DEFAULT_FARM_ID, runWithFarm } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export type AuthState = { error?: string } | undefined;

// Same starting set the API's /api/auth/register seeds a new farm with. Kept
// in one place so a farm created from the browser and one created from the
// phone don't start with different breed pickers.
const DEFAULT_BREEDS = [
  "هولندي", "هاي بلس", "هارلي", "نيوزلندي", "كاليفورنيا", "في بلس",
  "فلاندر", "شانتيلا", "ركس", "جبلي", "بلدي", "بلجيكي", "بايون", "اسكندرية",
];

async function setSessionCookie(token: string, farmId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, // the token is a bearer credential; JS must never read it
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // Readable by JS is fine — it only ever *picks among* the user's real
  // memberships (see web-session.ts), so tampering with it grants nothing.
  jar.set(FARM_COOKIE, farmId, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { t } = await getDictionary();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: t.auth.missingFields };

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { orderBy: { farm: { createdAt: "asc" } } } },
  });

  // One message for "no such account" and "wrong password" alike: telling them
  // apart turns the form into an oracle for which emails have accounts.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: t.auth.invalidCredentials };
  }
  if (user.memberships.length === 0) return { error: t.auth.noFarmMembership };

  const token = await issueToken(user.id, "web");
  await setSessionCookie(token, user.memberships[0].farmId);
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { t } = await getDictionary();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const farmName = String(formData.get("farmName") ?? "").trim();

  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: t.auth.invalidEmail };
  if (password.length < 8) return { error: t.auth.passwordTooShort };

  // The very first account ever created claims the farm the pre-tenancy data
  // was backfilled into, so an existing single-farm install doesn't strand its
  // own history behind a brand-new empty farm.
  const defaultFarmUnclaimed =
    (await prisma.farmMember.count({ where: { farmId: DEFAULT_FARM_ID } })) === 0 &&
    (await prisma.farm.count({ where: { id: DEFAULT_FARM_ID } })) === 1;

  let userId: string;
  let farmId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, passwordHash: hashPassword(password), name: name || null },
      });
      if (defaultFarmUnclaimed) {
        await tx.farmMember.create({
          data: { farmId: DEFAULT_FARM_ID, userId: u.id, role: "owner" },
        });
        return { userId: u.id, farmId: DEFAULT_FARM_ID };
      }
      const farm = await tx.farm.create({ data: { name: farmName || "مزرعتي" } });
      await tx.farmMember.create({ data: { farmId: farm.id, userId: u.id, role: "owner" } });
      await tx.settings.create({ data: { farmId: farm.id } });
      await runWithFarm(farm.id, () =>
        tx.breed.createMany({ data: DEFAULT_BREEDS.map((n) => ({ name: n })) })
      );
      return { userId: u.id, farmId: farm.id };
    });
    userId = created.userId;
    farmId = created.farmId;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: t.auth.emailInUse };
    }
    throw e;
  }

  const token = await issueToken(userId, "web");
  await setSessionCookie(token, farmId);
  redirect("/");
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  // Revoke server-side too, not just locally: clearing the cookie alone would
  // leave a live DeviceToken that anyone who captured it could keep using.
  if (token) await revokeToken(token);
  jar.delete(SESSION_COOKIE);
  jar.delete(FARM_COOKIE);
  redirect("/login");
}

/** Point the browser at another of the signed-in user's farms. */
export async function switchFarm(farmId: string) {
  const session = await getWebSession();
  // Membership is re-checked here rather than trusted from the form: the
  // client sends whatever id it likes, and the cookie is what every later
  // query resolves the tenant from.
  if (!session?.memberships.some((m) => m.farmId === farmId)) return;

  const jar = await cookies();
  jar.set(FARM_COOKIE, farmId, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // Every page's data belongs to the old farm — none of it survives the switch.
  revalidatePath("/", "layout");
}
