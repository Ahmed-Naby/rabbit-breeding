"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { breedingSchema, litterSchema, fosterSchema } from "@/lib/validations";
import { fromDateInputValue, expectedKindling } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import {
  BREEDING_OUTCOMES,
  type BreedingOutcome,
  PREGNANCY_TEST_RESULTS,
  type PregnancyTestResult,
  DOE_STATES,
  type DoeState,
} from "@/lib/enums";
import { type FormState, zodErrors, formDataToObject } from "@/lib/form";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export async function createBreeding(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { t } = await getDictionary();
  const parsed = breedingSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error) };
  }
  const data = parsed.data;
  const settings = await getSettings();
  const matingDate = fromDateInputValue(data.matingDate);

  const breeding = await prisma.breeding.create({
    data: {
      buckId: data.buckId,
      doeId: data.doeId,
      matingDate,
      expectedKindlingDate: expectedKindling(matingDate, settings.gestationDays),
      actualKindlingDate: data.actualKindlingDate
        ? fromDateInputValue(data.actualKindlingDate)
        : null,
      outcome: data.outcome,
      notes: data.notes ?? null,
    },
  });

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/rabbits/${data.doeId}`);
  redirect(`/breedings/${breeding.id}`);
}

export async function updateBreeding(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { t } = await getDictionary();
  const parsed = breedingSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error) };
  }
  const data = parsed.data;

  const existing = await prisma.breeding.findUnique({ where: { id } });
  if (!existing) return { ok: false, message: t.breedings.notFound };

  // Preserve the original gestation offset (snapshot) when the mating date moves.
  // Falls back to the farm default if the mating date had been cleared (failed mating).
  const offset = existing.matingDate
    ? differenceInCalendarDays(existing.expectedKindlingDate, existing.matingDate)
    : (await getSettings()).gestationDays;
  const matingDate = fromDateInputValue(data.matingDate);

  await prisma.breeding.update({
    where: { id },
    data: {
      buckId: data.buckId,
      doeId: data.doeId,
      matingDate,
      expectedKindlingDate: expectedKindling(matingDate, offset),
      actualKindlingDate: data.actualKindlingDate
        ? fromDateInputValue(data.actualKindlingDate)
        : null,
      outcome: data.outcome,
      notes: data.notes ?? null,
    },
  });

  // Any of matingDate/actualKindlingDate/buckId/doeId/outcome can change what
  // the does/mating/pregnancy-test/kindling/weaning boards show for this
  // cycle, and doeId itself can move this row to a different rabbit's page.
  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/rabbits/${data.doeId}`);
  if (existing.doeId !== data.doeId) revalidatePath(`/rabbits/${existing.doeId}`);
  revalidatePath(`/breedings/${id}`);
  redirect(`/breedings/${id}`);
}

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

/**
 * Pre-flight check for the "رقم الذكر" field: MateCell calls this before
 * submitting, so an unmatched tag blocks the mating entirely instead of
 * recording it with no buck and warning after the fact — on the mating
 * board especially, the doe leaves the "ready" list the instant she's
 * mated, so a warning shown only after submission is gone before anyone
 * can read it.
 */
export async function buckExists(buckTagId: string): Promise<boolean> {
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
export async function startBreeding(
  doeId: string,
  buckTagId?: string
): Promise<{ ok: true; buckFound: boolean }> {
  const settings = await getSettings();
  const matingDate = new Date();
  matingDate.setUTCHours(0, 0, 0, 0);
  const expectedKindlingDate = expectedKindling(matingDate, settings.gestationDays);
  const { buckId, buckFound } = await resolveBuckId(buckTagId);

  await prisma.$transaction([
    prisma.breeding.create({
      data: { doeId, buckId, matingDate, expectedKindlingDate },
    }),
    prisma.rabbit.update({
      where: { id: doeId },
      data: { doeState: "bred" },
    }),
  ]);

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/rabbits/${doeId}`);

  return { ok: true, buckFound };
}

/** Quick outcome change from the list/detail without opening the full form. */
export async function setBreedingOutcome(id: string, outcome: string) {
  if (!BREEDING_OUTCOMES.includes(outcome as BreedingOutcome)) {
    throw new Error(`Invalid outcome: ${outcome}`);
  }
  await prisma.breeding.update({
    where: { id },
    data: { outcome: outcome as BreedingOutcome },
  });
  revalidatePath(`/breedings/${id}`);
}

/** Quick pregnancy-test result change (the ~10-day-after-mating check). */
export async function setPregnancyTestResult(id: string, result: string) {
  if (!PREGNANCY_TEST_RESULTS.includes(result as PregnancyTestResult)) {
    throw new Error(`Invalid pregnancy test result: ${result}`);
  }
  await prisma.breeding.update({
    where: { id },
    data: { pregnancyTestResult: result as PregnancyTestResult },
  });
  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${id}`);
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
export async function markMated(
  breedingId: string,
  doeId: string,
  buckTagId?: string
): Promise<{ ok: true; buckFound: boolean }> {
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

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);

  return { ok: true, buckFound };
}

/**
 * "عشار" from the does/pregnancy-test board: confirms a positive pregnancy
 * test. Snapshots this breeding row's matingDate/buckId into a permanent
 * PregnancyTestLog entry — needed because the Breeding row itself gets
 * reused (its matingDate/buckId overwritten) the next time this doe is
 * mated, which would otherwise silently erase this result from history.
 */
export async function confirmPregnant(breedingId: string, doeId: string, target: string) {
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

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/rabbits/${doeId}`);
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
export async function installNestBox(breedingId: string, doeId: string) {
  const nestBoxDate = new Date();
  nestBoxDate.setUTCHours(0, 0, 0, 0);

  await prisma.breeding.update({
    where: { id: breedingId },
    data: { nestBoxDate },
  });

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
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
 */
export async function markKindled(breedingId: string, doeId: string) {
  const actualKindlingDate = new Date();
  actualKindlingDate.setUTCHours(0, 0, 0, 0);

  const breeding = await prisma.breeding.findUniqueOrThrow({
    where: { id: breedingId },
    select: { matingDate: true, buckId: true },
  });

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

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
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
export async function markWeaned(breedingId: string, doeId: string) {
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

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
}

/**
 * Inline edit of "حي" / "نافق" / "عدد الفطام" from the does board. Upserts the
 * litter (same reasoning as markWeaned: the board's quick "ولادة" doesn't
 * create one) and writes only the touched field, leaving the others at their
 * current value.
 */
export async function setLitterCount(
  breedingId: string,
  field: "bornAlive" | "bornDead" | "weaned",
  value: number | null
): Promise<{ ok: boolean; message?: string }> {
  const [breeding, litter] = await Promise.all([
    prisma.breeding.findUniqueOrThrow({
      where: { id: breedingId },
      select: { actualKindlingDate: true },
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
    const { t } = await getDictionary();
    return { ok: false, message: t.breedings.weanedExceedsBornAlive };
  }

  await prisma.litter.upsert({
    where: { breedingId },
    create: {
      breedingId,
      kindlingDate: breeding.actualKindlingDate ?? new Date(),
      bornAlive: bornAlive ?? 0,
      bornDead: bornDead ?? 0,
      weaned: weaned ?? null,
    },
    update: { bornAlive, bornDead, weaned },
  });

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${breedingId}`);
  return { ok: true };
}

/**
 * "+1 نافق" from the daily mortality census (/mortality): a nursing kit died
 * before weaning. Moves one unit from "حي" to "نافق" atomically — quicker and
 * less error-prone than recomputing both counts by hand via setLitterCount,
 * since the person recording this just watched one kit die and doesn't want
 * to do subtraction in their head.
 */
export async function recordNursingKitDeath(
  breedingId: string
): Promise<{ ok: boolean; message?: string }> {
  const litter = await prisma.litter.findUnique({
    where: { breedingId },
    select: { bornAlive: true },
  });
  if (!litter || litter.bornAlive <= 0) {
    const { t } = await getDictionary();
    return { ok: false, message: t.breedings.noNursingKitsToRecordDeath };
  }

  await prisma.litter.update({
    where: { breedingId },
    data: { bornAlive: { decrement: 1 }, bornDead: { increment: 1 } },
  });

  revalidatePath("/does");
  revalidatePath("/mortality");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${breedingId}`);
  return { ok: true };
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
export async function markMatingFailed(breedingId: string, doeId: string) {
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

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
}

/**
 * "مسح" from the does board: wipes this breeding cycle's data (mating date,
 * buck, actual kindling date, and the associated litter) and resets the doe
 * to "فاضية", as if she'd never been bred on this row. The breeding row
 * itself is kept (not deleted), not the litter, so the does board still
 * shows her and "تلقيح" can reuse the row in place, matching markMated's
 * empty-state semantics.
 */
export async function clearDoeRow(breedingId: string, doeId: string) {
  await prisma.$transaction([
    prisma.litter.deleteMany({ where: { breedingId } }),
    prisma.breeding.update({
      where: { id: breedingId },
      data: { matingDate: null, actualKindlingDate: null, nestBoxDate: null, buckId: null },
    }),
    prisma.rabbit.update({
      where: { id: doeId },
      data: { doeState: "empty" },
    }),
  ]);

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
}

/**
 * Manual correction of the mating date from the does board (e.g. it was
 * logged a day late). Recomputes expectedKindlingDate from the farm's
 * gestation setting; expectedKindlingDate can't be null, so it's left
 * untouched when the date is cleared.
 */
export async function setMatingDate(breedingId: string, value: string) {
  const matingDate = value ? fromDateInputValue(value) : null;
  const data: { matingDate: Date | null; expectedKindlingDate?: Date } = {
    matingDate,
  };
  if (matingDate) {
    const settings = await getSettings();
    data.expectedKindlingDate = expectedKindling(matingDate, settings.gestationDays);
  }

  await prisma.breeding.update({ where: { id: breedingId }, data });

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/breedings/${breedingId}`);
}

/**
 * Record a kindling: creates the Litter (1:1 with the breeding), marks the
 * breeding successful, and stamps the actual kindling date. Idempotent-ish:
 * refuses if a litter already exists.
 */
export async function recordKindling(
  breedingId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { t } = await getDictionary();
  const parsed = litterSchema(t.validation).safeParse({
    ...formDataToObject(formData),
    breedingId,
  });
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error) };
  }
  const data = parsed.data;

  const existing = await prisma.litter.findUnique({ where: { breedingId } });
  if (existing) {
    return { ok: false, message: t.breedings.litterAlreadyExists };
  }

  const breeding = await prisma.breeding.findUniqueOrThrow({
    where: { id: breedingId },
    select: { doeId: true, buckId: true, matingDate: true, doe: { select: { doeState: true } } },
  });

  const kindlingDate = fromDateInputValue(data.kindlingDate);
  const weaningDate = data.weaningDate ? fromDateInputValue(data.weaningDate) : null;
  // Same doeState invariant markKindled/markWeaned enforce from the does
  // board — this form is an alternate entry point for the same event and
  // must leave the doe in a state /kindling and /weaning can find her by,
  // and log the birth to KindlingLog so "سجل الولادات" doesn't miss it.
  const doeState = weaningDate
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
        kindlingDate,
        bornAlive: data.bornAlive,
        bornDead: data.bornDead,
        weaned: data.weaned ?? null,
        weaningDate,
        notes: data.notes ?? null,
      },
    }),
    prisma.breeding.update({
      where: { id: breedingId },
      data: { outcome: "successful", actualKindlingDate: kindlingDate },
    }),
    prisma.kindlingLog.create({
      data: {
        doeId: breeding.doeId,
        buckId: breeding.buckId,
        matingDate: breeding.matingDate,
        kindlingDate,
      },
    }),
    prisma.rabbit.update({
      where: { id: breeding.doeId },
      data: { doeState },
    }),
  ]);

  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/rabbits/${breeding.doeId}`);
  revalidatePath(`/breedings/${breedingId}`);
  redirect(`/breedings/${breedingId}`);
}

/**
 * Resolves a doe's current (unweaned) nursing litter by tag number, for the
 * fostering form — same "current litter" resolution duplicated on
 * /does, /weaning, /mortality (a doe rebred while still nursing has her
 * ongoing litter on the *previous* breeding row, not her latest one).
 */
async function resolveCurrentLitter(
  tagId: string,
  t: Dictionary["breedings"]
): Promise<
  | { ok: true; doeId: string; breedingId: string; bornAlive: number }
  | { ok: false; message: string }
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
  if (!doe) return { ok: false, message: t.doeNotFound(tagId) };

  const [b, prev] = doe.breedingsAsDoe;
  const prevOngoingLitter =
    !!prev?.actualKindlingDate && !prev?.litter?.weaningDate && !b?.actualKindlingDate;
  const litterRow = prevOngoingLitter ? prev : b;
  const litter = litterRow?.litter;
  if (!litterRow || !litter || litter.weaningDate) {
    return { ok: false, message: t.noCurrentLitter(tagId) };
  }
  return { ok: true, doeId: doe.id, breedingId: litterRow.id, bornAlive: litter.bornAlive };
}

/**
 * "عمليات التبني": moves a number of nursing kits from one doe's current
 * litter to another's, to equalize litter sizes. Atomically decrements the
 * source litter's bornAlive and increments the destination's, and writes a
 * permanent FosterLog entry (see schema comment — can't live on Breeding
 * since it spans two does and those rows get reused/reset).
 */
export async function transferKits(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { t } = await getDictionary();
  const parsed = fosterSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error) };
  }
  const data = parsed.data;

  const [from, to] = await Promise.all([
    resolveCurrentLitter(data.fromTagId, t.breedings),
    resolveCurrentLitter(data.toTagId, t.breedings),
  ]);
  if (!from.ok) return { ok: false, errors: { fromTagId: from.message } };
  if (!to.ok) return { ok: false, errors: { toTagId: to.message } };
  if (from.bornAlive < data.count) {
    return {
      ok: false,
      errors: { count: t.breedings.notEnoughBornAlive(data.fromTagId, from.bornAlive) },
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

  revalidatePath("/does");
  revalidatePath("/fostering");
  revalidatePath("/mortality");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/rabbits/${from.doeId}`);
  revalidatePath(`/rabbits/${to.doeId}`);

  return { ok: true, message: t.breedings.transferSuccessToast };
}
