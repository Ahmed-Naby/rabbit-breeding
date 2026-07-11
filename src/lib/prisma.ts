import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Prisma 7 uses driver adapters: the DB connection is passed to the client
// constructor rather than read from the schema. DATABASE_URL comes from .env
// (loaded automatically by Next.js). Swapping to Postgres later = swap this
// adapter for @prisma/adapter-pg and change the schema provider.
const connectionString = process.env.DATABASE_URL ?? "file:./dev.db";

// Reuse a single PrismaClient across hot-reloads in dev to avoid exhausting
// connections. In production a single instance is created per server process.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: connectionString }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
