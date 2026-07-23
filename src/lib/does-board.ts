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

  // A nursing doe only re-enters mating once the configured rebreed
  // system's cooldown since her kindling has elapsed (0/15/30 days,
  // intensive/semi-intensive/natural, set in Settings). No kindling date on
  // record means nothing to gate against.
  const rebreedReady =
    !litterRow?.actualKindlingDate ||
    daysUntil(rebreedDueDate(litterRow.actualKindlingDate, settings.rebreedAfterKindlingDays)) <= 0;

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
    kindleActive,
    weanActive,
    testDate,
    kindlingDate,
  };
}
