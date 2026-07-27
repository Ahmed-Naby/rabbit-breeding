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
const DEMO_FARM_NAME = "مزرعة تجريبية (بيانات محاكاة)";

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

  // Reload-safe: clears only this farm. Children first — the raw client has no
  // tenant extension, so every filter here is explicit.
  console.log("Clearing the demo farm…");
  const where = { farmId: DEMO_FARM_ID };
  await prisma.$transaction([
    prisma.kitDeathLog.deleteMany({ where }),
    prisma.fosterLog.deleteMany({ where }),
    prisma.resorptionLog.deleteMany({ where }),
    prisma.matingLog.deleteMany({ where }),
    prisma.nestBoxLog.deleteMany({ where }),
    prisma.weaningLog.deleteMany({ where }),
    prisma.kindlingLog.deleteMany({ where }),
    prisma.pregnancyTestLog.deleteMany({ where }),
    prisma.kitStockMovement.deleteMany({ where }),
    prisma.transaction.deleteMany({ where }),
    prisma.healthRecord.deleteMany({ where }),
    prisma.weightRecord.deleteMany({ where }),
    prisma.litter.deleteMany({ where }),
    prisma.breeding.deleteMany({ where }),
    prisma.rabbit.deleteMany({ where }),
    prisma.breed.deleteMany({ where }),
  ]);

  await prisma.settings.upsert({
    where: { farmId: DEMO_FARM_ID },
    update: data.settings,
    create: { ...data.settings, farmId: DEMO_FARM_ID },
  });

  // Parent → child, so no FK is ever pointed at a row that isn't in yet.
  type Insertable = { createMany(args: { data: Row[] }): Promise<{ count: number }> };
  const order: [string, Insertable][] = [
    ["breeds", prisma.breed],
    ["rabbits", prisma.rabbit],
    ["breedings", prisma.breeding],
    ["litters", prisma.litter],
    ["weightRecords", prisma.weightRecord],
    ["healthRecords", prisma.healthRecord],
    ["transactions", prisma.transaction],
    ["kitStockMovements", prisma.kitStockMovement],
    ["pregnancyTestLogs", prisma.pregnancyTestLog],
    ["kindlingLogs", prisma.kindlingLog],
    ["weaningLogs", prisma.weaningLog],
    ["nestBoxLogs", prisma.nestBoxLog],
    ["matingLogs", prisma.matingLog],
    ["resorptionLogs", prisma.resorptionLog],
    ["fosterLogs", prisma.fosterLog],
    ["kitDeathLogs", prisma.kitDeathLog],
  ] as unknown as [string, Insertable][];

  for (const [key, model] of order) {
    const rows = revive(data[key] ?? [], DEMO_FARM_ID);
    if (rows.length === 0) continue;
    // Chunked: a single createMany of ~40k rows exceeds the driver's bind-param
    // limit, and the failure looks nothing like "too many rows".
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 2_000) {
      const { count } = await model.createMany({ data: rows.slice(i, i + 2_000) });
      inserted += count;
    }
    console.log(`  ${key.padEnd(20)} ${inserted}`);
  }

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
