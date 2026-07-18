import { describe, test, expect, beforeEach } from "vitest";
import { resetDb, prisma } from "./db";
import { DEFAULT_FARM_ID } from "@/lib/tenant";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as membersGet, POST as membersPost, DELETE as membersDelete } from "@/app/api/farm/members/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { authenticateSync } from "@/app/api/sync/auth";

beforeEach(resetDb);

function jsonRequest(url: string, method: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(`http://test.local${url}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function registerUser(email: string, password = "password123", farmName?: string) {
  const res = await registerRoute(jsonRequest("/api/auth/register", "POST", { email, password, farmName }));
  const data = (await res.json()) as { token: string; farms: { farmId: string; role: string }[] };
  return { status: res.status, ...data };
}

describe("registration", () => {
  test("the first account claims the default farm; later ones get fresh farms", async () => {
    await prisma.farm.create({ data: { id: DEFAULT_FARM_ID, name: "المزرعة الرئيسية" } });

    const first = await registerUser("owner@farm.dev");
    expect(first.status).toBe(200);
    expect(first.farms).toEqual([expect.objectContaining({ farmId: DEFAULT_FARM_ID, role: "owner" })]);

    const second = await registerUser("neighbor@farm.dev", "password123", "مزرعة الجيران");
    expect(second.status).toBe(200);
    expect(second.farms).toHaveLength(1);
    expect(second.farms[0].farmId).not.toBe(DEFAULT_FARM_ID);
    expect(second.farms[0].role).toBe("owner");
    // The new farm got its own settings row.
    expect(await prisma.settings.count({ where: { farmId: second.farms[0].farmId } })).toBe(1);
  });

  test("duplicate email is rejected without creating anything", async () => {
    await registerUser("dup@farm.dev");
    const again = await registerRoute(jsonRequest("/api/auth/register", "POST", { email: "dup@farm.dev", password: "password123" }));
    expect(again.status).toBe(409);
    expect(await prisma.user.count({ where: { email: "dup@farm.dev" } })).toBe(1);
  });
});

describe("login and sync auth", () => {
  test("login token authenticates sync requests for the member's farm", async () => {
    const reg = await registerUser("worker@farm.dev");

    const loginRes = await loginRoute(jsonRequest("/api/auth/login", "POST", { email: "worker@farm.dev", password: "password123" }));
    expect(loginRes.status).toBe(200);
    const { token } = (await loginRes.json()) as { token: string };

    const ctx = await authenticateSync(jsonRequest("/api/sync/pull", "GET", undefined, { authorization: `Bearer ${token}` }));
    expect(ctx).not.toBeInstanceOf(Response);
    if (ctx instanceof Response) return;
    expect(ctx.farmId).toBe(reg.farms[0].farmId);
    expect(ctx.role).toBe("owner");

    // Logout revokes the token.
    await logoutRoute(jsonRequest("/api/auth/logout", "POST", undefined, { authorization: `Bearer ${token}` }));
    const after = await authenticateSync(jsonRequest("/api/sync/pull", "GET", undefined, { authorization: `Bearer ${token}` }));
    expect(after).toBeInstanceOf(Response);
  });

  test("a token cannot select a farm the user is not a member of", async () => {
    const a = await registerUser("a@farm.dev");
    const b = await registerUser("b@farm.dev");

    const denied = await authenticateSync(
      jsonRequest("/api/sync/pull", "GET", undefined, {
        authorization: `Bearer ${a.token}`,
        "x-farm-id": b.farms[0].farmId,
      })
    );
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).status).toBe(403);
  });
});

describe("live membership refresh (/api/auth/me)", () => {
  test("a worker added after login sees the new farm on refresh, without re-login", async () => {
    const owner = await registerUser("boss2@farm.dev");
    const worker = await registerUser("hand2@farm.dev");
    const farmId = owner.farms[0].farmId;

    // At login time the worker only knows their own farm.
    expect(worker.farms).toHaveLength(1);

    // Owner adds them afterwards — the worker's OLD token now sees both.
    await membersPost(
      jsonRequest("/api/farm/members", "POST", { email: "hand2@farm.dev", role: "worker" },
        { authorization: `Bearer ${owner.token}`, "x-farm-id": farmId })
    );
    const me = await meRoute(jsonRequest("/api/auth/me", "GET", undefined, { authorization: `Bearer ${worker.token}` }));
    expect(me.status).toBe(200);
    const { farms } = (await me.json()) as { farms: { farmId: string; role: string }[] };
    expect(farms).toHaveLength(2);
    expect(farms).toContainEqual(expect.objectContaining({ farmId, role: "worker" }));
  });

  test("rejects a bad token", async () => {
    const res = await meRoute(jsonRequest("/api/auth/me", "GET", undefined, { authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
  });
});

describe("member management", () => {
  test("owner adds a registered worker, worker cannot manage members, owner removes them", async () => {
    const owner = await registerUser("boss@farm.dev");
    const worker = await registerUser("hand@farm.dev");
    const farmId = owner.farms[0].farmId;
    const ownerHeaders = { authorization: `Bearer ${owner.token}`, "x-farm-id": farmId };

    // Unknown email → 404, nothing added.
    const missing = await membersPost(jsonRequest("/api/farm/members", "POST", { email: "ghost@farm.dev" }, ownerHeaders));
    expect(missing.status).toBe(404);

    const added = await membersPost(jsonRequest("/api/farm/members", "POST", { email: "hand@farm.dev", role: "worker" }, ownerHeaders));
    expect(added.status).toBe(200);

    // The worker now syncs this farm — but with worker powers only.
    const workerCtx = await authenticateSync(
      jsonRequest("/api/sync/pull", "GET", undefined, { authorization: `Bearer ${worker.token}`, "x-farm-id": farmId })
    );
    expect(workerCtx).not.toBeInstanceOf(Response);
    if (workerCtx instanceof Response) return;
    expect(workerCtx.role).toBe("worker");

    // Worker cannot list/manage members.
    const deniedList = await membersGet(
      jsonRequest("/api/farm/members", "GET", undefined, { authorization: `Bearer ${worker.token}`, "x-farm-id": farmId })
    );
    expect(deniedList.status).toBe(403);

    // Owner sees both members, then removes the worker.
    const list = await membersGet(jsonRequest("/api/farm/members", "GET", undefined, ownerHeaders));
    const { members } = (await list.json()) as { members: { email: string }[] };
    expect(members.map((m) => m.email).sort()).toEqual(["boss@farm.dev", "hand@farm.dev"]);

    const workerUser = await prisma.user.findUniqueOrThrow({ where: { email: "hand@farm.dev" } });
    const removed = await membersDelete(jsonRequest("/api/farm/members", "DELETE", { userId: workerUser.id }, ownerHeaders));
    expect(removed.status).toBe(200);

    // The sole owner cannot remove themselves.
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: "boss@farm.dev" } });
    const selfRemove = await membersDelete(jsonRequest("/api/farm/members", "DELETE", { userId: ownerUser.id }, ownerHeaders));
    expect(selfRemove.status).toBe(400);
  });
});
