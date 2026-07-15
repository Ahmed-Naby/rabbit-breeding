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
const CREATING_OP_TYPES = new Set(["startBreeding", "markMated", "createQuickRabbit"]);

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
  const finalPayload =
    CREATING_OP_TYPES.has(opType) && !payload.id ? { ...payload, id: createId() } : payload;

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
