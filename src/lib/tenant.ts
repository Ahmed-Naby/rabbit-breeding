import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Ambient farm context for a request. Every authenticated entry point (sync
 * routes, and later the web session layer) wraps its work in
 * runWithFarm(farmId, ...), and the Prisma extension in prisma.ts injects
 * that farmId into every tenant-model query automatically — so the 30+
 * business ops never mention farms at all and cannot forget to scope.
 *
 * globalThis-cached for the same reason prisma.ts caches its client: Next
 * dev's Fast Refresh can re-evaluate this module independently of prisma.ts
 * (whose cached client keeps its ORIGINAL import binding to whatever
 * instance existed when makeClient() first ran). Without this, a hot reload
 * splits the app onto two live AsyncLocalStorage instances — runWithFarm()
 * writes to the new one while the Prisma extension's stale closure still
 * reads the old, permanently-empty one — so every extension-injected query
 * silently falls through to the DEFAULT_FARM_ID fallback below while
 * explicit currentFarmId() call sites (which re-import fresh) keep working,
 * producing exactly the kind of split, hard-to-spot cross-farm data leak
 * this file's fallback comment warns never to allow.
 */
const globalForTenant = globalThis as unknown as {
  farmStorage: AsyncLocalStorage<{ farmId: string }> | undefined;
};

const storage = globalForTenant.farmStorage ?? new AsyncLocalStorage<{ farmId: string }>();

if (process.env.NODE_ENV !== "production") {
  globalForTenant.farmStorage = storage;
}

/** The farm all pre-tenancy data was backfilled into (see the multi_farm_tenancy migration). */
export const DEFAULT_FARM_ID = "farm_default_000000000001";

/**
 * Always async, and deliberately awaits fn() INSIDE the storage scope:
 * Prisma's query promises are lazy — `runWithFarm(id, () => prisma.x.find())`
 * would otherwise return the un-started promise and let it execute after the
 * scope closed, silently falling back to the default farm.
 */
export async function runWithFarm<T>(farmId: string, fn: () => T | Promise<T>): Promise<T> {
  return storage.run({ farmId }, async () => await fn());
}

/**
 * The active farm. Falls back to DEFAULT_FARM_ID via the DEFAULT_FARM_ID env
 * only for surfaces that predate per-request auth (the web app's Server
 * Components, the vitest suite) — authenticated API routes always run inside
 * runWithFarm and never hit the fallback. Throws rather than guessing when
 * neither is present: an unscoped tenant query must never silently span farms.
 */
export function currentFarmId(): string {
  const ctx = storage.getStore();
  if (ctx) return ctx.farmId;
  const fallback = process.env.DEFAULT_FARM_ID;
  if (fallback) return fallback;
  throw new Error("No farm context: wrap this call in runWithFarm() or set DEFAULT_FARM_ID");
}

/** Thrown when a browser reaches farm data with no session. Caught by the app shell. */
export class NoSessionError extends Error {
  constructor() {
    super("NO_SESSION");
    this.name = "NoSessionError";
  }
}

/**
 * The async form, and the one the Prisma extension uses.
 *
 * currentFarmId() cannot ask who is signed in: `cookies()` is async in Next 16
 * and this function is called from synchronous positions all over the sync
 * layer. Rather than make 29 call sites async, the split is by *who is
 * asking* — the sync API and the ops registry always run inside runWithFarm()
 * and keep the cheap synchronous path, while the web's Server Components and
 * Actions, which have no ALS scope, resolve through the session cookie here.
 *
 * Precedence is ALS first on purpose: a sync push authenticated as farm A must
 * never be re-pointed at farm B by a cookie that happens to be on the same
 * request.
 *
 * next/headers is imported dynamically to break the cycle
 * tenant -> web-session -> tokens -> prisma -> tenant, and to keep next/headers
 * out of the bundle for the seed scripts and the desktop build, which import
 * prisma but have no Next runtime at all.
 */
export async function resolveFarmId(): Promise<string> {
  const ctx = storage.getStore();
  if (ctx) return ctx.farmId;

  const { getFarmContext } = await import("./web-session");
  const farmCtx = await getFarmContext();
  if (farmCtx.kind === "session") return farmCtx.farmId;

  // Anonymous browser: no fallback. See the FarmContext doc comment — reading
  // DEFAULT_FARM_ID here is what served real farm data to the public.
  if (farmCtx.kind === "anonymous") throw new NoSessionError();

  const fallback = process.env.DEFAULT_FARM_ID;
  if (fallback) return fallback;
  throw new Error("No farm context: wrap this call in runWithFarm() or set DEFAULT_FARM_ID");
}
