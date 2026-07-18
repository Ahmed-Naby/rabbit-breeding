import { revokeToken } from "@/lib/auth/tokens";

/** Revokes the presented device token. Idempotent — unknown tokens 200 too. */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    await revokeToken(authHeader.slice(7).trim());
  }
  return Response.json({ ok: true });
}
