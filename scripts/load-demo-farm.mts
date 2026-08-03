/**
 * Loads a file produced by scripts/generate-demo-farm.mts into a DEDICATED
 * demo farm, then prints the DEFAULT_FARM_ID line to switch the app over to it.
 *
 * Why not /api/sync/full-import (the «استعادة» button)? Because that route
 * imports into whatever farm the caller is authenticated for, and wipes it
 * first — pointing it at the real farm would delete a year of actual records to
 * make room for fake ones. This script never touches any farm but its own:
 * everything is inserted with an explicit farmId, and the only delete it issues
 * is scoped to that same id.
 *
 * Usage:
 *   npx tsx scripts/generate-demo-farm.mts demo-farm.json
 *   npx tsx scripts/load-demo-farm.mts demo-farm.json
 *   # then put the printed line in .env.local and restart `npm run dev`
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const IN_FILE = args.find((a) => !a.startsWith("--")) ?? "demo-farm.json";
/** Fixed and distinct from DEFAULT_FARM_ID ("farm_default_000000000001"). */
const DEMO_FARM_ID = flag("farm") ?? "farm_demo_00000000000001";
/** Two simulated farms can live side by side, so each needs its own name. */
const DEMO_FARM_NAME = flag("name") ?? "مزرعة تجريبية (بيانات محاكاة)";

type Row = Record<string, unknown>;
type Data = Record<string, Row[]> & { settings: Row };

/** Dates arrive as ISO strings from JSON; Prisma wants Date objects. */
const DATE_KEY = /Date$|^date$|^createdAt$|^updatedAt$/;
const revive = (rows: Row[], farmId: string) =>
  rows.map((row) => {
    const out: Row = { farmId };
    for (const [key, value] of Object.entries(row)) {
      out[key] = DATE_KEY.test(key) && typeof value === "string" ? new Date(value) : value;
    }
    return out;
  });

async function main() {
  const data = JSON.parse(readFileSync(IN_FILE, "utf8")) as Data;
  if (!Array.isArray(data.rabbits)) throw new Error(`${IN_FILE} is not a demo-farm file`);

  const farm = await prisma.farm.upsert({
    where: { id: DEMO_FARM_ID },
    update: { name: DEMO_FARM_NAME },
    create: { id: DEMO_FARM_ID, name: DEMO_FARM_NAME, location: "بيانات محاكاة" },
  });
  console.log(`Farm: ${farm.name} (${farm.id})`);

  type Insertable = { createMany(args: { data: Row[] }): Promise<{ count: number }> };

  // The whole reload is ONE transaction, so no reader ever sees a half-loaded
  // farm. Without it the app briefly showed «إجمالي المباع» larger than
  // «إجمالي الفطام» and a negative «المخزون المتاح» — every KitStockMovement
  // was in while the WeaningLog rows they draw down were still being written.
  //
  // Worth stressing that this is a property of THIS script, not of the app: the
  // stock invariant is enforced on every real write path (recordKitSale,
  // recordWeanedKitDeath, adjustStock, and the mobile equivalents all refuse a
  // count that would drive availableStock below zero). createMany goes straight
  // to the table and past all of it, which is exactly why the seeding order has
  // to be right by construction here.
  console.log("Loading (single transaction)…");
  await prisma.$transaction(
    async (tx) => {
      // Reload-safe: clears only this farm. Children first — the raw client has
      // no tenant extension, so every filter here is explicit.
      const where = { farmId: DEMO_FARM_ID };
      await tx.kitDeathLog.deleteMany({ where });
      await tx.fosterLog.deleteMany({ where });
      await tx.resorptionLog.deleteMany({ where });
      await tx.matingLog.deleteMany({ where });
      await tx.nestBoxLog.deleteMany({ where });
      await tx.weaningLog.deleteMany({ where });
      await tx.kindlingLog.deleteMany({ where });
      await tx.pregnancyTestLog.deleteMany({ where });
      await tx.kitStockMovement.deleteMany({ where });
      await tx.transaction.deleteMany({ where });
      await tx.healthRecord.deleteMany({ where });
      await tx.weightRecord.deleteMany({ where });
      await tx.litter.deleteMany({ where });
      await tx.breeding.deleteMany({ where });
      await tx.rabbit.deleteMany({ where });
      await tx.breed.deleteMany({ where });

      // Stamping dataResetAt is not optional bookkeeping — it is what makes a
      // reload safe for anything that has already synced this farm.
      //
      // Every row above is deleted straight through deleteMany, which writes no
      // SyncTombstone, and every row below gets a brand-new id. A device that
      // had already mirrored the previous load therefore keeps its old copy AND
      // receives the new one, so its archives silently DOUBLE: the herd tab read
      // 12.5 cycles per doe per year against a target of 8 (157%!) because 622
      // kindlings — the same 311 twice — were divided by the 200 does the device
      // still had from the first load. Every per-doe average on the tab was
      // exactly 2x, and nothing about the numbers said "duplicate".
      //
      // A fresh dataResetAt is the mechanism the sync layer already has for
      // exactly this: pull() compares it against the one the device last saw and,
      // when it moves, wipes the local mirror and re-bootstraps instead of
      // merging a delta (see src/mobile/sync/sync-manager.ts).
      await tx.settings.upsert({
        where: { farmId: DEMO_FARM_ID },
        update: { ...data.settings, dataResetAt: new Date() },
        create: { ...data.settings, farmId: DEMO_FARM_ID, dataResetAt: new Date() },
      });

      // Parent → child, so no FK is ever pointed at a row that isn't in yet.
      // weaningLogs come BEFORE kitStockMovements for a second reason that no
      // FK enforces: a sale/death/retained movement is a withdrawal from the
      // weaned stock, so the weanings it draws on have to exist first for the
      // balance to be non-negative at every point of the load.
      const order: [string, Insertable][] = [
        ["breeds", tx.breed],
        ["rabbits", tx.rabbit],
        ["breedings", tx.breeding],
        ["litters", tx.litter],
        ["weightRecords", tx.weightRecord],
        ["healthRecords", tx.healthRecord],
        ["pregnancyTestLogs", tx.pregnancyTestLog],
        ["kindlingLogs", tx.kindlingLog],
        ["weaningLogs", tx.weaningLog],
        ["transactions", tx.transaction],
        ["kitStockMovements", tx.kitStockMovement],
        ["nestBoxLogs", tx.nestBoxLog],
        ["matingLogs", tx.matingLog],
        ["resorptionLogs", tx.resorptionLog],
        ["fosterLogs", tx.fosterLog],
        ["kitDeathLogs", tx.kitDeathLog],
      ] as unknown as [string, Insertable][];

      for (const [key, model] of order) {
        const rows = revive(data[key] ?? [], DEMO_FARM_ID);
        if (rows.length === 0) continue;
        // Chunked: a single createMany of ~40k rows exceeds the driver's
        // bind-param limit, and the failure looks nothing like "too many rows".
        let inserted = 0;
        for (let i = 0; i < rows.length; i += 2_000) {
          const { count } = await model.createMany({ data: rows.slice(i, i + 2_000) });
          inserted += count;
        }
        console.log(`  ${key.padEnd(20)} ${inserted}`);
      }
    },
    // Prisma's 5s default kills a load this size mid-way. maxWait is the queue
    // for a free connection, timeout the transaction's own budget.
    { maxWait: 60_000, timeout: 600_000 }
  );

  // Make the demo farm reachable from inside the app. The mobile/desktop
  // client picks its farm from the account's memberships (see
  // src/app/api/sync/auth.ts), and gives each farm its OWN local database —
  // so switching to the demo farm downloads it into a separate mirror and
  // cannot disturb the real farm's local copy.
  const memberEmail = flag("member");
  const users = await prisma.user.findMany({
    where: memberEmail ? { email: memberEmail } : undefined,
    select: { id: true, email: true },
  });
  for (const user of users) {
    await prisma.farmMember.upsert({
      where: { farmId_userId: { farmId: DEMO_FARM_ID, userId: user.id } },
      update: { role: "owner" },
      create: { farmId: DEMO_FARM_ID, userId: user.id, role: "owner" },
    });
    console.log(`  member: ${user.email} (owner)`);
  }

  console.log(`
Done.

In the mobile/desktop app: الإعدادات → الحساب → قائمة المزرعة → "${DEMO_FARM_NAME}".
Each farm keeps its own local database, so this does not touch your real farm.

On the web app (localhost:3000), which has no farm picker, set this in
.env.local instead and restart the dev server:

  DEFAULT_FARM_ID="${DEMO_FARM_ID}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
