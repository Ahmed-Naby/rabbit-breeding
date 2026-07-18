import { runPull } from "@/lib/sync/pull";
import { authenticateSync } from "../auth";
import { runWithFarm } from "@/lib/tenant";

/** Same shape as /api/sync/pull, with `since` forced to epoch — a device's first-ever sync. */
export async function GET(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;

  const data = await runWithFarm(auth.farmId, () => runPull(new Date(0)));
  return Response.json(
    { serverTime: new Date().toISOString(), ...data },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );
}
