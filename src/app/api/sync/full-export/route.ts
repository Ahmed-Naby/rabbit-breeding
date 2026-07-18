import { runFullExport } from "@/lib/sync/export";
import { checkSyncAuth } from "../auth";

/** Full, uncapped database snapshot — the mandatory pre-wipe backup download. */
export async function GET(request: Request) {
  const authError = checkSyncAuth(request);
  if (authError) return authError;

  const data = await runFullExport();
  return Response.json(data, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
