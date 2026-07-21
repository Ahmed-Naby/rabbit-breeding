import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

// Prisma error codes that mean "this exact operation, replayed against this
// exact state, will never succeed" — a genuinely deterministic outcome, not
// a blip. Anything else caught below is treated as transient (see the catch
// block's "error" branch), since an unrecognized throw might just as well be
// a dropped connection as a real bug — this table only holds the codes worth
// betting are the former.
// P2025: "record not found" — e.g. setLitterCount racing a clearDoeRow that
//   already deleted the litter out from under it (the sync plan's known
//   "deletion must win" conflict). P2002: unique constraint — e.g. addBreed
//   racing a duplicate name from another device.
const DETERMINISTIC_PRISMA_CODES = new Set(["P2025", "P2002"]);
import { operationRegistry, runWithSyncBatch } from "@/lib/sync/operation-registry";
import { authenticateSync } from "../auth";
import { runWithFarm } from "@/lib/tenant";

type IncomingOperation = {
  clientOpId: string;
  opType: string;
  payload: Record<string, unknown>;
  clientAt: string;
};

type OperationResult = {
  clientOpId: string;
  status: "applied" | "rejected" | "already_applied" | "error";
  resultMessage?: string | null;
};

/**
 * Applies a batch of offline-queued operations in array order, through the
 * same *Op functions the web Server Actions call (see operation-registry.ts)
 * — each op runs in its own Postgres transaction, so two concurrent pushes
 * serialize correctly the same way two browser tabs already do today.
 *
 * A rejected operation (bad precondition, or an unexpected throw) does not
 * abort the batch — every operation gets a persisted, reportable outcome,
 * never a silent partial failure.
 */
export async function POST(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;

  let body: { deviceId?: string; operations?: IncomingOperation[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { deviceId, operations } = body;
  if (!deviceId || !Array.isArray(operations)) {
    return Response.json({ error: "deviceId and operations[] are required" }, { status: 400 });
  }

  await prisma.syncDevice.upsert({
    where: { id: deviceId },
    create: { id: deviceId, farmId: auth.farmId, userId: auth.userId, lastSyncAt: new Date() },
    update: { farmId: auth.farmId, userId: auth.userId, lastSyncAt: new Date() },
  });

  const results: OperationResult[] = [];

  // Scopes shouldSkipUpdate's conflict guard to this batch — without it, the
  // first op to write a row makes every later op on that row look like a
  // losing conflict and get dropped (see runWithSyncBatch).
  await runWithSyncBatch(async () => {
  for (const op of operations) {
    if (!op.clientOpId || !op.opType || !op.clientAt) {
      results.push({ clientOpId: op.clientOpId ?? "", status: "rejected", resultMessage: "Malformed operation" });
      continue;
    }

    const existing = await prisma.syncOperation.findUnique({ where: { clientOpId: op.clientOpId } });
    if (existing) {
      results.push({
        clientOpId: op.clientOpId,
        status: "already_applied",
        resultMessage: existing.resultMessage,
      });
      continue;
    }

    const handler = operationRegistry[op.opType];
    let outcome: { status: "applied" | "rejected"; resultMessage?: string };
    if (!handler) {
      outcome = { status: "rejected", resultMessage: `Unknown opType: ${op.opType}` };
    } else {
      try {
        // Every op replays inside the authenticated farm's context — the
        // Prisma extension scopes all its queries to auth.farmId.
        outcome = await runWithFarm(auth.farmId, () => handler(op.payload ?? {}, new Date(op.clientAt)));
      } catch (e) {
        // A thrown error here is NOT the same thing as a deliberate business-
        // rule rejection (those come back as a normal {ok:false,code} return
        // value via fromOpResult, never a throw). This branch only catches
        // the unexpected: a dropped DB connection, a Neon cold-start
        // timeout, a Prisma serialization/deadlock error, or an *Op function
        // that hasn't been converted to the structured rejection pattern.
        // Most of that means nothing about whether the operation is valid —
        // persisting it as a permanent "rejected" SyncOperation would both
        // block the same clientOpId from ever being retried (the idempotency
        // check above) and, via the client's rejected-create reconciliation
        // sweep, could delete real local data over what was really just a
        // blip. Report it as transient "error" and skip persisting a
        // SyncOperation row so the exact same clientOpId can retry fresh —
        // UNLESS it's one of DETERMINISTIC_PRISMA_CODES, which means retrying
        // is pointless (the exact same state will fail the exact same way
        // forever) and the honest answer is a real, terminal "rejected".
        const isDeterministic =
          e instanceof Prisma.PrismaClientKnownRequestError && DETERMINISTIC_PRISMA_CODES.has(e.code);
        if (!isDeterministic) {
          results.push({
            clientOpId: op.clientOpId,
            status: "error",
            resultMessage: e instanceof Error ? e.message : String(e),
          });
          continue;
        }
        outcome = { status: "rejected", resultMessage: e instanceof Error ? e.message : String(e) };
      }
    }

    await prisma.syncOperation.create({
      data: {
        clientOpId: op.clientOpId,
        deviceId,
        opType: op.opType,
        payload: (op.payload ?? {}) as Prisma.InputJsonValue,
        clientAt: new Date(op.clientAt),
        status: outcome.status,
        resultMessage: outcome.resultMessage ?? null,
        appliedAt: outcome.status === "applied" ? new Date() : null,
      },
    });

    results.push({ clientOpId: op.clientOpId, status: outcome.status, resultMessage: outcome.resultMessage });
  }
  });

  return Response.json({ serverTime: new Date().toISOString(), results });
}
