/**
 * Does a hash route match a legacy route hash?
 *
 * The app shell used plain startsWith for this, which meant a short legacy
 * route swallowed every longer one beginning with the same text: "#/bucks"
 * matched "#/bucks-fertility" and "#/bucks-rounds", so those two rendered the
 * القطيع والسلالات screen on top of the page they asked for. Anchoring at "?"
 * keeps the query-string form ("#/reports?tab=…") working, which is the only
 * reason startsWith was there in the first place.
 *
 * Not for "#/rabbits/<id>" — that one is a genuine prefix with the id appended,
 * so it still uses startsWith directly.
 */
export function matchesRoute(hash: string, base: string): boolean {
  return hash === base || hash.startsWith(`${base}?`);
}
