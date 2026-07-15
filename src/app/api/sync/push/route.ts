import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { operationRegistry } from "@/lib/sync/operation-registry";
import { checkSyncAuth } from "../auth";

type IncomingOperation = {
  clientOpId: string;
  opType: string;
  payload: Record<string, unknown>;
  clientAt: string;
};

type OperationResult = {
  clientOpId: string;
  status: "applied" | "rejected" | "already_applied";
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
  const authError = checkSyncAuth(request);
  if (authError) return authError;

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
    create: { id: deviceId, lastSyncAt: new Date() },
    update: { lastSyncAt: new Date() },
  });

  const results: OperationResult[] = [];

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
        outcome = await handler(op.payload ?? {});
      } catch (e) {
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

  return Response.json({ serverTime: new Date().toISOString(), results });
}
