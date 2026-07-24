import { runResetOperations } from "@/lib/sync/reset-operations";
import { RESET_OPERATIONS_CONFIRM_PHRASE } from "@/lib/sync/reset-operations-confirm-phrase";
import { authenticateSync, requireOwner } from "../auth";
import { runWithFarm } from "@/lib/tenant";

/**
 * Permanently deletes every recorded operation of the farm from the central
 * database, for every device, while keeping the rabbits/bucks and breed
 * registry (see runResetOperations). Gated by the shared sync secret (same as
 * every /api/sync/* route) plus a body-level confirm phrase — the phrase isn't
 * a security boundary (anyone with the shared secret could hardcode it too),
 * it's a defense-in-depth check against an accidental or scripted call,
 * mirroring the confirmation the mobile UI requires before it ever sends this
 * request.
 */
export async function POST(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;
  const roleError = requireOwner(auth);
  if (roleError) return roleError;

  let body: { confirm?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.confirm !== RESET_OPERATIONS_CONFIRM_PHRASE) {
    return Response.json({ error: "Missing or incorrect confirm phrase" }, { status: 400 });
  }

  const { dataResetAt } = await runWithFarm(auth.farmId, () => runResetOperations());
  return Response.json({ serverTime: new Date().toISOString(), dataResetAt });
}
