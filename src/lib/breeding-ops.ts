import { differenceInCalendarDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { expectedKindling } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { BREEDING_OUTCOMES, type BreedingOutcome, PREGNANCY_TEST_RESULTS, type PregnancyTestResult, DOE_STATES, type DoeState } from "@/lib/enums";
import type { OpResult } from "@/lib/op-result";
import type { Breeding } from "@/generated/prisma/client";

/**
 * Looks up a promoted buck by tag number for the does board's "رقم الذكر"
 * field, which only ever shows/accepts tag numbers, not ids. A blank tag is
 * a deliberate "don't record a buck" — not an error. Callers are expected to
 * pre-check the tag with buckExists before mating, so in practice this only
 * ever resolves a tag that's already known to exist (or is blank).
 */
async function resolveBuckId(
  buckTagId?: string
): Promise<{ buckId: string | null; buckFound: boolean }> {
  const tagId = buckTagId?.trim();
  if (!tagId) return { buckId: null, buckFound: true };

  const buck = await prisma.rabbit.findFirst({
    where: { sex: "buck", tagId },
    select: { id: true },
  });
  return { buckId: buck?.id ?? null, buckFound: buck != null };
}

export type CreateBreedingInput = {
  buckId: string;
  doeId: string;
  matingDate: Date;
  actualKindlingDate: Date | null;
  outcome: BreedingOutcome;
  notes: string | null;
};

export async function createBreedingOp(
  data: CreateBreedingInput,
  opts?: { id?: string }
): Promise<Breeding> {
  const settings = await getSettings();

  return prisma.breeding.create({
    data: {
      id: opts?.id,
      buckId: data.buckId,
      doeId: data.doeId,
      matingDate: data.matingDate,
      expectedKindlingDate: expectedKindling(data.matingDate, settings.gestationDays),
      actualKindlingDate: data.actualKindlingDate,
      outcome: data.outcome,
      notes: data.notes,
    },
  });
}

export async function updateBreedingOp(
  id: string,
  data: CreateBreedingInput
): Promise<OpResult<{ breeding: Breeding; previousDoeId: string }, "NOT_FOUND">> {
  const existing = await prisma.breeding.findUnique({ where: { id } });
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  // Preserve the original gestation offset (snapshot) when the mating date moves.
  // Falls back to the farm default if the mating date had been cleared (failed mating).
  const offset = existing.matingDate
    ? differenceInCalendarDays(existing.expectedKindlingDate, existing.matingDate)
    : (await getSettings()).gestationDays;

  const breeding = await prisma.breeding.update({
    where: { id },
    data: {
      buckId: data.buckId,
      doeId: data.doeId,
      matingDate: data.matingDate,
      expectedKindlingDate: expectedKindling(data.matingDate, offset),
      actualKindlingDate: data.actualKindlingDate,
      outcome: data.outcome,
      notes: data.notes,
    },
  });

  return { ok: true, data: { breeding, previousDoeId: existing.doeId } };
}

/**
 * Pre-flight check for the "رقم الذكر" field: MateCell calls this before
 * submitting, so an unmatched tag blocks the mating entirely instead of
 * recording it with no buck and warning after the fact — on the mating
 * board especially, the doe leaves the "ready" list the instant she's
 * mated, so a warning shown only after submission is gone before anyone
 * can read it.
 */
export async function buckExistsOp(buckTagId: string): Promise<boolean> {
  const tagId = buckTagId.trim();
  if (!tagId) return true;
  const buck = await prisma.rabbit.findFirst({
    where: { sex: "buck", tagId },
    select: { id: true },
  });
  return buck != null;
}

/**
 * First mating for a doe that has no breeding row yet (she just got promoted
 * to the herd and appears on the does board without a cycle to attach
 * actions to). No buck is picked automatically — the farm types the buck's
 * tag number into the "رقم الذكر" field before pressing "تلقيح" if they want
 * to record it, or leaves it blank. Creates that first row so the standard
 * mate/kindle/wean flow (markMated, markKindled, ...) can take over from
 * here.
 */
export async function startBreedingOp(
  doeId: string,
  buckTagId?: string,
  opts?: { id?: string }
): Promise<{ buckFound: boolean }> {
  const settings = await getSettings();
  const matingDate = new Date();
  matingDate.setUTCHours(0, 0, 0, 0);
  const expectedKindlingDate = expectedKindling(matingDate, settings.gestationDays);
  const { buckId, buckFound } = await resolveBuckId(buckTagId);

  await prisma.$transaction([
    prisma.breeding.create({
      data: { id: opts?.id, doeId, buckId, matingDate, expectedKindlingDate },
    }),
    prisma.rabbit.update({
      where: { id: doeId },
      data: { doeState: "bred" },
    }),
  ]);

  return { buckFound };
}

/** Quick outcome change from the list/detail without opening the full form. */
export async function setBreedingOutcomeOp(id: string, outcome: string): Promise<Breeding> {
  if (!BREEDING_OUTCOMES.includes(outcome as BreedingOutcome)) {
    throw new Error(`Invalid outcome: ${outcome}`);
  }
  return prisma.breeding.update({
    where: { id },
    data: { outcome: outcome as BreedingOutcome },
  });
}

/** Quick pregnancy-test result change (the ~10-day-after-mating check). */
export async function setPregnancyTestResultOp(id: string, result: string): Promise<Breeding> {
  if (!PREGNANCY_TEST_RESULTS.includes(result as PregnancyTestResult)) {
    throw new Error(`Invalid pregnancy test result: ${result}`);
  }
  return prisma.breeding.update({
    where: { id },
    data: { pregnancyTestResult: result as PregnancyTestResult },
  });
}

/**
 * Quick "mate now" action from the does board: stamps today as the mating
 * date on this breeding row (تاريخ الجس / تاريخ الولادة are derived from
 * matingDate on render, so they update automatically) and flips the doe to
 * "bred". The buck tag typed into "رقم الذكر" (if any) is resolved and
 * recorded atomically with the mating — see resolveBuckId.
 *
 * If the doe is currently "nursing" (still feeding her current litter), a
 * fresh mating starts a *new* breeding row instead of overwriting the row
 * tied to her current litter's history — flips her to the combined
 * "nursing_bred" state, and the does board (one row per doe, latest breeding
 * only) now shows this new cycle instead of the ongoing litter.
 */
export async function markMatedOp(
  breedingId: string,
  doeId: string,
  buckTagId?: string,
  opts?: { id?: string }
): Promise<{ buckFound: boolean }> {
  const settings = await getSettings();
  const matingDate = new Date();
  matingDate.setUTCHours(0, 0, 0, 0);
  const expectedKindlingDate = expectedKindling(matingDate, settings.gestationDays);
  const { buckId, buckFound } = await resolveBuckId(buckTagId);

  const doe = await prisma.rabbit.findUnique({
    where: { id: doeId },
    select: { doeState: true },
  });

  if (doe?.doeState === "nursing") {
    await prisma.$transaction([
      prisma.breeding.create({
        data: {
          id: opts?.id,
          doeId,
          buckId,
          matingDate,
          expectedKindlingDate,
        },
      }),
      prisma.rabbit.update({
        where: { id: doeId },
        data: { doeState: "nursing_bred" },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.breeding.update({
        where: { id: breedingId },
        // Clear any actualKindlingDate/nestBoxDate left over from a previous
        // cycle on this same row (see markKindled/installNestBox) so a fresh
        // mating doesn't inherit a stale birth date or nest-box flag; buckId
        // is overwritten with this cycle's value.
        data: {
          matingDate,
          expectedKindlingDate,
          actualKindlingDate: null,
          nestBoxDate: null,
          buckId,
        },
      }),
      prisma.rabbit.update({
        where: { id: doeId },
        data: { doeState: "bred" },
      }),
    ]);
  }

  return { buckFound };
}

/**
 * "عشار" from the does/pregnancy-test board: confirms a positive pregnancy
 * test. Snapshots this breeding row's matingDate/buckId into a permanent
 * PregnancyTestLog entry — needed because the Breeding row itself gets
 * reused (its matingDate/buckId overwritten) the next time this doe is
 * mated, which would otherwise silently erase this result from history.
 */
export async function confirmPregnantOp(
  breedingId: string,
  doeId: string,
  target: string
): Promise<void> {
  if (!DOE_STATES.includes(target as DoeState)) {
    throw new Error(`Invalid doe state: ${target}`);
  }
  const breeding = await prisma.breeding.findUnique({
    where: { id: breedingId },
    select: { matingDate: true, buckId: true },
  });
  if (!breeding?.matingDate) {
    throw new Error("Breeding has no mating date to confirm");
  }

  await prisma.$transaction([
    prisma.pregnancyTestLog.create({
      data: {
        doeId,
        buckId: breeding.buckId,
        matingDate: breeding.matingDate,
        result: "positive",
      },
    }),
    prisma.rabbit.update({
      where: { id: doeId },
      data: { doeState: target as DoeState },
    }),
  ]);
}

/**
 * "تركيب بيت الولادة" from the /nest-box board: stamps today as the date the
 * nest box was installed for this cycle so the doe can start preparing it a
 * few days before she's due to kindle. Per-cycle checklist item, not
 * permanent breeding/pedigree history (unlike PregnancyTestLog/KindlingLog),
 * so it lives directly on the Breeding row and is reset back to null
 * wherever matingDate itself is reset/overwritten for a new cycle (see
 * markMated's reuse branch, markMatingFailed, clearDoeRow).
 */
export async function installNestBoxOp(breedingId: string): Promise<Breeding> {
  const nestBoxDate = new Date();
  nestBoxDate.setUTCHours(0, 0, 0, 0);

  return prisma.breeding.update({
    where: { id: breedingId },
    data: { nestBoxDate },
  });
}

/**
 * "ولادة" from the does board: confirms today as the actual kindling date
 * (frozen independently of matingDate, so تاريخ الولادة keeps showing while
 * nursing) and clears تاريخ التلقيح, since that mating cycle is now complete.
 * Also clears any leftover weaningDate on this row's litter from a
 * *previous* cycle (a re-mated doe reuses the same breeding row) — needed so
 * this fresh, not-yet-weaned nursing cycle doesn't read as already weaned.
 * "عدد الفطام" itself is left untouched here; it's only ever reset by
 * "فطام" (a fresh weaning event) or "مسح", never by a new kindling.
 *
 * Also snapshots this breeding row's matingDate/buckId into a permanent
 * KindlingLog entry — needed because the row's actualKindlingDate/matingDate
 * are overwritten (see markMated's reuse branch) the next time this doe is
 * mated, which would otherwise silently erase this birth from history.
 *
 * Requires a mating date on the row — offline replay is the first scenario
 * where the client's belief of state can be stale (the button is otherwise
 * always disabled by the UI unless this holds today).
 */
export async function markKindledOp(
  breedingId: string,
  doeId: string
): Promise<OpResult<void, "NO_MATING_DATE">> {
  const actualKindlingDate = new Date();
  actualKindlingDate.setUTCHours(0, 0, 0, 0);

  const breeding = await prisma.breeding.findUniqueOrThrow({
    where: { id: breedingId },
    select: { matingDate: true, buckId: true },
  });
  if (!breeding.matingDate) {
    return { ok: false, code: "NO_MATING_DATE" };
  }

  await prisma.$transaction([
    prisma.kindlingLog.create({
      data: {
        doeId,
        buckId: breeding.buckId,
        matingDate: breeding.matingDate,
        kindlingDate: actualKindlingDate,
      },
    }),
    prisma.breeding.update({
      where: { id: breedingId },
      data: { matingDate: null, actualKindlingDate },
    }),
    prisma.litter.updateMany({
      where: { breedingId },
      data: { weaningDate: null },
    }),
    prisma.rabbit.update({
      where: { id: doeId },
      data: { doeState: "nursing" },
    }),
  ]);

  return { ok: true, data: undefined };
}

/**
 * "فطام" from the does board: stamps today as the weaning date on this row's
 * litter, leaving "عدد المواليد" (bornAlive/bornDead) already entered (via
 * "سجل الولادات" or the does board) untouched, ready for "عدد الفطام" to be
 * entered next in "سجل الفطام". Upserts the litter since the board's quick
 * "ولادة" never creates one (only the detailed kindling form on the breeding
 * page records bornAlive/bornDead).
 * Flips the doe to "bred" if she was already "مرضعة و ملقحة" (rebred while
 * nursing, not yet tested), to "pregnant" if she was "مرضعة و عشار" (rebred
 * and already confirmed pregnant) or already plain "pregnant" (next cycle
 * confirmed before weaning the old litter), so her in-progress next cycle
 * isn't erased; otherwise back to "empty".
 */
export async function markWeanedOp(breedingId: string, doeId: string): Promise<void> {
  const weaningDate = new Date();
  weaningDate.setUTCHours(0, 0, 0, 0);

  const [breeding, doe] = await Promise.all([
    prisma.breeding.findUniqueOrThrow({
      where: { id: breedingId },
      select: { actualKindlingDate: true },
    }),
    prisma.rabbit.findUnique({ where: { id: doeId }, select: { doeState: true } }),
  ]);
  const nextState =
    doe?.doeState === "nursing_bred"
      ? "bred"
      : doe?.doeState === "pregnant" || doe?.doeState === "nursing_pregnant"
        ? "pregnant"
        : "empty";

  await prisma.$transaction([
    prisma.litter.upsert({
      where: { breedingId },
      create: {
        breedingId,
        kindlingDate: breeding.actualKindlingDate ?? weaningDate,
        weaningDate,
      },
      update: { weaningDate },
    }),
    prisma.rabbit.update({
      where: { id: doeId },
      data: { doeState: nextState },
    }),
  ]);
}

/**
 * Inline edit of "حي" / "نافق" / "عدد الفطام" from the does board. Upserts the
 * litter (same reasoning as markWeaned: the board's quick "ولادة" doesn't
 * create one) and writes only the touched field, leaving the others at their
 * current value.
 *
 * If this brings "حي" down to 0 for a doe in any nursing state, there's
 * nothing left to feed — she's dropped out of that nursing leg the same way
 * markWeaned resolves it: "nursing_bred" -> "bred", "nursing_pregnant" ->
 * "pregnant" (an in-progress rebreed is preserved either way), plain
 * "nursing" -> "empty".
 */
export async function setLitterCountOp(
  breedingId: string,
  field: "bornAlive" | "bornDead" | "weaned",
  value: number | null
): Promise<OpResult<void, "WEANED_EXCEEDS_BORN_ALIVE">> {
  const [breeding, litter] = await Promise.all([
    prisma.breeding.findUniqueOrThrow({
      where: { id: breedingId },
      select: { actualKindlingDate: true, doeId: true, doe: { select: { doeState: true } } },
    }),
    prisma.litter.findUnique({
      where: { breedingId },
      select: { bornAlive: true, weaned: true },
    }),
  ]);

  const bornAlive = field === "bornAlive" ? (value ?? 0) : undefined;
  const bornDead = field === "bornDead" ? (value ?? 0) : undefined;
  const weaned = field === "weaned" ? value : undefined;

  // Same weaned <= bornAlive invariant the form-based path (litterSchema)
  // enforces — this quick-edit input writes straight to Prisma, so it needs
  // its own check or it can produce a >100% survival rate.
  const effectiveBornAlive = bornAlive ?? litter?.bornAlive ?? 0;
  const effectiveWeaned = field === "weaned" ? value : (litter?.weaned ?? null);
  if (effectiveWeaned !== null && effectiveWeaned > effectiveBornAlive) {
    return { ok: false, code: "WEANED_EXCEEDS_BORN_ALIVE" };
  }

  const dropsNursing =
    field === "bornAlive" &&
    effectiveBornAlive === 0 &&
    !!breeding.actualKindlingDate &&
    (breeding.doe.doeState === "nursing" ||
      breeding.doe.doeState === "nursing_bred" ||
      breeding.doe.doeState === "nursing_pregnant");
  const nextState = dropsNursing
    ? breeding.doe.doeState === "nursing_bred"
      ? ("bred" as const)
      : breeding.doe.doeState === "nursing_pregnant"
        ? ("pregnant" as const)
        : ("empty" as const)
    : null;

  await prisma.$transaction([
    prisma.litter.upsert({
      where: { breedingId },
      create: {
        breedingId,
        kindlingDate: breeding.actualKindlingDate ?? new Date(),
        bornAlive: bornAlive ?? 0,
        bornDead: bornDead ?? 0,
        weaned: weaned ?? null,
      },
      update: { bornAlive, bornDead, weaned },
    }),
    ...(nextState
      ? [prisma.rabbit.update({ where: { id: breeding.doeId }, data: { doeState: nextState } })]
      : []),
  ]);

  return { ok: true, data: undefined };
}

/**
 * "الوزن (جم)" inline edit on سجل الفطام — total litter weight in grams at
 * weaning. Upserts for the same reason setLitterCount does: the board's
 * quick "فطام" action doesn't create a litter row by itself.
 */
export async function setLitterWeaningWeightOp(
  breedingId: string,
  weaningWeightGrams: number | null
): Promise<OpResult<void, "INVALID_VALUE">> {
  if (
    weaningWeightGrams !== null &&
    (!Number.isInteger(weaningWeightGrams) || weaningWeightGrams < 0)
  ) {
    return { ok: false, code: "INVALID_VALUE" };
  }

  const breeding = await prisma.breeding.findUniqueOrThrow({
    where: { id: breedingId },
    select: { actualKindlingDate: true },
  });

  await prisma.litter.upsert({
    where: { breedingId },
    create: {
      breedingId,
      kindlingDate: breeding.actualKindlingDate ?? new Date(),
      weaningWeightGrams,
    },
    update: { weaningWeightGrams },
  });

  return { ok: true, data: undefined };
}

/**
 * "تسجيل نافق" from the daily mortality census (/mortality): one or more
 * nursing kits died before weaning. Moves `count` units from "حي" to "نافق"
 * atomically — quicker and less error-prone than recomputing both counts by
 * hand via setLitterCount.
 */
export async function recordNursingKitDeathOp(
  breedingId: string,
  count: number = 1
): Promise<OpResult<void, "NO_NURSING_KITS">> {
  const litter = await prisma.litter.findUnique({
    where: { breedingId },
    select: { bornAlive: true },
  });
  if (!litter || litter.bornAlive <= 0 || count < 1 || count > litter.bornAlive) {
    return { ok: false, code: "NO_NURSING_KITS" };
  }

  await prisma.litter.update({
    where: { breedingId },
    data: { bornAlive: { decrement: count }, bornDead: { increment: count } },
  });

  return { ok: true, data: undefined };
}

/**
 * "فشل التلقيح" / "سالبة" from the does board: snapshots this breeding row's
 * matingDate/buckId into a permanent PregnancyTestLog entry (result:
 * "negative") before clearing the mating date on the row itself (تاريخ الجس
 * / تاريخ الولادة are derived from matingDate, so they clear automatically)
 * and flipping the doe back to "empty". Without this snapshot the negative
 * result would leave no trace at all, since the row is either wiped or
 * reused for the doe's next mating.
 *
 * If the doe is "nursing_bred", this row is the fresh rebreed attempt created
 * by markMated (not her current litter's breeding) — discard it entirely so
 * the board reverts to showing her still-ongoing litter, and drop her back to
 * plain "nursing" rather than "empty".
 */
export async function markMatingFailedOp(breedingId: string, doeId: string): Promise<void> {
  const [doe, breeding] = await Promise.all([
    prisma.rabbit.findUnique({ where: { id: doeId }, select: { doeState: true } }),
    prisma.breeding.findUnique({
      where: { id: breedingId },
      select: { matingDate: true, buckId: true },
    }),
  ]);

  const logEntry = breeding?.matingDate
    ? prisma.pregnancyTestLog.create({
        data: {
          doeId,
          buckId: breeding.buckId,
          matingDate: breeding.matingDate,
          result: "negative",
        },
      })
    : null;

  if (doe?.doeState === "nursing_bred") {
    await prisma.$transaction([
      ...(logEntry ? [logEntry] : []),
      prisma.breeding.delete({ where: { id: breedingId } }),
      prisma.syncTombstone.create({ data: { model: "breeding", recordId: breedingId } }),
      prisma.rabbit.update({
        where: { id: doeId },
        data: { doeState: "nursing" },
      }),
    ]);
  } else {
    await prisma.$transaction([
      ...(logEntry ? [logEntry] : []),
      prisma.breeding.update({
        where: { id: breedingId },
        data: { matingDate: null, nestBoxDate: null },
      }),
      prisma.rabbit.update({
        where: { id: doeId },
        data: { doeState: "empty" },
      }),
    ]);
  }
}

/**
 * "مسح" from the does board: wipes this breeding cycle's data (mating date,
 * buck, actual kindling date, and the associated litter) and resets the doe
 * to "فاضية", as if she'd never been bred on this row. The breeding row
 * itself is kept (not deleted), not the litter, so the does board still
 * shows her and "تلقيح" can reuse the row in place, matching markMated's
 * empty-state semantics.
 */
export async function clearDoeRowOp(breedingId: string, doeId: string): Promise<void> {
  // Litter is 1:1 with Breeding (breedingId is @unique), so at most one row
  // is ever removed here — fetched first because deleteMany() doesn't hand
  // back the id the tombstone needs to tell other devices which local row
  // to drop (see SyncTombstone).
  const existingLitter = await prisma.litter.findUnique({ where: { breedingId }, select: { id: true } });

  await prisma.$transaction([
    prisma.litter.deleteMany({ where: { breedingId } }),
    ...(existingLitter
      ? [prisma.syncTombstone.create({ data: { model: "litter", recordId: existingLitter.id } })]
      : []),
    prisma.breeding.update({
      where: { id: breedingId },
      data: { matingDate: null, actualKindlingDate: null, nestBoxDate: null, buckId: null },
    }),
    prisma.rabbit.update({
      where: { id: doeId },
      data: { doeState: "empty" },
    }),
  ]);
}

/**
 * Manual correction of the mating date from the does board (e.g. it was
 * logged a day late). Recomputes expectedKindlingDate from the farm's
 * gestation setting; expectedKindlingDate can't be null, so it's left
 * untouched when the date is cleared.
 */
export async function setMatingDateOp(breedingId: string, matingDate: Date | null): Promise<Breeding> {
  const data: { matingDate: Date | null; expectedKindlingDate?: Date } = {
    matingDate,
  };
  if (matingDate) {
    const settings = await getSettings();
    data.expectedKindlingDate = expectedKindling(matingDate, settings.gestationDays);
  }

  return prisma.breeding.update({ where: { id: breedingId }, data });
}

export type RecordKindlingInput = {
  kindlingDate: Date;
  bornAlive: number;
  bornDead: number;
  weaned: number | null;
  weaningDate: Date | null;
  notes: string | null;
};

/**
 * Record a kindling: creates the Litter (1:1 with the breeding), marks the
 * breeding successful, and stamps the actual kindling date. Idempotent-ish:
 * refuses if a litter already exists.
 */
export async function recordKindlingOp(
  breedingId: string,
  data: RecordKindlingInput
): Promise<OpResult<{ doeId: string }, "LITTER_ALREADY_EXISTS">> {
  const existing = await prisma.litter.findUnique({ where: { breedingId } });
  if (existing) {
    return { ok: false, code: "LITTER_ALREADY_EXISTS" };
  }

  const breeding = await prisma.breeding.findUniqueOrThrow({
    where: { id: breedingId },
    select: { doeId: true, buckId: true, matingDate: true, doe: { select: { doeState: true } } },
  });

  // Same doeState invariant markKindled/markWeaned enforce from the does
  // board — this form is an alternate entry point for the same event and
  // must leave the doe in a state /kindling and /weaning can find her by,
  // and log the birth to KindlingLog so "سجل الولادات" doesn't miss it.
  const doeState = data.weaningDate
    ? breeding.doe.doeState === "nursing_bred"
      ? "bred"
      : breeding.doe.doeState === "pregnant" || breeding.doe.doeState === "nursing_pregnant"
        ? "pregnant"
        : "empty"
    : "nursing";

  await prisma.$transaction([
    prisma.litter.create({
      data: {
        breedingId,
        kindlingDate: data.kindlingDate,
        bornAlive: data.bornAlive,
        bornDead: data.bornDead,
        weaned: data.weaned,
        weaningDate: data.weaningDate,
        notes: data.notes,
      },
    }),
    prisma.breeding.update({
      where: { id: breedingId },
      data: { outcome: "successful", actualKindlingDate: data.kindlingDate },
    }),
    prisma.kindlingLog.create({
      data: {
        doeId: breeding.doeId,
        buckId: breeding.buckId,
        matingDate: breeding.matingDate,
        kindlingDate: data.kindlingDate,
      },
    }),
    prisma.rabbit.update({
      where: { id: breeding.doeId },
      data: { doeState },
    }),
  ]);

  return { ok: true, data: { doeId: breeding.doeId } };
}

/**
 * Resolves a doe's current (unweaned) nursing litter by tag number, for the
 * fostering form — same "current litter" resolution duplicated on
 * /does, /weaning, /mortality (a doe rebred while still nursing has her
 * ongoing litter on the *previous* breeding row, not her latest one).
 */
async function resolveCurrentLitter(
  tagId: string
): Promise<
  | { ok: true; doeId: string; breedingId: string; bornAlive: number }
  | { ok: false; code: "DOE_NOT_FOUND" | "NO_CURRENT_LITTER" }
> {
  const doe = await prisma.rabbit.findFirst({
    where: { sex: "doe", tagId },
    select: {
      id: true,
      breedingsAsDoe: {
        orderBy: { createdAt: "desc" },
        take: 2,
        select: {
          id: true,
          actualKindlingDate: true,
          litter: { select: { bornAlive: true, weaningDate: true } },
        },
      },
    },
  });
  if (!doe) return { ok: false, code: "DOE_NOT_FOUND" };

  const [b, prev] = doe.breedingsAsDoe;
  const prevOngoingLitter =
    !!prev?.actualKindlingDate && !prev?.litter?.weaningDate && !b?.actualKindlingDate;
  const litterRow = prevOngoingLitter ? prev : b;
  const litter = litterRow?.litter;
  if (!litterRow || !litter || litter.weaningDate) {
    return { ok: false, code: "NO_CURRENT_LITTER" };
  }
  return { ok: true, doeId: doe.id, breedingId: litterRow.id, bornAlive: litter.bornAlive };
}

export type TransferKitsInput = {
  fromTagId: string;
  toTagId: string;
  count: number;
};

export type TransferKitsError =
  | { field: "fromTagId"; code: "DOE_NOT_FOUND" | "NO_CURRENT_LITTER"; tagId: string }
  | { field: "toTagId"; code: "DOE_NOT_FOUND" | "NO_CURRENT_LITTER"; tagId: string }
  | { field: "count"; code: "NOT_ENOUGH_BORN_ALIVE"; tagId: string; available: number };

/**
 * "عمليات التبني": moves a number of nursing kits from one doe's current
 * litter to another's, to equalize litter sizes. Atomically decrements the
 * source litter's bornAlive and increments the destination's, and writes a
 * permanent FosterLog entry (see schema comment — can't live on Breeding
 * since it spans two does and those rows get reused/reset).
 */
export async function transferKitsOp(
  data: TransferKitsInput
): Promise<OpResult<{ fromDoeId: string; toDoeId: string }, TransferKitsError>> {
  const [from, to] = await Promise.all([
    resolveCurrentLitter(data.fromTagId),
    resolveCurrentLitter(data.toTagId),
  ]);
  if (!from.ok) return { ok: false, code: { field: "fromTagId", code: from.code, tagId: data.fromTagId } };
  if (!to.ok) return { ok: false, code: { field: "toTagId", code: to.code, tagId: data.toTagId } };
  if (from.bornAlive < data.count) {
    return {
      ok: false,
      code: { field: "count", code: "NOT_ENOUGH_BORN_ALIVE", tagId: data.fromTagId, available: from.bornAlive },
    };
  }

  await prisma.$transaction([
    prisma.litter.update({
      where: { breedingId: from.breedingId },
      data: { bornAlive: { decrement: data.count } },
    }),
    prisma.litter.update({
      where: { breedingId: to.breedingId },
      data: { bornAlive: { increment: data.count } },
    }),
    prisma.fosterLog.create({
      data: { fromDoeId: from.doeId, toDoeId: to.doeId, count: data.count },
    }),
  ]);

  return { ok: true, data: { fromDoeId: from.doeId, toDoeId: to.doeId } };
}
