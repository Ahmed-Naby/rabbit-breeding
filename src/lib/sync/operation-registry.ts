/**
 * Maps a queued offline operation's `opType` string to the Phase-0
 * framework-agnostic *Op function that applies it. This is the server-side
 * replay path: /api/sync/push looks up an incoming operation's opType here
 * and dispatches to the exact same function the web Server Actions call, so
 * a mobile-queued "markKindled" runs through identical state-machine logic
 * (see breeding-ops.ts / rabbit-ops.ts) as a browser click does.
 *
 * Scope: only operations reachable from the offline-supported boards (does,
 * mating, pregnancy-test, nest-box, kindling, weaning, mortality, /stock
 * intake — see the sync plan). Not registered, deliberately:
 *  - transferKitsOp (fostering) — explicitly deferred, higher conflict-risk.
 *  - createBreedingOp/updateBreedingOp/createRabbitOp/createMotherOp/
 *    createBuckOp/finalizeMotherOp/finalizeBuckOp/updateRabbitOp/
 *    deleteRabbitOp — full desktop-style forms (add/edit breeding, rabbit
 *    detail/edit, mothers/bucks quick-add), out of scope for the offline app.
 *  - buckExistsOp — a read-only pre-flight check, not a mutating operation.
 */
import {
  markKindledOp,
  markWeanedOp,
  setLitterCountOp,
  setLitterWeaningWeightOp,
  recordNursingKitDeathOp,
  markMatingFailedOp,
  clearDoeRowOp,
  setMatingDateOp,
  recordKindlingOp,
  startBreedingOp,
  setBreedingOutcomeOp,
  setPregnancyTestResultOp,
  markMatedOp,
  confirmPregnantOp,
  installNestBoxOp,
  transferKitsOp,
} from "@/lib/breeding-ops";
import {
  setDoeStateOp,
  setRabbitStatusOp,
  createQuickRabbitOp,
  saveQuickRabbitCageOp,
  saveQuickRabbitWeightOp,
  promoteToHerdPenOp,
} from "@/lib/rabbit-ops";

export type SyncOpOutcome =
  | { status: "applied"; resultMessage?: string }
  | { status: "rejected"; resultMessage: string };

type SyncOpHandler = (payload: Record<string, unknown>) => Promise<SyncOpOutcome>;

const applied: SyncOpOutcome = { status: "applied" };

function fromOpResult(result: { ok: true; data: unknown } | { ok: false; code: unknown }): SyncOpOutcome {
  if (result.ok) return applied;
  return {
    status: "rejected",
    resultMessage: typeof result.code === "string" ? result.code : JSON.stringify(result.code),
  };
}

// Payload dates travel as ISO 8601 strings over JSON; every op below expects
// `Date` objects, matching how the web wrappers convert form input today.
function toDate(value: unknown): Date {
  return new Date(value as string);
}
function toDateOrNull(value: unknown): Date | null {
  return value == null ? null : new Date(value as string);
}

export const operationRegistry: Record<string, SyncOpHandler> = {
  startBreeding: async (p) => {
    await startBreedingOp(p.doeId as string, p.buckTagId as string | undefined, { id: p.id as string | undefined });
    return applied;
  },

  setBreedingOutcome: async (p) => {
    await setBreedingOutcomeOp(p.id as string, p.outcome as string);
    return applied;
  },

  setPregnancyTestResult: async (p) => {
    await setPregnancyTestResultOp(p.id as string, p.result as string);
    return applied;
  },

  markMated: async (p) => {
    await markMatedOp(p.breedingId as string, p.doeId as string, p.buckTagId as string | undefined, {
      id: p.id as string | undefined,
    });
    return applied;
  },

  confirmPregnant: async (p) => {
    await confirmPregnantOp(p.breedingId as string, p.doeId as string, p.target as string);
    return applied;
  },

  installNestBox: async (p) => {
    await installNestBoxOp(p.breedingId as string);
    return applied;
  },

  markKindled: async (p) => fromOpResult(await markKindledOp(p.breedingId as string, p.doeId as string)),

  markWeaned: async (p) => {
    await markWeanedOp(p.breedingId as string, p.doeId as string);
    return applied;
  },

  setLitterCount: async (p) =>
    fromOpResult(
      await setLitterCountOp(
        p.breedingId as string,
        p.field as "bornAlive" | "bornDead" | "weaned",
        p.value as number | null
      )
    ),

  setLitterWeaningWeight: async (p) =>
    fromOpResult(await setLitterWeaningWeightOp(p.breedingId as string, p.weaningWeightGrams as number | null)),

  recordNursingKitDeath: async (p) =>
    fromOpResult(await recordNursingKitDeathOp(p.breedingId as string, (p.count as number | undefined) ?? 1)),

  markMatingFailed: async (p) => {
    await markMatingFailedOp(p.breedingId as string, p.doeId as string);
    return applied;
  },

  clearDoeRow: async (p) => {
    await clearDoeRowOp(p.breedingId as string, p.doeId as string);
    return applied;
  },

  setMatingDate: async (p) => {
    await setMatingDateOp(p.breedingId as string, toDateOrNull(p.matingDate));
    return applied;
  },

  recordKindling: async (p) =>
    fromOpResult(
      await recordKindlingOp(p.breedingId as string, {
        kindlingDate: toDate(p.kindlingDate),
        bornAlive: p.bornAlive as number,
        bornDead: p.bornDead as number,
        weaned: (p.weaned as number | null) ?? null,
        weaningDate: toDateOrNull(p.weaningDate),
        notes: (p.notes as string | null) ?? null,
      })
    ),

  setDoeState: async (p) => {
    await setDoeStateOp(p.id as string, p.state as string);
    return applied;
  },

  setRabbitStatus: async (p) => {
    await setRabbitStatusOp(p.id as string, p.status as string);
    return applied;
  },

  createQuickRabbit: async (p) =>
    fromOpResult(
      await createQuickRabbitOp(
        {
          tagId: (p.tagId as string | null) ?? null,
          breed: (p.breed as string | null) ?? null,
          sex: p.sex as "doe" | "buck",
          date: toDate(p.date),
          weightKg: (p.weightKg as number | null) ?? null,
        },
        { id: p.id as string | undefined }
      )
    ),

  saveQuickRabbitCage: async (p) => {
    await saveQuickRabbitCageOp(p.id as string, p.cage as string);
    return applied;
  },

  saveQuickRabbitWeight: async (p) => {
    await saveQuickRabbitWeightOp(p.id as string, p.weightKg as number);
    return applied;
  },

  promoteToHerdPen: async (p) => fromOpResult(await promoteToHerdPenOp(p.id as string)),

  transferKits: async (p) =>
    fromOpResult(
      await transferKitsOp({
        fromTagId: p.fromTagId as string,
        toTagId: p.toTagId as string,
        count: p.count as number,
      })
    ),

  recordKitSale: async (p) => {
    const date = new Date(p.date as string);
    const weightGrams = p.weightGrams as number | null;
    const pricePerKgCents = p.pricePerKgCents as number | null;
    const amountCents = p.amountCents as number | null;

    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          id: p.transactionId as string | undefined,
          date,
          type: "income",
          category: "sale",
          amountCents: amountCents ?? 0,
          notes: (p.notes as string | null) ?? null,
        },
      });
      await tx.kitStockMovement.create({
        data: {
          id: p.id as string | undefined,
          date,
          type: "sale",
          count: p.count as number,
          weightGrams,
          pricePerKgCents,
          amountCents,
          transactionId: transaction.id,
          notes: (p.notes as string | null) ?? null,
        },
      });
    });
    return applied;
  },

  recordWeanedKitDeath: async (p) => {
    await prisma.kitStockMovement.create({
      data: {
        id: p.id as string | undefined,
        date: new Date(p.date as string),
        type: "death",
        count: p.count as number,
        notes: (p.notes as string | null) ?? null,
      },
    });
    return applied;
  },

  deleteKitStockMovement: async (p) => {
    await prisma.$transaction(async (tx) => {
      const movement = await tx.kitStockMovement.delete({ where: { id: p.id as string } });
      if (movement.transactionId) {
        await tx.transaction.delete({ where: { id: movement.transactionId } });
      }
    });
    return applied;
  },

  createHealthRecord: async (p) => {
    await prisma.healthRecord.create({
      data: {
        id: p.id as string | undefined,
        rabbitId: p.rabbitId as string,
        date: new Date(p.date as string),
        type: p.type as string,
        description: p.description as string,
        nextDueDate: p.nextDueDate ? new Date(p.nextDueDate as string) : null,
      },
    });
    return applied;
  },

  deleteHealthRecord: async (p) => {
    await prisma.healthRecord.delete({ where: { id: p.id as string } });
    return applied;
  },

  createTransaction: async (p) => {
    await prisma.transaction.create({
      data: {
        id: p.id as string | undefined,
        date: new Date(p.date as string),
        type: p.type as "income" | "expense",
        category: p.category as string,
        amountCents: p.amountCents as number,
        notes: (p.notes as string | null) ?? null,
      },
    });
    return applied;
  },

  deleteTransaction: async (p) => {
    await prisma.transaction.delete({ where: { id: p.id as string } });
    return applied;
  },

  updateSettings: async (p) => {
    const d = { ...p };
    delete d.id;
    await prisma.settings.upsert({
      where: { id: 1 },
      update: d,
      create: { id: 1, ...d } as any,
    });
    return applied;
  },

  addBreed: async (p) => {
    await prisma.breed.create({
      data: {
        id: p.id as string | undefined,
        name: p.name as string,
      },
    });
    return applied;
  },

  deleteBreed: async (p) => {
    await prisma.breed.delete({ where: { id: p.id as string } });
    return applied;
  },
};
