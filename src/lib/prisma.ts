import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { currentFarmId } from "./tenant";

// Prisma 7 uses driver adapters: the DB connection is passed to the client
// constructor rather than read from the schema. DATABASE_URL (Neon, pooled)
// comes from .env / Vercel project env vars.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Every farm-data model carrying a farmId column. Settings is deliberately
// absent — it's keyed BY farmId, and its few call sites address it
// explicitly (see settings.ts). Auth/sync bookkeeping models are global.
const TENANT_MODELS = new Set([
  "Rabbit", "Breeding", "Litter", "WeightRecord", "HealthRecord",
  "Transaction", "KitStockMovement", "Breed", "PregnancyTestLog",
  "KindlingLog", "FosterLog",
]);

// Operations whose `where` receives the farm filter. findUnique/update/
// delete/upsert are keyed by primary id (unguessable cuids that only ever
// come out of already-scoped reads) and keep Prisma's unique-where typing.
const WHERE_OPS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "count", "aggregate",
  "groupBy", "updateMany", "deleteMany",
]);

function makeClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          /* eslint-disable @typescript-eslint/no-explicit-any */
          const a = args as any;
          if (WHERE_OPS.has(operation)) {
            a.where = { AND: [{ farmId: currentFarmId() }, a.where ?? {}] };
          } else if (operation === "create") {
            a.data = { ...a.data, farmId: currentFarmId() };
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            const farmId = currentFarmId();
            a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d: object) => ({ ...d, farmId }));
          } else if (operation === "upsert") {
            a.create = { ...a.create, farmId: currentFarmId() };
          }
          /* eslint-enable @typescript-eslint/no-explicit-any */
          return query(a);
        },
      },
    },
  });
}

// Reuse a single PrismaClient across hot-reloads in dev to avoid exhausting
// connections. In production a single instance is created per server process.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof makeClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
