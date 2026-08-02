/**
 * "نافق الرعاية" — kits that died between kindling and weaning.
 *
 * There is no column for this, and deliberately so: it is exactly the gap
 * between the two stillborn numbers a KindlingLog row already carries.
 *
 *   bornDeadAtKindling  frozen at the ولادة press, never mirrored again
 *   bornDead            keeps growing as pre-weaning deaths are recorded
 *                       (recordNursingKitDeathOp, or a hand edit to «نافق»)
 *
 * Deriving it here rather than storing a third column means it can never
 * disagree with the two numbers it is built from — a stored counter would have
 * to be maintained at every mirror site in breeding-ops.ts *and* in the mobile
 * offline mirror, and any missed site becomes a silent, permanent drift.
 *
 * Web (Prisma rows) and mobile (local SQLite rows) both call this, so the two
 * platforms can never differ on the definition.
 *
 * Scope: birth → weaning only. After weaning, kit deaths stop touching the
 * Litter entirely and are recorded as KitStockMovement rows with
 * `type: "death"` — those are NOT counted here.
 */

import { survivalRate } from "./dates";

/** The two fields any caller must supply; both live on every KindlingLog row. */
export type KitMortalitySource = {
  /** Current stillborn + pre-weaning-death total (grows over the cycle). */
  bornDead: number;
  /** Stillborns at the kindling moment, frozen. `-1` on legacy mobile rows. */
  bornDeadAtKindling: number;
};

/**
 * Kits lost during nursing, or 0 when the number can't be trusted.
 *
 * Returns 0 in two cases rather than a misleading figure:
 *
 *  - `bornDeadAtKindling < 0` — the `-1` sentinel a local SQLite row carries
 *    when it predates the column (see applyColumnMigrations in
 *    src/mobile/db/client.ts). Subtracting it would report `bornDead + 1`
 *    deaths for a doe that may have lost none.
 *  - A negative difference — «نافق» was hand-edited *downwards* on the does
 *    board (someone over-typed the stillborn count at birth and corrected it
 *    later). The frozen value is now the wrong one; "no nursing deaths known"
 *    beats a negative count.
 *
 * Two honest limits that no guard can fix, both worth knowing before this
 * number goes into a report:
 *
 *  - Rows created before the bornDeadAtKindling migration keep the -1 sentinel
 *    forever and report 0 here. Their nursing deaths are unrecoverable, so
 *    history reads as "nothing died in the nursery" — call hasKnownSurvival
 *    first and render «—» rather than folding those zeros into a total.
 *  - Fostering (transferKitsOp) moves bornAlive between does but never
 *    bornDead, so a transferred kit that later dies is booked against the doe
 *    nursing it, not the one that bore it. This measures deaths *under her
 *    care*, which is the right basis for judging a doe as a mother — but it is
 *    not strictly "her own kits that died".
 */
export function deadDuringBreeding(log: KitMortalitySource): number {
  if (log.bornDeadAtKindling < 0) return 0;
  return Math.max(0, log.bornDead - log.bornDeadAtKindling);
}

/**
 * The frozen stillborn count for a cycle, reconstructed when the kindling row
 * can't supply it.
 *
 * `bornDeadAtKindling` is not something the survival rate conceptually needs —
 * the rate needs the kits under care and the ones lost while nursing. It is
 * only involved because `bornDead` is a single merged counter (stillborns +
 * nursing deaths), and subtracting the birth half is the only way to get the
 * nursing half back out of it.
 *
 * So when the birth half is missing, take the *other* road: KitDeathLog holds
 * one dated row per «تسجيل نافق» press, which is the nursing half directly.
 *   bornDeadAtKindling = bornDead − (nursing deaths recorded)
 *
 * `recordedKitDeaths` must be null — not 0 — when the cycle has no death rows
 * at all. Zero rows is "no evidence", and reconstructing from it would claim
 * every kit in `bornDead` was stillborn; a doe whose losses were typed into
 * «نافق» by hand (that path writes no KitDeathLog row) would then read as
 * having raised everything she had. Those keep the -1 sentinel and render «—».
 */
export function resolveBornDeadAtKindling(args: {
  /** From this cycle's KindlingLog row; null/-1 when there is none to read. */
  fromKindlingLog: number | null | undefined;
  bornDead: number;
  /** Sum of the cycle's KitDeathLog rows, or null when it has none. */
  recordedKitDeaths: number | null;
}): number {
  if (args.fromKindlingLog != null && args.fromKindlingLog >= 0) return args.fromKindlingLog;
  if (args.recordedKitDeaths == null) return -1;
  return Math.max(0, args.bornDead - args.recordedKitDeaths);
}

/**
 * The denominator for «نسبة بقاء الفطام» — how many kits were actually under
 * this doe's care, i.e. survivors plus the ones she lost while nursing.
 *
 * Every nursing death does `bornAlive--, bornDead++` in one transaction
 * (recordNursingKitDeathOp), so the two moves cancel and this reconstructs the
 * live count at kindling:
 *
 *   bornAlive + deadDuringBreeding = (bornAlive₀ − deaths) + deaths = bornAlive₀
 *
 * Deliberately NOT `bornAliveAtKindling`, even though that column exists and
 * looks like the obvious denominator. Fostering moves `bornAlive` between does
 * but never `bornDead`, so this reconstruction follows the kits while the
 * frozen column can't:
 *
 *   donor    ولدت 10، حوّلت 3، ماتت 1، فطمت 6 → 6/7 = 86%   (frozen: 6/10 = 60%)
 *   receiver ولدت 4،  استقبلت 3، فطمت 7       → 7/7 = 100%  (frozen: 7/4 = 175%)
 *
 * A doe isn't punished for kits she gave away, and one that took kits in can't
 * score above 100%.
 *
 * Not safe to call unguarded on a row that predates the column: its sentinel
 * makes `deadDuringBreeding` 0, leaving this equal to the already-shrunken
 * bornAlive, which reads as a flattering ~100%. Gate on hasKnownSurvival below
 * — or use weaningSurvivalRate, which does it for you.
 */
export function kitsUnderCare(log: KitMortalitySource & { bornAlive: number }): number {
  return log.bornAlive + deadDuringBreeding(log);
}

/**
 * Whether a survival rate can be computed honestly for this row.
 *
 * The `-1` sentinel means "this row predates the column" — the nursing deaths
 * that happened before it existed are unrecoverable, so any rate computed from
 * it would silently overstate the doe. Call sites render «—» instead.
 *
 * This is why both the Postgres column and the local SQLite one default to -1
 * rather than 0, and why the migration does NOT backfill from bornDead the way
 * bornAliveAtKindling's did: a doe that genuinely lost no kits also has
 * `bornDead === bornDeadAtKindling`, so a value-based test could not tell a
 * perfect litter apart from an unknown one. Only a value outside the real
 * domain can carry that distinction.
 */
export function hasKnownSurvival(log: KitMortalitySource): boolean {
  return log.bornDeadAtKindling >= 0;
}

/**
 * «نسبة بقاء الفطام» as a 0–1 fraction, or null when it can't be known —
 * the single entry point every table and stat should use.
 *
 * Replaces the old `survivalRate(bornAlive, weaned)`, whose denominator was the
 * *current* live count. Since every nursing death decrements bornAlive, that
 * denominator shrank in step with the numerator and reported ~100% for any doe
 * whose losses had been recorded properly — the better she was tracked, the
 * better she scored.
 *
 * Two behaviours worth knowing:
 *  - A litter lost entirely reads 0%, not «—». The old version hit
 *    `bornAlive <= 0` and returned null, so the worst possible outcome showed
 *    as *no data* and vanished from herd aggregates.
 *  - Rows predating bornDeadAtKindling return null (see hasKnownSurvival)
 *    rather than a rate their missing history can't support.
 */
export function weaningSurvivalRate(
  log: KitMortalitySource & { bornAlive: number; weaned: number | null | undefined }
): number | null {
  if (!hasKnownSurvival(log)) return null;
  return survivalRate(kitsUnderCare(log), log.weaned);
}
