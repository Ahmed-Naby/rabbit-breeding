import { runPull } from "@/lib/sync/pull";
import { checkSyncAuth } from "../auth";

/**
 * `since` is the client's stored cursor from a previous pull/bootstrap's
 * `serverTime` — using the server's own clock, not the device's, avoids
 * client clock skew ever causing a missed or duplicated row.
 */
export async function GET(request: Request) {
  const authError = checkSyncAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get("since");
  if (!sinceParam) {
    return Response.json({ error: "since query parameter is required" }, { status: 400 });
  }
  const since = new Date(sinceParam);
  if (Number.isNaN(since.getTime())) {
    return Response.json({ error: "Invalid since parameter" }, { status: 400 });
  }

  const data = await runPull(since);
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
