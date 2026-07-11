"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  rabbitSchema,
  quickRabbitSchema,
  saveQuickRabbitCageSchema,
  saveQuickRabbitWeightSchema,
  finalizeMotherSchema,
  finalizeBuckSchema,
  createMotherSchema,
  createBuckSchema,
} from "@/lib/validations";
import { fromDateInputValue } from "@/lib/dates";
import { toGrams } from "@/lib/units";
import {
  RABBIT_STATUSES,
  type RabbitStatus,
  DOE_STATES,
  type DoeState,
} from "@/lib/enums";
import {
  type FormState,
  zodErrors,
  formDataToObject,
} from "@/lib/form";
import { Prisma } from "@/generated/prisma/client";

function buildData(input: ReturnType<typeof rabbitSchema.parse>) {
  return {
    tagId: input.tagId,
    breed: input.breed ?? null,
    color: input.color ?? null,
    sex: input.sex,
    status: input.status,
    cage: input.cage ?? null,
    dateOfBirth: input.dateOfBirth
      ? fromDateInputValue(input.dateOfBirth)
      : null,
    acquiredDate: input.acquiredDate
      ? fromDateInputValue(input.acquiredDate)
      : null,
    acquiredFrom: input.acquiredFrom ?? null,
    sireId: input.sireId ?? null,
    damId: input.damId ?? null,
    notes: input.notes ?? null,
    photoUrl: input.photoUrl ?? null,
    litterId: input.litterId ?? null,
  };
}

export async function createRabbit(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = rabbitSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error) };
  }

  let id: string;
  try {
    // Only reachable via /rabbits/new?litterId=... (promoting a kit from a
    // recorded breeding) — always farm origin, see NewRabbitPage's redirect.
    const rabbit = await prisma.rabbit.create({
      data: { ...buildData(parsed.data), origin: "farm" },
    });
    id = rabbit.id;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, errors: { tagId: "رقم الأرنب هذا مستخدم بالفعل" } };
    }
    throw e;
  }

  redirect(`/rabbits/${id}`);
}

export type QuickRabbitFormState = FormState & {
  rabbit?: {
    id: string;
    tagId: string | null;
    breed: string | null;
    sex: string;
    date: string;
    weightKg: number | null;
  };
};

/**
 * Fast intake: one row (sex, date, breed, optionally tag + weight) instead of
 * the full form. Sex is a field on the row itself now (the unified /stock
 * table covers both does and bucks) — tag numbers are still independent per
 * sex (@@unique([tagId, sex])), so the same number can exist once per sex.
 * Leaving tagId/weightKg blank registers the rabbit as a "سلالة" (juvenile,
 * sex known but not yet promoted); assigning its tag later via
 * finalizeQuickRabbit is what promotes it. Registering here means it's raised
 * on the farm, not bought in — origin: "farm", carried through both finalize
 * steps unchanged. Stays on the page (no redirect) so several rabbits can be
 * added in a row.
 */
export async function createQuickRabbit(
  _prev: QuickRabbitFormState,
  formData: FormData
): Promise<QuickRabbitFormState> {
  const parsed = quickRabbitSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;
  const date = fromDateInputValue(d.date);

  let id: string;
  try {
    const rabbit = await prisma.rabbit.create({
      data: {
        tagId: d.tagId ?? null,
        breed: d.breed ?? null,
        sex: d.sex,
        acquiredDate: date,
        origin: "farm",
      },
    });
    id = rabbit.id;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, errors: { tagId: "رقم الأرنب هذا مستخدم بالفعل" } };
    }
    throw e;
  }

  if (d.weightKg != null) {
    const grams = toGrams({ kg: d.weightKg }, "kg");
    await prisma.weightRecord.create({
      data: { rabbitId: id, date, weightGrams: grams },
    });
  }

  revalidatePath("/stock");
  return {
    ok: true,
    rabbit: {
      id,
      tagId: d.tagId ?? null,
      breed: d.breed ?? null,
      sex: d.sex,
      date: d.date,
      weightKg: d.weightKg ?? null,
    },
  };
}

export type CreateMotherFormState = FormState & {
  rabbit?: {
    id: string;
    tagId: string | null;
    breed: string | null;
  };
};

/**
 * "إضافة أم" quick-add on /mothers: creates a doe straight into the herd
 * with its tag assigned immediately (sex: doe, status: active, doeState:
 * empty) — unlike createQuickRabbit's tagId-less "سلالة" intake, this row
 * belongs on the mothers table right away, not the /stock promotion queue.
 * Bypassing /stock means she was never registered as a سلالة first, so this
 * is always an externally-acquired rabbit — origin: "external".
 * Stays on the page (no redirect) so several mothers can be added in a row.
 */
export async function createMother(
  _prev: CreateMotherFormState,
  formData: FormData
): Promise<CreateMotherFormState> {
  const parsed = createMotherSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  let id: string;
  try {
    const rabbit = await prisma.rabbit.create({
      data: {
        tagId: d.tagId,
        breed: d.breed ?? null,
        sex: "doe",
        status: "active",
        doeState: "empty",
        acquiredDate: new Date(),
        origin: "external",
      },
    });
    id = rabbit.id;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, errors: { tagId: "رقم الأم هذا مستخدم بالفعل" } };
    }
    throw e;
  }

  if (d.weightKg != null) {
    const grams = toGrams({ kg: d.weightKg }, "kg");
    await prisma.weightRecord.create({
      data: { rabbitId: id, date: new Date(), weightGrams: grams },
    });
  }

  revalidatePath("/mothers");
  revalidatePath("/does");
  return { ok: true, rabbit: { id, tagId: d.tagId, breed: d.breed ?? null } };
}

export type CreateBuckFormState = FormState & {
  rabbit?: {
    id: string;
    tagId: string | null;
    breed: string | null;
  };
};

/**
 * "إضافة ذكر" quick-add on /bucks — mirrors createMother for the buck side of
 * the herd: creates a buck straight in with its tag assigned immediately
 * (sex: buck, status: active), skipping the /stock promotion queue —
 * origin: "external", same reasoning as createMother.
 */
export async function createBuck(
  _prev: CreateBuckFormState,
  formData: FormData
): Promise<CreateBuckFormState> {
  const parsed = createBuckSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  let id: string;
  try {
    const rabbit = await prisma.rabbit.create({
      data: {
        tagId: d.tagId,
        breed: d.breed ?? null,
        sex: "buck",
        status: "active",
        acquiredDate: new Date(),
        origin: "external",
      },
    });
    id = rabbit.id;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, errors: { tagId: "رقم الذكر هذا مستخدم بالفعل" } };
    }
    throw e;
  }

  if (d.weightKg != null) {
    const grams = toGrams({ kg: d.weightKg }, "kg");
    await prisma.weightRecord.create({
      data: { rabbitId: id, date: new Date(), weightGrams: grams },
    });
  }

  revalidatePath("/bucks");
  return { ok: true, rabbit: { id, tagId: d.tagId, breed: d.breed ?? null } };
}

/**
 * Records a سلالة's cage number (رقم القفص) while she/he's still raised in
 * the /stock nursery pen — does NOT move her/him off that page; only the
 * explicit "نقل إلى العنبر" button does that (see promoteToHerdPen). Saves as
 * soon as it's entered (called onBlur, not behind a submit button) so the
 * value isn't lost if the user navigates away before clicking anything.
 */
export async function saveQuickRabbitCage(
  id: string,
  cage: string
): Promise<{ ok: boolean; message?: string }> {
  const parsed = saveQuickRabbitCageSchema.safeParse({ id, cage });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "رقم قفص غير صالح" };
  }

  await prisma.rabbit.update({
    where: { id: parsed.data.id },
    data: { cage: parsed.data.cage },
  });

  revalidatePath("/stock");
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath(`/rabbits/${parsed.data.id}`);
  return { ok: true };
}

/**
 * Weight side of the same autosave-on-blur intake step (see
 * saveQuickRabbitCage) — independent of the cage save, so either can be
 * entered first. Updates the latest WeightRecord in place rather than
 * creating a new one on every blur, since re-editing before the row leaves
 * /stock is fixing the same intake weighing, not a fresh measurement.
 */
export async function saveQuickRabbitWeight(
  id: string,
  weightKg: number
): Promise<{ ok: boolean; message?: string }> {
  const parsed = saveQuickRabbitWeightSchema.safeParse({ id, weightKg });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "وزن غير صالح" };
  }

  const grams = toGrams({ kg: parsed.data.weightKg }, "kg");
  const latest = await prisma.weightRecord.findFirst({
    where: { rabbitId: parsed.data.id },
    orderBy: { date: "desc" },
  });
  if (latest) {
    await prisma.weightRecord.update({
      where: { id: latest.id },
      data: { weightGrams: grams },
    });
  } else {
    await prisma.weightRecord.create({
      data: { rabbitId: parsed.data.id, date: new Date(), weightGrams: grams },
    });
  }

  revalidatePath("/stock");
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath(`/rabbits/${parsed.data.id}`);
  return { ok: true };
}

/**
 * The only thing that moves a سلالة off /stock: an explicit click, never
 * automatic just because cage/weight got filled in — she/he may sit in the
 * nursery pen for months first. Requires both to already be recorded (via
 * saveQuickRabbitCage / saveQuickRabbitWeight) before allowing the move.
 */
export async function promoteToHerdPen(
  id: string
): Promise<{ ok: boolean; message?: string }> {
  const rabbit = await prisma.rabbit.findUnique({
    where: { id },
    select: {
      cage: true,
      weightRecords: { take: 1, select: { id: true } },
    },
  });
  if (!rabbit) return { ok: false, message: "السلالة غير موجودة" };
  if (!rabbit.cage) return { ok: false, message: "سجّل رقم القفص أولاً" };
  if (rabbit.weightRecords.length === 0) {
    return { ok: false, message: "سجّل الوزن أولاً" };
  }

  await prisma.rabbit.update({
    where: { id },
    data: { movedToHerdPen: true },
  });

  revalidatePath("/stock");
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath(`/rabbits/${id}`);
  return { ok: true };
}

export type FinalizeMotherFormState = FormState & {
  rabbit?: { id: string; tagId: string | null };
};

/**
 * Second step of a doe's two-stage intake: assigns her رقم الأم (tagId),
 * completing the promotion started by finalizeQuickRabbit on /stock (which
 * only assigned her cage + weight). Also lets her weight be corrected here —
 * updates the latest WeightRecord in place rather than adding a new one,
 * since this is fixing/confirming the same intake weighing, not a fresh
 * measurement. Triggered from the pending-mothers table on /mothers.
 */
export async function finalizeMother(
  _prev: FinalizeMotherFormState,
  formData: FormData
): Promise<FinalizeMotherFormState> {
  const parsed = finalizeMotherSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  try {
    await prisma.rabbit.update({
      where: { id: d.id },
      data: { tagId: d.tagId },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, errors: { tagId: "رقم الأم هذا مستخدم بالفعل" } };
    }
    throw e;
  }

  const grams = toGrams({ kg: d.weightKg }, "kg");
  const latest = await prisma.weightRecord.findFirst({
    where: { rabbitId: d.id },
    orderBy: { date: "desc" },
  });
  if (latest) {
    await prisma.weightRecord.update({
      where: { id: latest.id },
      data: { weightGrams: grams },
    });
  } else {
    await prisma.weightRecord.create({
      data: { rabbitId: d.id, date: new Date(), weightGrams: grams },
    });
  }

  revalidatePath("/mothers");
  // She now has a tagId, so she also newly qualifies for the "عمليات
  // المزرعة" board query (sex: doe, tagId not null) — without this she'd be
  // missing there until something else happened to revalidate it.
  revalidatePath("/does");
  revalidatePath(`/rabbits/${d.id}`);
  return { ok: true, rabbit: { id: d.id, tagId: d.tagId } };
}

export type FinalizeBuckFormState = FormState & {
  rabbit?: { id: string; tagId: string | null };
};

/**
 * Second step of a buck's two-stage intake: assigns his رقم الذكر (tagId),
 * mirroring finalizeMother for the buck side, including the same
 * update-latest-weight-record-in-place behavior. Triggered from the
 * pending-bucks table on /bucks.
 */
export async function finalizeBuck(
  _prev: FinalizeBuckFormState,
  formData: FormData
): Promise<FinalizeBuckFormState> {
  const parsed = finalizeBuckSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  try {
    await prisma.rabbit.update({
      where: { id: d.id },
      data: { tagId: d.tagId },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, errors: { tagId: "رقم الذكر هذا مستخدم بالفعل" } };
    }
    throw e;
  }

  const grams = toGrams({ kg: d.weightKg }, "kg");
  const latest = await prisma.weightRecord.findFirst({
    where: { rabbitId: d.id },
    orderBy: { date: "desc" },
  });
  if (latest) {
    await prisma.weightRecord.update({
      where: { id: latest.id },
      data: { weightGrams: grams },
    });
  } else {
    await prisma.weightRecord.create({
      data: { rabbitId: d.id, date: new Date(), weightGrams: grams },
    });
  }

  revalidatePath("/bucks");
  revalidatePath(`/rabbits/${d.id}`);
  return { ok: true, rabbit: { id: d.id, tagId: d.tagId } };
}

export async function updateRabbit(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = rabbitSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error) };
  }

  // Guard: a rabbit can't be its own parent.
  if (parsed.data.sireId === id || parsed.data.damId === id) {
    return {
      ok: false,
      errors: { _form: "لا يمكن أن يكون الأرنب أبًا أو أمًا لنفسه" },
    };
  }

  try {
    await prisma.rabbit.update({ where: { id }, data: buildData(parsed.data) });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, errors: { tagId: "رقم الأرنب هذا مستخدم بالفعل" } };
    }
    throw e;
  }

  // Any field here — tagId, sex, breed, cage, status — can change which of
  // /mothers, /bucks, /does, /stock this rabbit shows up on (or how it's
  // displayed there), so all four need to drop their cached data too.
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath("/does");
  revalidatePath("/stock");
  revalidatePath(`/rabbits/${id}`);
  redirect(`/rabbits/${id}`);
}

/**
 * Hard delete — removes the rabbit and its weight/health records entirely.
 * Blocked at the DB level (Breeding.buck/doe use onDelete: Restrict) if the
 * rabbit has any breeding history, to protect pedigree data; use the status
 * menu ("مستبعد"/"نافق") for that case instead. Sire/dam refs on other
 * rabbits are SetNull'd automatically, so this never orphans a pedigree FK.
 */
export async function deleteRabbit(
  id: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    await prisma.rabbit.delete({ where: { id } });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2003"
    ) {
      return {
        ok: false,
        message: "لا يمكن حذف هذا الأرنب لأنه مرتبط بسجل تلقيح",
      };
    }
    throw e;
  }
  revalidatePath("/stock");
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath("/does");
  return { ok: true };
}

/** Soft-delete / lifecycle change. Never hard-deletes (preserves pedigree). */
export async function setRabbitStatus(id: string, status: string) {
  if (!RABBIT_STATUSES.includes(status as RabbitStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }
  await prisma.rabbit.update({
    where: { id },
    data: { status: status as RabbitStatus },
  });
  // Status is shown as a badge on all three herd tables, and a rabbit
  // flipping to/from "deceased" moves which of /stock's nursery pen, the
  // herd tables, and every breeding-workflow board (a deceased doe must stop
  // being a mating/pregnancy-test/kindling/weaning candidate) she belongs to.
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath("/does");
  revalidatePath("/stock");
  revalidatePath("/mortality");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath(`/rabbits/${id}`);
}

/**
 * Manual doe reproductive state, set exclusively via the six action buttons
 * on the does page (mate/pregnant/negative/kindle/wean/exclude).
 */
export async function setDoeState(id: string, state: string) {
  if (!DOE_STATES.includes(state as DoeState)) {
    throw new Error(`Invalid doe state: ${state}`);
  }
  await prisma.rabbit.update({
    where: { id },
    data: { doeState: state as DoeState },
  });
  revalidatePath("/does");
  // /mothers shows doeState too (الحالة التناسلية column).
  revalidatePath("/mothers");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath(`/rabbits/${id}`);
}
