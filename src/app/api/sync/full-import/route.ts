import { runFullImport, looksLikeFullExportData } from "@/lib/sync/import";
import { RESTORE_CONFIRM_PHRASE } from "@/lib/sync/restore-confirm-phrase";
import { authenticateSync, requireOwner } from "../auth";
import { runWithFarm } from "@/lib/tenant";

/**
 * Overwrites every farm-data row in the central database with a previously
 * downloaded runFullExport() snapshot — the "restore from online backup"
 * danger-zone action, for every device. Gated the same way as
 * /api/sync/wipe: shared sync secret plus a body-level confirm phrase as a
 * defense-in-depth check against an accidental or scripted call, mirroring
 * the mobile UI's typed confirmation.
 */
export async function POST(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;
  const roleError = requireOwner(auth);
  if (roleError) return roleError;

  let body: { confirm?: string; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.confirm !== RESTORE_CONFIRM_PHRASE) {
    return Response.json({ error: "Missing or incorrect confirm phrase" }, { status: 400 });
  }

  if (!looksLikeFullExportData(body.data)) {
    return Response.json({ error: "Data does not look like a full export snapshot" }, { status: 400 });
  }

  const { dataResetAt } = await runWithFarm(auth.farmId, () => runFullImport(body.data as never));
  return Response.json({ serverTime: new Date().toISOString(), dataResetAt });
}
