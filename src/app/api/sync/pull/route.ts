import { runPull } from "@/lib/sync/pull";
import { authenticateSync } from "../auth";
import { runWithFarm } from "@/lib/tenant";

/**
 * `since` is the client's stored cursor from a previous pull/bootstrap's
 * `serverTime` — using the server's own clock, not the device's, avoids
 * client clock skew ever causing a missed or duplicated row.
 */
export async function GET(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get("since");
  if (!sinceParam) {
    return Response.json({ error: "since query parameter is required" }, { status: 400 });
  }
  const since = new Date(sinceParam);
  if (Number.isNaN(since.getTime())) {
    return Response.json({ error: "Invalid since parameter" }, { status: 400 });
  }

  const data = await runWithFarm(auth.farmId, () => runPull(since));
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
