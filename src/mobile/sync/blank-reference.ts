/**
 * The one payload defect the outbox refuses to queue.
 *
 * Its own module, free of any Capacitor import, so it can be tested as the
 * plain function it is — ./outbox pulls in the whole local-op registry and the
 * native SQLite bridge with it.
 *
 * ── Why a blank id is special ───────────────────────────────────────────────
 * ./outbox enqueues an operation even when the local apply rejects it, and that
 * is deliberate: the local mirror is a guess, it can be stale, and a stale
 * guess must never stop a real operation from reaching the server.
 *
 * A blank id is the one case that is not a stale guess about anything.
 * `{ breedingId: "" }` cannot become valid between the press and the push; it
 * can only reach the server and die there. Thirteen of the forty-five rejected
 * ops of ٢٠٢٦-٠٧ were exactly that — a bare findUniqueOrThrow blowing up on an
 * empty string, the same payload again minutes later, because nothing on the
 * phone ever told the farmer to stop pressing.
 */

/**
 * A payload key that names a row: `id`, or anything ending in `Id`.
 *
 * These are the only keys for which "" is never something a farmer could mean.
 * A blank name or a blank note is real input; a blank foreign key is not.
 */
export function isReferenceKey(key: string): boolean {
  return key === "id" || /Id$/.test(key);
}

/** The first blank reference in a payload, or null when every id is filled. */
export function blankReferenceKey(payload: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(payload)) {
    if (!isReferenceKey(key)) continue;
    if (typeof value === "string" && value.trim() === "") return key;
  }
  return null;
}
