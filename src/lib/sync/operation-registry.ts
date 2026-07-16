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
 * intake — see the sync plan) plus the mobile rabbit detail page's status
 * change and scoped field-edit. Not registered, deliberately:
 *  - createBreedingOp/updateBreedingOp/createRabbitOp/createMotherOp/
 *    createBuckOp/finalizeMotherOp/finalizeBuckOp/updateRabbitOp —
 *    full desktop-style forms (add/edit breeding, rabbit create, pedigree/
 *    tagId/sex/photo editing), out of scope for the offline app. The mobile
 *    detail page's edit form uses updateRabbitDetailsOp instead, a narrower
 *    field set (breed/color/cage/dateOfBirth/acquiredDate/acquiredFrom/notes).
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
  finalizeMotherOp,
  finalizeBuckOp,
  deleteRabbitOp,
  updateRabbitDetailsOp,
} from "@/lib/rabbit-ops";
import { prisma } from "@/lib/prisma";

export type SyncOpOutcome =
  | { status: "applied"; resultMessage?: string }
  | { status: "rejected"; resultMessage: string };

type SyncOpHandler = (payload: Record<string, unknown>, clientAt: Date) => Promise<SyncOpOutcome>;

const applied: SyncOpOutcome = { status: "applied" };

async function shouldSkipUpdate(
  modelName: "rabbit" | "breeding" | "litter" | "settings",
  id: string | number,
  clientAt: Date
): Promise<boolean> {
  const existing = await (prisma[modelName] as any).findUnique({
    where: { id },
    select: { updatedAt: true }
  });
  if (existing && existing.updatedAt && existing.updatedAt > clientAt) {
    console.log(`[Sync] Skipping ${modelName} ID ${id} update: server updatedAt (${existing.updatedAt.toISOString()}) is newer than clientAt (${clientAt.toISOString()})`);
    return true;
  }
  return false;
}

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
  startBreeding: async (p, clientAt) => {
    await startBreedingOp(p.doeId as string, p.buckTagId as string | undefined, { id: p.id as string | undefined });
    return applied;
  },

  setBreedingOutcome: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("breeding", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await setBreedingOutcomeOp(p.id as string, p.outcome as string);
    return applied;
  },

  setPregnancyTestResult: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("breeding", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await setPregnancyTestResultOp(p.id as string, p.result as string);
    return applied;
  },

  markMated: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await markMatedOp(p.breedingId as string, p.doeId as string, p.buckTagId as string | undefined, {
      id: p.id as string | undefined,
    });
    return applied;
  },

  confirmPregnant: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await confirmPregnantOp(p.breedingId as string, p.doeId as string, p.target as string);
    return applied;
  },

  installNestBox: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await installNestBoxOp(p.breedingId as string);
    return applied;
  },

  markKindled: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    return fromOpResult(await markKindledOp(p.breedingId as string, p.doeId as string));
  },

  markWeaned: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await markWeanedOp(p.breedingId as string, p.doeId as string);
    return applied;
  },

  setLitterCount: async (p, clientAt) => {
    if (p.breedingId) {
      const existingLitter = await prisma.litter.findUnique({
        where: { breedingId: p.breedingId as string },
        select: { updatedAt: true }
      });
      if (existingLitter && existingLitter.updatedAt > clientAt) {
        return { status: "applied", resultMessage: "Skipped: newer litter edit exists on server" };
      }
    }
    return fromOpResult(
      await setLitterCountOp(
        p.breedingId as string,
        p.field as "bornAlive" | "bornDead" | "weaned",
        p.value as number | null
      )
    );
  },

  setLitterWeaningWeight: async (p, clientAt) => {
    if (p.breedingId) {
      const existingLitter = await prisma.litter.findUnique({
        where: { breedingId: p.breedingId as string },
        select: { updatedAt: true }
      });
      if (existingLitter && existingLitter.updatedAt > clientAt) {
        return { status: "applied", resultMessage: "Skipped: newer litter edit exists on server" };
      }
    }
    return fromOpResult(await setLitterWeaningWeightOp(p.breedingId as string, p.weaningWeightGrams as number | null));
  },

  recordNursingKitDeath: async (p, clientAt) => {
    if (p.breedingId) {
      const existingLitter = await prisma.litter.findUnique({
        where: { breedingId: p.breedingId as string },
        select: { updatedAt: true }
      });
      if (existingLitter && existingLitter.updatedAt > clientAt) {
        return { status: "applied", resultMessage: "Skipped: newer litter edit exists on server" };
      }
    }
    return fromOpResult(await recordNursingKitDeathOp(p.breedingId as string, (p.count as number | undefined) ?? 1));
  },

  markMatingFailed: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await markMatingFailedOp(p.breedingId as string, p.doeId as string);
    return applied;
  },

  clearDoeRow: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await clearDoeRowOp(p.breedingId as string, p.doeId as string);
    return applied;
  },

  setMatingDate: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await setMatingDateOp(p.breedingId as string, toDateOrNull(p.matingDate));
    return applied;
  },

  recordKindling: async (p, clientAt) => {
    if (p.breedingId) {
      const existingLitter = await prisma.litter.findUnique({
        where: { breedingId: p.breedingId as string },
        select: { updatedAt: true }
      });
      if (existingLitter && existingLitter.updatedAt > clientAt) {
        return { status: "applied", resultMessage: "Skipped: newer litter edit exists on server" };
      }
    }
    return fromOpResult(
      await recordKindlingOp(p.breedingId as string, {
        kindlingDate: toDate(p.kindlingDate),
        bornAlive: p.bornAlive as number,
        bornDead: p.bornDead as number,
        weaned: (p.weaned as number | null) ?? null,
        weaningDate: toDateOrNull(p.weaningDate),
        notes: (p.notes as string | null) ?? null,
      })
    );
  },

  setDoeState: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("rabbit", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer rabbit edit exists on server" };
    }
    await setDoeStateOp(p.id as string, p.state as string);
    return applied;
  },

  setRabbitStatus: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("rabbit", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer rabbit edit exists on server" };
    }
    await setRabbitStatusOp(p.id as string, p.status as string);
    return applied;
  },

  updateRabbitDetails: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("rabbit", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer rabbit edit exists on server" };
    }
    await updateRabbitDetailsOp(p.id as string, {
      breed: (p.breed as string | null) ?? null,
      color: (p.color as string | null) ?? null,
      cage: (p.cage as string | null) ?? null,
      dateOfBirth: toDateOrNull(p.dateOfBirth),
      acquiredDate: toDateOrNull(p.acquiredDate),
      acquiredFrom: (p.acquiredFrom as string | null) ?? null,
      notes: (p.notes as string | null) ?? null,
    });
    return applied;
  },

  createQuickRabbit: async (p, clientAt) =>
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

  saveQuickRabbitCage: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("rabbit", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer rabbit edit exists on server" };
    }
    await saveQuickRabbitCageOp(p.id as string, p.cage as string);
    return applied;
  },

  saveQuickRabbitWeight: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("rabbit", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer rabbit edit exists on server" };
    }
    await saveQuickRabbitWeightOp(p.id as string, p.weightKg as number);
    return applied;
  },

  promoteToHerdPen: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("rabbit", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer rabbit edit exists on server" };
    }
    return fromOpResult(await promoteToHerdPenOp(p.id as string));
  },

  transferKits: async (p, clientAt) =>
    fromOpResult(
      await transferKitsOp({
        fromTagId: p.fromTagId as string,
        toTagId: p.toTagId as string,
        count: p.count as number,
      })
    ),

  finalizeMother: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("rabbit", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer rabbit edit exists on server" };
    }
    return fromOpResult(await finalizeMotherOp(p.id as string, p.tagId as string, p.weightKg as number));
  },

  finalizeBuck: async (p, clientAt) => {
    if (p.id && await shouldSkipUpdate("rabbit", p.id as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer rabbit edit exists on server" };
    }
    return fromOpResult(await finalizeBuckOp(p.id as string, p.tagId as string, p.weightKg as number));
  },

  deleteRabbit: async (p, clientAt) => {
    return fromOpResult(await deleteRabbitOp(p.id as string));
  },

  recordKitSale: async (p, clientAt) => {
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

  recordWeanedKitDeath: async (p, clientAt) => {
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

  deleteKitStockMovement: async (p, clientAt) => {
    await prisma.$transaction(async (tx) => {
      const movement = await tx.kitStockMovement.delete({ where: { id: p.id as string } });
      if (movement.transactionId) {
        await tx.transaction.delete({ where: { id: movement.transactionId } });
      }
    });
    return applied;
  },

  createHealthRecord: async (p, clientAt) => {
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

  deleteHealthRecord: async (p, clientAt) => {
    await prisma.healthRecord.delete({ where: { id: p.id as string } });
    return applied;
  },

  createTransaction: async (p, clientAt) => {
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

  deleteTransaction: async (p, clientAt) => {
    await prisma.transaction.delete({ where: { id: p.id as string } });
    return applied;
  },

  updateSettings: async (p, clientAt) => {
    if (await shouldSkipUpdate("settings", 1, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer settings edit exists on server" };
    }
    const d = { ...p };
    delete d.id;
    await prisma.settings.upsert({
      where: { id: 1 },
      update: d,
      create: { id: 1, ...d } as any,
    });
    return applied;
  },

  addBreed: async (p, clientAt) => {
    await prisma.breed.create({
      data: {
        id: p.id as string | undefined,
        name: p.name as string,
      },
    });
    return applied;
  },

  deleteBreed: async (p, clientAt) => {
    await prisma.breed.delete({ where: { id: p.id as string } });
    return applied;
  },
};
