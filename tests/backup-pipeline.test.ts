import { describe, test, expect, beforeEach } from "vitest";
import { resetDb, prisma, TEST_FARM_ID } from "./db";
import { runFullImport, type FullExportData } from "@/lib/sync/import";
import { runWipe } from "@/lib/sync/wipe";
import { runPull } from "@/lib/sync/pull";

beforeEach(resetDb);

const now = new Date().toISOString();

function rabbit(id: string, tagId: string | null, sex: "doe" | "buck"): FullExportData["rabbits"][number] {
  return {
    id, tagId, retiredTagId: null, breed: null, color: null, sex, dateOfBirth: null,
    status: "active", doeState: "empty", cage: null, origin: "farm", movedToHerdPen: false,
    acquiredDate: now, acquiredFrom: null, notes: null, photoUrl: null,
    sireId: null, damId: null, litterId: null, createdAt: now, updatedAt: now,
  };
}

function emptySnapshot(): FullExportData {
  return {
    settings: null, rabbits: [], breedings: [], litters: [], weightRecords: [],
    healthRecords: [], transactions: [], kitStockMovements: [], breeds: [],
    pregnancyTestLogs: [], kindlingLogs: [], weaningLogs: [], fosterLogs: [],
  };
}

describe("runFullImport", () => {
  test("replaces existing data and stamps a fresh dataResetAt", async () => {
    await prisma.rabbit.create({ data: { tagId: "old", sex: "doe" } });
    const before = new Date();

    const snapshot = emptySnapshot();
    snapshot.rabbits = [rabbit("r1", "1", "doe")];
    const { dataResetAt } = await runFullImport(snapshot);

    const rabbits = await prisma.rabbit.findMany();
    expect(rabbits.map((r) => r.id)).toEqual(["r1"]);
    expect(new Date(dataResetAt).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    const settings = await prisma.settings.findUniqueOrThrow({ where: { farmId: TEST_FARM_ID } });
    expect(settings.dataResetAt?.toISOString()).toBe(dataResetAt);
  });

  test("a dirty snapshot degrades to skipped rows, never a failed restore", async () => {
    const snapshot = emptySnapshot();
    snapshot.rabbits = [
      rabbit("r1", "100", "doe"),
      rabbit("r2", "100", "doe"), // duplicate tag+sex — one must survive
    ];
    snapshot.breedings = [
      { id: "b1", buckId: "ghost-buck", doeId: "r1", matingDate: now, expectedKindlingDate: now,
        actualKindlingDate: null, nestBoxDate: null, outcome: "pending", pregnancyTestResult: "pending",
        notes: null, createdAt: now, updatedAt: now },
      { id: "b2", buckId: null, doeId: "ghost-doe", matingDate: now, expectedKindlingDate: now,
        actualKindlingDate: null, nestBoxDate: null, outcome: "pending", pregnancyTestResult: "pending",
        notes: null, createdAt: now, updatedAt: now },
    ];
    snapshot.litters = [
      { id: "l1", breedingId: "b1", kindlingDate: now, bornAlive: 8, bornDead: 0, weaned: 6,
        weaningDate: null, weaningWeightGrams: null, notes: null, createdAt: now, updatedAt: now },
      { id: "l2", breedingId: "b2", kindlingDate: now, bornAlive: 3, bornDead: 0, weaned: null,
        weaningDate: null, weaningWeightGrams: null, notes: null, createdAt: now, updatedAt: now },
    ];
    snapshot.weightRecords = [
      { id: "w1", rabbitId: "r1", date: now, weightGrams: 3000, notes: null, createdAt: now, updatedAt: now },
      { id: "w2", rabbitId: "GHOST", date: now, weightGrams: 999, notes: null, createdAt: now, updatedAt: now },
    ];
    snapshot.breeds = [
      { id: "br1", name: "نيوزلندي", createdAt: now },
      { id: "br2", name: "نيوزلندي", createdAt: now },
    ];

    await runFullImport(snapshot);

    expect(await prisma.rabbit.count()).toBe(1);
    // b1 survives with its ghost buck reference cleared; b2's doe never
    // existed, so it and its litter are dropped together.
    const breedings = await prisma.breeding.findMany();
    expect(breedings.map((b) => b.id)).toEqual(["b1"]);
    expect(breedings[0].buckId).toBeNull();
    expect((await prisma.litter.findMany()).map((l) => l.id)).toEqual(["l1"]);
    expect((await prisma.weightRecord.findMany()).map((w) => w.id)).toEqual(["w1"]);
    expect(await prisma.breed.count()).toBe(1);
  });

  test("restores pedigree references between imported rabbits", async () => {
    const snapshot = emptySnapshot();
    const dam = rabbit("dam", "1", "doe");
    const kit = { ...rabbit("kit", null, "doe"), damId: "dam", sireId: "vanished-sire" };
    snapshot.rabbits = [dam, kit];

    await runFullImport(snapshot);
    const imported = await prisma.rabbit.findUniqueOrThrow({ where: { id: "kit" } });
    expect(imported.damId).toBe("dam");
    expect(imported.sireId).toBeNull();
  });
});

describe("runWipe", () => {
  test("empties every farm table and stamps dataResetAt so devices re-bootstrap", async () => {
    await prisma.rabbit.create({ data: { tagId: "1", sex: "doe" } });
    await prisma.breed.create({ data: { name: "نيوزلندي" } });

    const { dataResetAt } = await runWipe();

    expect(await prisma.rabbit.count()).toBe(0);
    expect(await prisma.breed.count()).toBe(0);
    const settings = await prisma.settings.findUniqueOrThrow({ where: { farmId: TEST_FARM_ID } });
    expect(settings.dataResetAt?.toISOString()).toBe(dataResetAt);
  });
});

describe("runPull", () => {
  test("since-cursor filters mutable rows but always returns settings and breeds", async () => {
    await prisma.rabbit.create({ data: { tagId: "1", sex: "doe" } });
    await prisma.breed.create({ data: { name: "نيوزلندي" } });

    const fullPull = await runPull(new Date(0));
    expect(fullPull.rabbits).toHaveLength(1);

    const emptyDelta = await runPull(new Date(Date.now() + 60_000));
    expect(emptyDelta.rabbits).toHaveLength(0);
    expect(emptyDelta.settings).not.toBeNull();
    // Breeds are always sent in full — the client replaces its list wholesale.
    expect(emptyDelta.breeds).toHaveLength(1);
  });
});
