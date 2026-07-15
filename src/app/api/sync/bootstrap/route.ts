import { runPull } from "@/lib/sync/pull";
import { checkSyncAuth } from "../auth";

/** Same shape as /api/sync/pull, with `since` forced to epoch — a device's first-ever sync. */
export async function GET(request: Request) {
  const authError = checkSyncAuth(request);
  if (authError) return authError;

  const data = await runPull(new Date(0));
  return Response.json({ serverTime: new Date().toISOString(), ...data });
}
