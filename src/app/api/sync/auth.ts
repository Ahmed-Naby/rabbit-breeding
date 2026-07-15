/**
 * Not a user/session auth system — the whole app has none. This only gates
 * the new HTTP surface (previously every write went through a Server Action,
 * unreachable except from the app's own pages) behind a secret only the
 * Capacitor app knows, so `/api/sync/*` isn't wide open on the public deploy.
 */
export function checkSyncAuth(request: Request): Response | null {
  const expected = process.env.SYNC_SHARED_SECRET;
  if (!expected) {
    return Response.json({ error: "SYNC_SHARED_SECRET is not configured" }, { status: 500 });
  }
  const provided = request.headers.get("x-sync-key");
  if (provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
