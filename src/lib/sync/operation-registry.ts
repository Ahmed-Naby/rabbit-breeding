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
 *    sex/photo editing), out of scope for the offline app. The mobile
 *    detail page's edit form uses updateRabbitDetailsOp instead, a narrower
 *    field set (tagId/breed/color/cage/dateOfBirth/acquiredDate/
 *    acquiredFrom/notes) — tagId included because that page can renumber a
 *    herd rabbit, even though the wider pedigree edit stays desktop-only.
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
  confirmPalpationOp,
  confirmResorptionOp,
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
import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/prisma";
import { currentFarmId } from "@/lib/tenant";

// globalThis-cached for the same reason tenant.ts caches its farm storage: a
// dev hot-reload can otherwise leave push/route.ts writing to one instance
// while shouldSkipUpdate below reads a different, always-empty one — which
// would silently restore the very bug this exists to fix.
const globalForBatch = globalThis as unknown as {
  syncBatchStartedAt: AsyncLocalStorage<Date> | undefined;
};

const batchStorage = globalForBatch.syncBatchStartedAt ?? new AsyncLocalStorage<Date>();

if (process.env.NODE_ENV !== "production") {
  globalForBatch.syncBatchStartedAt = batchStorage;
}

/**
 * Wraps one push batch, recording when it began.
 *
 * shouldSkipUpdate's guard compares a row's `updatedAt` against the op's
 * `clientAt` to mean "another device edited this after my op was created —
 * don't clobber it". But `updatedAt` is stamped at server-apply time, always
 * LATER than any clientAt, so once any op in a batch wrote a row, every
 * later op touching that row looked like a losing conflict and was silently
 * dropped (reported "applied", so the client discarded it for good).
 *
 * The batch's start time separates the two cases: a write this batch made
 * carries a timestamp at or after it, while a genuine edit from another
 * device happened before this request and stays caught. Keyed on time
 * rather than on which rows the guard saw, because the ops that write
 * without consulting it (startBreeding, markKindled, …) must count too —
 * they were the ones actually bumping updatedAt in practice.
 */
export function runWithSyncBatch<T>(fn: () => Promise<T>): Promise<T> {
  return batchStorage.run(new Date(), fn);
}

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
  // Settings is the one model here keyed BY farmId (@id) rather than by an
  // `id` column — it has no `id` at all (see schema.prisma). Querying
  // { where: { id } } for it throws a PrismaClientValidationError, which
  // push/route.ts can't recognise as deterministic, so it reports the op as
  // a transient "error" and lets the client retry the same clientOpId
  // forever — a permanently stuck "1 pending" that never drains.
  const where = modelName === "settings" ? { farmId: currentFarmId() } : { id };
  const existing = await (prisma[modelName] as any).findUnique({
    where,
    select: { updatedAt: true }
  });
  if (existing && existing.updatedAt && existing.updatedAt > clientAt) {
    // An earlier op in this same push wrote the row, so its updatedAt is this
    // batch's own handiwork rather than a competing edit — skipping here
    // would silently drop every follow-up op on the row (see runWithSyncBatch).
    const batchStartedAt = batchStorage.getStore();
    if (batchStartedAt && existing.updatedAt >= batchStartedAt) return false;

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

  confirmPalpation: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await confirmPalpationOp(p.breedingId as string);
    return applied;
  },

  confirmResorption: async (p, clientAt) => {
    if (p.breedingId && await shouldSkipUpdate("breeding", p.breedingId as string, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer breeding edit exists on server" };
    }
    await confirmResorptionOp(p.breedingId as string, p.doeId as string);
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
    // `tagId` is only present for herd rabbits (see the detail page's edit
    // submit), and absent must stay absent rather than collapsing to null —
    // that difference is "leave the number alone" vs "clear it".
    return fromOpResult(
      await updateRabbitDetailsOp(p.id as string, {
        ...("tagId" in p ? { tagId: (p.tagId as string | null) ?? null } : {}),
        breed: (p.breed as string | null) ?? null,
        color: (p.color as string | null) ?? null,
        cage: (p.cage as string | null) ?? null,
        dateOfBirth: toDateOrNull(p.dateOfBirth),
        acquiredDate: toDateOrNull(p.acquiredDate),
        acquiredFrom: (p.acquiredFrom as string | null) ?? null,
        notes: (p.notes as string | null) ?? null,
      })
    );
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
          origin: (p.origin as "farm" | "external") ?? "farm",
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

  // Manual reconciliation of the available-weaning-stock balance. `count` is
  // signed and added to the balance directly (positive raises it, negative
  // lowers it) — the opening-balance / correction hook, since every other
  // movement is derived from a real weaning, sale, death, or retention.
  recordKitStockAdjustment: async (p, clientAt) => {
    await prisma.kitStockMovement.create({
      data: {
        id: p.id as string | undefined,
        date: new Date(p.date as string),
        type: "adjustment",
        count: p.count as number,
        notes: (p.notes as string | null) ?? null,
      },
    });
    return applied;
  },

  deleteKitStockMovement: async (p, clientAt) => {
    await prisma.$transaction(async (tx) => {
      const movement = await tx.kitStockMovement.delete({ where: { id: p.id as string } });
      await tx.syncTombstone.create({ data: { model: "kit_stock_movement", recordId: movement.id } });
      if (movement.transactionId) {
        await tx.transaction.delete({ where: { id: movement.transactionId } });
        await tx.syncTombstone.create({ data: { model: "transaction_ledger", recordId: movement.transactionId } });
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
    await prisma.$transaction([
      prisma.healthRecord.delete({ where: { id: p.id as string } }),
      prisma.syncTombstone.create({ data: { model: "health_record", recordId: p.id as string } }),
    ]);
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
    await prisma.$transaction([
      prisma.transaction.delete({ where: { id: p.id as string } }),
      prisma.syncTombstone.create({ data: { model: "transaction_ledger", recordId: p.id as string } }),
    ]);
    return applied;
  },

  updateSettings: async (p, clientAt) => {
    if (await shouldSkipUpdate("settings", 1, clientAt)) {
      return { status: "applied", resultMessage: "Skipped: newer settings edit exists on server" };
    }
    const d = { ...p };
    delete d.id;
    await prisma.settings.upsert({
      where: { farmId: currentFarmId() },
      update: d,
      create: { farmId: currentFarmId(), ...d } as any,
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
