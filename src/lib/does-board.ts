/**
 * Row-derivation logic for the does board, factored out of src/app/does/page.tsx
 * so the web Server Component and the offline mobile board (src/mobile/pages/does-page.tsx)
 * share one source of truth — framework-agnostic (no Prisma/server-only imports), so it
 * works from both a Prisma query result and a local SQLite row shape.
 */
import { pregnancyTestDate, expectedKindling, rebreedDueDate, daysUntil } from "./dates";
import type { DoeState, RabbitStatus } from "./enums";

export type DoeBoardBreeding = {
  id: string;
  matingDate: Date | null;
  actualKindlingDate: Date | null;
  buckTagId: string | null;
  palpationConfirmedDate: Date | null;
  litter: {
    bornAlive: number;
    bornDead: number;
    weaned: number | null;
    weaningDate: Date | null;
    weaningWeightGrams: number | null;
  } | null;
};

export type DoeBoardSettings = {
  rebreedAfterKindlingDays: number;
  pregnancyTestDays: number;
  palpationCheckDays: number;
};

export type DoeBoardRow = {
  /** The doe's latest breeding row, or null if she's never been bred. */
  current: DoeBoardBreeding | null;
  /** The breeding row before `current` — only relevant while a rebreed fork is in play. */
  prev: DoeBoardBreeding | null;
  prevOngoingLitter: boolean;
  litterRow: DoeBoardBreeding | null;
  countsRow: DoeBoardBreeding | null;
  isWeaned: boolean;
  rebreedReady: boolean;
  canMate: boolean;
  canTestPregnancy: boolean;
  canConfirmPalpation: boolean;
  /** Whether «تأكيد الجس» should still show its green check for this cycle. */
  palpationConfirmed: boolean;
  kindleActive: boolean;
  weanActive: boolean;
  testDate: Date | null;
  kindlingDate: Date | null;
};

/**
 * `breedings` is the doe's breedingsAsDoe, most-recent-first, at most 2 rows
 * — two, not one, because for "nursing_bred" the latest row is the *new*
 * rebreed attempt (no litter yet) while the still-unweaned litter lives on
 * the previous row, and both are needed to render the row without losing
 * sight of her current litter.
 */
/**
 * Whether عدد الفطام/وزن الفطام have been filled in, i.e. whether pressing
 * "فطام" would stamp a meaningful سجل الفطام row. markWeanedOp copies whatever
 * the Litter holds at press time, so pressing first writes blanks into a
 * permanent, non-editable archive row.
 *
 * The weight is waived when `weaned === 0` — a litter lost entirely has nothing
 * left to weigh, and demanding it would leave that row unweanable forever.
 *
 * Shared by the does board and the weaning board so the two can't drift on what
 * counts as "ready".
 */
export function weaningEntryComplete(
  litter: { weaned: number | null; weaningWeightGrams: number | null } | null | undefined
): boolean {
  if (!litter || litter.weaned == null) return false;
  return litter.weaned === 0 || litter.weaningWeightGrams != null;
}

/** Which husbandry system a rebreed offset amounts to — see rebreedSystemBand. */
export type RebreedSystemBand = "intensive" | "semiIntensive" | "natural";

/**
 * Longest rebreed offset الإعدادات accepts. 30 is طبيعي; past it a doe is being
 * rested, not run on a rebreed interval. Lives here so the zod schema, both
 * settings forms and their max= attributes can never drift apart.
 */
export const REBREED_MAX_DAYS = 30;

/**
 * Longest weaning wait that still fits inside a cycle: the doe kindles again
 * about 30 + rebreed days after this litter, and the nest has to be clear at
 * least 2 days before the next one arrives.
 *
 * Shared by the schema and both settings forms for the same reason as
 * REBREED_MAX_DAYS — one rule, one place.
 */
export function maxWeaningDays(rebreedAfterKindlingDays: number): number {
  return 30 + rebreedAfterKindlingDays - 2;
}

/**
 * Names the system behind a free-typed rebreed offset, for the badge beside the
 * field in الإعدادات. The bands are wider than the three classic offsets
 * (0/10/30) on purpose: a farm that types 3 or 12 is still running مكثف or نصف
 * مكثف, and should be told so rather than left guessing.
 */
export function rebreedSystemBand(days: number): RebreedSystemBand {
  if (days <= 5) return "intensive";
  if (days <= 15) return "semiIntensive";
  return "natural";
}

/**
 * Whether a nursing doe has served the configured rebreed cooldown since her
 * kindling (the days set in الإعدادات — see rebreedSystemBand). No kindling
 * date on record means there's nothing to gate against.
 *
 * Exported because four callers need the identical rule — computeDoeBoardRow
 * below, the mating board and the dashboard tile on each shell. They had it
 * inlined four times, and the offline pair had simply dropped it: مرضعة does
 * were listed under «أمهات جاهزة للتلقيح» with their «تلقيح» button disabled.
 */
export function rebreedCooldownElapsed(
  kindlingDate: Date | null | undefined,
  rebreedAfterKindlingDays: number
): boolean {
  if (!kindlingDate) return true;
  return daysUntil(rebreedDueDate(kindlingDate, rebreedAfterKindlingDays)) <= 0;
}

export function computeDoeBoardRow(
  doeState: DoeState,
  status: RabbitStatus | string,
  breedings: DoeBoardBreeding[],
  settings: DoeBoardSettings
): DoeBoardRow {
  const [b, prev] = breedings;

  // If she was rebred while nursing, the latest row is the fresh rebreed
  // attempt — her still-unweaned litter lives on the previous row instead.
  // Detected from the data itself (kindled, not yet weaned, and the new row
  // hasn't kindled yet) rather than doeState, since doeState moves on to
  // "pregnant" once the new mating is confirmed while she may still be
  // nursing the old litter.
  const prevOngoingLitter =
    !!prev?.actualKindlingDate && !prev?.litter?.weaningDate && !b?.actualKindlingDate;
  const litterRow = prevOngoingLitter ? prev : b;

  // Broader than prevOngoingLitter: keeps showing the previous cycle's
  // litter numbers (born counts, weaning date) right after it's weaned too,
  // as long as the new breeding row hasn't produced its own litter yet —
  // otherwise completing weaning would immediately blank its own
  // just-saved numbers. Guarded by "b has never had a litter recorded" so
  // reusing an old row for a brand-new unrelated cycle doesn't pull in
  // ancient, unrelated litter history.
  const prevIsClosingLitter = !!prev?.actualKindlingDate && !b?.actualKindlingDate && !b?.litter;
  const countsRow = prevIsClosingLitter ? prev : b;
  const isWeaned = !!countsRow?.litter?.weaningDate;

  const rebreedReady = rebreedCooldownElapsed(
    litterRow?.actualKindlingDate,
    settings.rebreedAfterKindlingDays
  );

  // "استبعاد"/"راحة" (culled/resting herd status) override the reproductive
  // cycle entirely — a doe pulled from the breeding rotation this way can
  // never re-enter mating until her status is set back to active, regardless
  // of what doeState says.
  const restedOrCulled = status === "culled" || status === "resting";
  const canMate =
    !restedOrCulled &&
    (doeState === "empty" || doeState === "excluded" || (doeState === "nursing" && rebreedReady));
  const canTestPregnancy = doeState === "bred" || doeState === "nursing_bred";

  // "تأكيد الجس" (resorption check) becomes available 15 days after mating,
  // once a positive pregnancy test is on record, and only once per cycle —
  // hidden again as soon as palpationConfirmedDate is stamped.
  const daysPregnant = b?.matingDate ? Math.max(0, -daysUntil(b.matingDate)) : null;
  const canConfirmPalpation =
    (doeState === "pregnant" || doeState === "nursing_pregnant") &&
    !b?.palpationConfirmedDate &&
    daysPregnant !== null &&
    daysPregnant >= settings.palpationCheckDays;

  // The check belongs to the pregnancy it confirmed, so it goes away once that
  // pregnancy ends in a birth — same moment «تاريخ الجس» blanks out, since both
  // hang off the mating cycle markKindled closes. markKindled nulls the column
  // itself now, but the extra actualKindlingDate guard also cleans up rows
  // kindled before that fix, which would otherwise keep the check forever.
  const palpationConfirmed = !!b?.palpationConfirmedDate && !b?.actualKindlingDate;

  const kindleActive =
    doeState === "pregnant" ||
    doeState === "nursing" ||
    doeState === "nursing_bred" ||
    doeState === "nursing_pregnant";
  const weanActive =
    doeState === "nursing" ||
    doeState === "nursing_bred" ||
    doeState === "nursing_pregnant" ||
    prevOngoingLitter;

  const testDate = b?.matingDate ? pregnancyTestDate(b.matingDate, settings.pregnancyTestDays) : null;
  const kindlingDate =
    litterRow?.actualKindlingDate ??
    (b?.matingDate &&
    (doeState === "pregnant" || doeState === "nursing" || doeState === "nursing_pregnant")
      ? expectedKindling(b.matingDate, 30)
      : null);

  return {
    current: b ?? null,
    prev: prev ?? null,
    prevOngoingLitter,
    litterRow: litterRow ?? null,
    countsRow: countsRow ?? null,
    isWeaned,
    rebreedReady,
    canMate,
    canTestPregnancy,
    canConfirmPalpation,
    palpationConfirmed,
    kindleActive,
    weanActive,
    testDate,
    kindlingDate,
  };
}
