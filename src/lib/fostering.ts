/**
 * "مساعدة قرار التبني" — the two lists shown above the fostering form.
 *
 * The farm balances litters by hand: a doe that kindled a big litter can't
 * nurse them all, and a doe that kindled a small one has milk to spare. This
 * module only decides *who gets listed* — the transfer itself is still typed
 * into the foster form (transferKitsOp), so nothing here writes anything.
 *
 * Both the web page (Prisma) and the mobile page (local SQLite) build the same
 * `FosterCandidate[]` and hand it to `splitFosterCandidates`, so the two
 * platforms can never drift on the rule.
 */

// Mirror the Settings model's schema defaults. Used only as a fallback when a
// caller hands us an undefined column (a device on an older local schema, or a
// server whose migration hasn't run yet) — the stored setting always wins.
const DEFAULT_FOSTER_WINDOW_DAYS = 2;
const DEFAULT_FOSTER_HIGH_KITS = 8;
const DEFAULT_FOSTER_LOW_KITS = 4;

export type FosterCandidate = {
  doeId: string;
  tagId: string | null;
  cage: string | null;
  kindlingDate: Date;
  /** Live nursing kits — Litter.bornAlive, kept current by deaths/transfers. */
  kits: number;
};

/**
 * Oldest kindling date still inside the window, at start-of-day so a doe that
 * kindled `windowDays` ago is included for the whole of today. `windowDays: 0`
 * means today only.
 */
export function fosterWindowStart(windowDays: number, today: Date = new Date()): Date {
  // Falling back beats feeding an Invalid Date to the query.
  const days = Number.isFinite(windowDays) ? windowDays : DEFAULT_FOSTER_WINDOW_DAYS;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  return start;
}

/**
 * Splits fresh kindlings into donors (big litters) and recipients (small ones).
 * Deliberately stops there: no pairing is computed or suggested — who moves to
 * whom is the supervisor's call.
 */
export function splitFosterCandidates(
  candidates: FosterCandidate[],
  highKits: number,
  lowKits: number
): { large: FosterCandidate[]; small: FosterCandidate[] } {
  // A doe with two litters inside the window (re-kindled, or a data fix) would
  // otherwise show up twice with conflicting counts — keep her newest litter.
  const newestPerDoe = new Map<string, FosterCandidate>();
  for (const c of candidates) {
    const seen = newestPerDoe.get(c.doeId);
    if (!seen || c.kindlingDate.getTime() > seen.kindlingDate.getTime()) {
      newestPerDoe.set(c.doeId, c);
    }
  }
  // A doe with zero live kits has nothing to give and nothing to balance.
  const rows = [...newestPerDoe.values()].filter((c) => c.kits > 0);
  const high = Number.isFinite(highKits) ? highKits : DEFAULT_FOSTER_HIGH_KITS;
  const low = Number.isFinite(lowKits) ? lowKits : DEFAULT_FOSTER_LOW_KITS;

  return {
    // Fullest first / emptiest first — the most lopsided pair sits at the top
    // of each list, but they're still just two independent lists.
    large: rows.filter((c) => c.kits >= high).sort((a, b) => b.kits - a.kits),
    small: rows.filter((c) => c.kits <= low).sort((a, b) => a.kits - b.kits),
  };
}
