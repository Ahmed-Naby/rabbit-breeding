/**
 * Queues a business operation for later replay against the server, and
 * applies the same transition to the local mirror immediately so the UI
 * doesn't wait on connectivity — matching today's web app's
 * useTransition/revalidatePath immediacy (see the sync plan's Phase 2
 * section). The local apply is only ever a best-effort guess: the server's
 * replay (via operation-registry.ts) is the authority, so the outbox row is
 * enqueued unconditionally even when the local guess itself is rejected or
 * throws — a stale local snapshot must never prevent the real operation from
 * reaching the server.
 */
import { createId } from "@paralleldrive/cuid2";
import { withTransaction } from "../db/client";
import { nowIso } from "../db/helpers";
import { localOpRegistry, type LocalOpOutcome } from "./local-ops";

// Ops that create a brand-new row need a client-generated id up front (see
// local-ops.ts's file header + prisma/schema.prisma — every row-creating op
// accepts an explicit `id`, defaulting server-side to its own cuid() only
// when none is supplied). Everything else operates on an existing row and
// needs no id injected.
//
// confirmPregnant/markMatingFailed each mint the PregnancyTestLog row, and
// confirmResorption the ResorptionLog row; injecting the id here makes the
// optimistic local row and the server's row share it, so sync dedups by id
// instead of the drift-prone matingDate (which left سجل الجس showing the same
// test twice). The id is harmlessly unused when the op writes no log (e.g.
// markMatingFailed on a breeding with no matingDate).
const CREATING_OP_TYPES = new Set([
  "startBreeding",
  "markMated",
  "createQuickRabbit",
  "confirmPregnant",
  "markMatingFailed",
  "confirmResorption",
  // Mints a KitStockMovement row. Without a shared id the phone kept its own
  // "local-" row while the server minted a different one, so the next pull
  // brought the same نافق back a second time and رصيد الفطام lost a kit twice.
  "recordWeanedKitDeath",
  // The other two writers of that same table, and they had exactly the bug the
  // line above describes: a بيع of 5 took 10 off المخزون المتاح — five when the
  // sale was recorded, five more when the server's copy of it was pulled back
  // under a different id.
  "recordKitSale",
  "recordKitStockAdjustment",
]);

// Ops that record a NEW mating also append a permanent MatingLog row. That row
// needs its OWN client id (separate from the Breeding row's `id` above) so the
// optimistic local mating_log row and the server's row share it, and the pull's
// INSERT OR REPLACE dedups by id instead of the drift-prone (doeId, matingDate).
// Without this سجل التلقيح stayed empty offline until a sync pulled the row back
// — unlike every other archive log, which local-ops writes immediately. The id
// is harmlessly unused when the op writes no log (e.g. setMatingDate merely
// correcting or clearing an existing date).
const MATING_LOG_OP_TYPES = new Set(["startBreeding", "markMated", "setMatingDate"]);

// Same contract for the نصب العش archive: breeding.nestBoxDate is cleared by the
// next cycle, so NestBoxLog is what the اليومية of a past day reads, and the
// local row must carry the server's id to survive the pull's INSERT OR REPLACE.
const NEST_BOX_LOG_OP_TYPES = new Set(["installNestBox"]);

// And for نفوق النتاج: recordNursingKitDeath appends a KitDeathLog row, which
// is the only trace the death leaves (the litter counts it moves are recycled
// by the next cycle), so it needs the same shared id as the archives above.
const KIT_DEATH_LOG_OP_TYPES = new Set(["recordNursingKitDeath"]);

export type EnqueueResult = {
  clientOpId: string;
  outcome: LocalOpOutcome;
};

export async function enqueue(
  opType: string,
  payload: Record<string, unknown>
): Promise<EnqueueResult> {
  const opFn = localOpRegistry[opType];
  if (!opFn) throw new Error(`Unknown opType: ${opType}`);

  const clientOpId = createId();
  const clientAt = nowIso();
  let finalPayload = payload;
  if (CREATING_OP_TYPES.has(opType) && !finalPayload.id) {
    finalPayload = { ...finalPayload, id: createId() };
  }
  if (MATING_LOG_OP_TYPES.has(opType) && !finalPayload.matingLogId) {
    finalPayload = { ...finalPayload, matingLogId: createId() };
  }
  if (NEST_BOX_LOG_OP_TYPES.has(opType) && !finalPayload.nestBoxLogId) {
    finalPayload = { ...finalPayload, nestBoxLogId: createId() };
  }
  if (KIT_DEATH_LOG_OP_TYPES.has(opType) && !finalPayload.kitDeathLogId) {
    finalPayload = { ...finalPayload, kitDeathLogId: createId() };
  }

  const outcome = await withTransaction<LocalOpOutcome>(async (db) => {
    let result: LocalOpOutcome;
    try {
      result = await opFn(db, finalPayload);
    } catch (err) {
      result = { status: "rejected", resultMessage: err instanceof Error ? err.message : String(err) };
    }

    await db.run(
      `INSERT INTO outbox (clientOpId, opType, payload, clientAt, status, resultMessage, createdAt)
       VALUES (?, ?, ?, ?, 'pending', NULL, ?)`,
      [clientOpId, opType, JSON.stringify(finalPayload), clientAt, clientAt],
      false
    );

    return result;
  });

  return { clientOpId, outcome };
}
