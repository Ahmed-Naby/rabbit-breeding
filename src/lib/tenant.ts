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
