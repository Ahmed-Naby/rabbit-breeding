// Seed script: a small, realistic herd across three generations plus breeding,
// litter, weight, health and finance data. Run with `npm run db:seed`.
// Uses relative imports (not the @/ alias) so it runs cleanly under tsx.
import "dotenv/config";
import { DEFAULT_FARM_ID } from "../src/lib/tenant";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);
/** yyyy-mm-dd at UTC midnight, for birthdays that shouldn't drift by TZ. */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const GESTATION = 31;
const addDays = (date: Date, n: number) => new Date(date.getTime() + n * DAY);

async function main() {
  console.log("Clearing existing data…");
  // Order matters for FK constraints.
  await prisma.transaction.deleteMany();
  await prisma.weightRecord.deleteMany();
  await prisma.healthRecord.deleteMany();
  await prisma.litter.deleteMany();
  await prisma.breeding.deleteMany();
  await prisma.rabbit.deleteMany();
  await prisma.settings.deleteMany({ where: { farmId: DEFAULT_FARM_ID } });

  console.log("Seeding settings…");
  await prisma.settings.create({
    data: { farmId: DEFAULT_FARM_ID, weightUnit: "kg", gestationDays: GESTATION, currency: "USD" },
  });

  console.log("Seeding foundation stock…");
  // --- Generation 1: acquired foundation stock (no known parents) ---
  const thor = await prisma.rabbit.create({
    data: {
      tagId: "1",
      breed: "New Zealand White",
      color: "White",
      sex: "buck",
      status: "active",
      cage: "A1",
      dateOfBirth: utc(2023, 3, 12),
      acquiredDate: utc(2023, 6, 1),
      acquiredFrom: "Maple Ridge Rabbitry",
      notes: "Proven herd buck. Calm temperament.",
    },
  });
  const freya = await prisma.rabbit.create({
    data: {
      tagId: "2",
      breed: "New Zealand White",
      color: "White",
      sex: "doe",
      status: "active",
      cage: "A2",
      dateOfBirth: utc(2023, 4, 2),
      acquiredDate: utc(2023, 6, 1),
      acquiredFrom: "Maple Ridge Rabbitry",
    },
  });
  const loki = await prisma.rabbit.create({
    data: {
      tagId: "3",
      breed: "Californian",
      color: "White w/ points",
      sex: "buck",
      status: "active",
      cage: "B1",
      dateOfBirth: utc(2023, 2, 20),
      acquiredDate: utc(2023, 7, 15),
      acquiredFrom: "Hillside Farm",
    },
  });
  const sif = await prisma.rabbit.create({
    data: {
      tagId: "4",
      breed: "Californian",
      color: "White w/ points",
      sex: "doe",
      status: "active",
      cage: "B2",
      dateOfBirth: utc(2023, 5, 8),
      acquiredDate: utc(2023, 7, 15),
      acquiredFrom: "Hillside Farm",
    },
  });

  console.log("Seeding breedings & litters…");
  // --- Breeding 1: Thor x Freya, ~5 months ago, successful ---
  const b1Mating = daysAgo(150);
  const b1 = await prisma.breeding.create({
    data: {
      buckId: thor.id,
      doeId: freya.id,
      matingDate: b1Mating,
      expectedKindlingDate: addDays(b1Mating, GESTATION),
      actualKindlingDate: addDays(b1Mating, 30),
      outcome: "successful",
      notes: "Large, healthy litter.",
    },
  });
  const l1 = await prisma.litter.create({
    data: {
      breedingId: b1.id,
      kindlingDate: addDays(b1Mating, 30),
      bornAlive: 8,
      bornDead: 1,
      weaned: 7,
      weaningDate: addDays(b1Mating, 30 + 42),
    },
  });

  // Two kits from litter 1 were kept & tagged -> full Rabbit records.
  const odin = await prisma.rabbit.create({
    data: {
      tagId: "5",
      breed: "New Zealand White",
      color: "White",
      sex: "buck",
      status: "active",
      cage: "C1",
      dateOfBirth: l1.kindlingDate,
      sireId: thor.id,
      damId: freya.id,
      litterId: l1.id,
      notes: "Kept as replacement buck. Excellent growth rate.",
    },
  });
  const frigg = await prisma.rabbit.create({
    data: {
      tagId: "6",
      breed: "New Zealand White",
      color: "White",
      sex: "doe",
      status: "active",
      cage: "C2",
      dateOfBirth: l1.kindlingDate,
      sireId: thor.id,
      damId: freya.id,
      litterId: l1.id,
    },
  });

  // --- Breeding 2: Loki x Sif, ~4 months ago, successful ---
  const b2Mating = daysAgo(120);
  const b2 = await prisma.breeding.create({
    data: {
      buckId: loki.id,
      doeId: sif.id,
      matingDate: b2Mating,
      expectedKindlingDate: addDays(b2Mating, GESTATION),
      actualKindlingDate: addDays(b2Mating, 31),
      outcome: "successful",
    },
  });
  const l2 = await prisma.litter.create({
    data: {
      breedingId: b2.id,
      kindlingDate: addDays(b2Mating, 31),
      bornAlive: 6,
      bornDead: 0,
      weaned: 6,
      weaningDate: addDays(b2Mating, 31 + 42),
    },
  });
  const baldr = await prisma.rabbit.create({
    data: {
      tagId: "7",
      breed: "Californian",
      color: "White w/ points",
      sex: "buck",
      status: "active",
      cage: "C3",
      dateOfBirth: l2.kindlingDate,
      sireId: loki.id,
      damId: sif.id,
      litterId: l2.id,
    },
  });

  // --- Breeding 3: Thor x Sif (crossbred), ~5.5 months ago, successful ---
  const b3Mating = daysAgo(165);
  const b3 = await prisma.breeding.create({
    data: {
      buckId: thor.id,
      doeId: sif.id,
      matingDate: b3Mating,
      expectedKindlingDate: addDays(b3Mating, GESTATION),
      actualKindlingDate: addDays(b3Mating, 32),
      outcome: "successful",
      notes: "Meat-cross litter.",
    },
  });
  const l3 = await prisma.litter.create({
    data: {
      breedingId: b3.id,
      kindlingDate: addDays(b3Mating, 32),
      bornAlive: 9,
      bornDead: 2,
      weaned: 8,
      weaningDate: addDays(b3Mating, 32 + 42),
    },
  });
  // A grow-out that was sold.
  await prisma.rabbit.create({
    data: {
      tagId: "8",
      breed: "NZW x Californian",
      color: "White",
      sex: "buck",
      status: "sold",
      dateOfBirth: l3.kindlingDate,
      sireId: thor.id,
      damId: sif.id,
      litterId: l3.id,
      notes: "Sold as breeding stock.",
    },
  });

  // --- Breeding 4: Odin x Nanna(=Sif line via Baldr)… use Frigg's line safely:
  // Odin x Sif is fine genetically here for demo. Mating 12 days ago -> PENDING,
  // expected kindling ~19 days out (shows on "upcoming" dashboard).
  const b4Mating = daysAgo(12);
  await prisma.breeding.create({
    data: {
      buckId: odin.id,
      doeId: sif.id,
      matingDate: b4Mating,
      expectedKindlingDate: addDays(b4Mating, GESTATION),
      outcome: "pending",
      notes: "Palpated at 10 days — feels pregnant.",
    },
  });

  // --- Breeding 5: Loki x Freya, mating 35 days ago, still pending ->
  // expected kindling was ~4 days ago = OVERDUE (dashboard alert). ---
  const b5Mating = daysAgo(35);
  await prisma.breeding.create({
    data: {
      buckId: loki.id,
      doeId: freya.id,
      matingDate: b5Mating,
      expectedKindlingDate: addDays(b5Mating, GESTATION),
      outcome: "pending",
      notes: "No nest box activity yet — check doe.",
    },
  });

  // --- Breeding 6: Thor x Frigg attempt that didn't take ---
  const b6Mating = daysAgo(60);
  await prisma.breeding.create({
    data: {
      buckId: baldr.id,
      doeId: frigg.id,
      matingDate: b6Mating,
      expectedKindlingDate: addDays(b6Mating, GESTATION),
      outcome: "not_pregnant",
      notes: "Re-bred later.",
    },
  });

  console.log("Seeding weight records (growth curve for Odin)…");
  // Odin weight series from birth-ish to now (grams).
  const odinWeights: Array<[number, number]> = [
    [l1DaysSinceBirth(odin.dateOfBirth!, 7), 180],
    [l1DaysSinceBirth(odin.dateOfBirth!, 21), 520],
    [l1DaysSinceBirth(odin.dateOfBirth!, 35), 1050],
    [l1DaysSinceBirth(odin.dateOfBirth!, 56), 2100],
    [l1DaysSinceBirth(odin.dateOfBirth!, 84), 3200],
    [l1DaysSinceBirth(odin.dateOfBirth!, 120), 4100],
  ];
  for (const [daysAfterBirth, grams] of odinWeights) {
    await prisma.weightRecord.create({
      data: {
        rabbitId: odin.id,
        date: addDays(odin.dateOfBirth!, daysAfterBirth),
        weightGrams: grams,
      },
    });
  }
  // A recent weight for Thor and Freya.
  await prisma.weightRecord.create({
    data: { rabbitId: thor.id, date: daysAgo(5), weightGrams: 4800 },
  });
  await prisma.weightRecord.create({
    data: { rabbitId: freya.id, date: daysAgo(5), weightGrams: 4550 },
  });

  console.log("Seeding health records…");
  // Overdue deworming for Freya.
  await prisma.healthRecord.create({
    data: {
      rabbitId: freya.id,
      date: daysAgo(95),
      type: "deworming",
      description: "Ivermectin dose. Repeat quarterly.",
      nextDueDate: daysAgo(5), // overdue
    },
  });
  // Upcoming checkup for Thor.
  await prisma.healthRecord.create({
    data: {
      rabbitId: thor.id,
      date: daysAgo(20),
      type: "checkup",
      description: "Routine soundness check — all good.",
      nextDueDate: daysFromNow(4), // upcoming
    },
  });
  // Past illness, resolved.
  await prisma.healthRecord.create({
    data: {
      rabbitId: sif.id,
      date: daysAgo(40),
      type: "illness",
      description: "Mild snuffles — treated with antibiotics, resolved.",
    },
  });

  console.log("Seeding finance & feed…");
  await prisma.transaction.create({
    data: {
      rabbitId: thor.id,
      date: utc(2023, 6, 1),
      type: "expense",
      category: "purchase",
      amountCents: 6000,
      notes: "Purchased Thor (foundation buck).",
    },
  });
  await prisma.transaction.create({
    data: {
      date: daysAgo(70),
      type: "income",
      category: "sale",
      amountCents: 4500,
      notes: "Sold Vidar as breeding stock.",
    },
  });
  await prisma.transaction.create({
    data: {
      date: daysAgo(15),
      type: "expense",
      category: "feed",
      amountCents: 3200,
      notes: "50 lb bag pellets.",
    },
  });
  await prisma.transaction.create({
    data: {
      date: daysAgo(40),
      type: "expense",
      category: "vet",
      amountCents: 2500,
      notes: "Antibiotics for Sif.",
    },
  });
  await prisma.transaction.create({
    data: {
      date: daysAgo(90),
      type: "expense",
      category: "equipment",
      amountCents: 8000,
      notes: "Two nest boxes + water bottles.",
    },
  });

  console.log("✅ Seed complete.");
}

/** Simple helper: number of days is passed straight through (kept for readability). */
function l1DaysSinceBirth(_birth: Date, days: number): number {
  return days;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
