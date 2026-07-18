"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  rabbitSchema,
  quickRabbitSchema,
  saveQuickRabbitCageSchema,
  saveQuickRabbitWeightSchema,
  finalizeMotherSchema,
  finalizeBuckSchema,
  createMotherSchema,
  createBuckSchema,
  type RabbitInput,
} from "@/lib/validations";
import { fromDateInputValue } from "@/lib/dates";
import {
  type FormState,
  zodErrors,
  formDataToObject,
} from "@/lib/form";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getKitStockSummary } from "@/app/weaning-sales/stock";
import {
  type RabbitData,
  createRabbitOp,
  createQuickRabbitOp,
  createMotherOp,
  createBuckOp,
  saveQuickRabbitCageOp,
  saveQuickRabbitWeightOp,
  promoteToHerdPenOp,
  finalizeMotherOp,
  finalizeBuckOp,
  updateRabbitOp,
  deleteRabbitOp,
  setRabbitStatusOp,
  setDoeStateOp,
} from "@/lib/rabbit-ops";

function buildData(input: RabbitInput): RabbitData {
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
  const { t } = await getDictionary();
  const parsed = rabbitSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error) };
  }

  const result = await createRabbitOp(buildData(parsed.data));
  if (!result.ok) {
    return { ok: false, errors: { tagId: t.rabbits.tagInUse } };
  }

  redirect(`/rabbits/${result.data.id}`);
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
 * Stays on the page (no redirect) so several rabbits can be added in a row.
 */
export async function createQuickRabbit(
  _prev: QuickRabbitFormState,
  formData: FormData
): Promise<QuickRabbitFormState> {
  const { t } = await getDictionary();
  const parsed = quickRabbitSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;
  const date = fromDateInputValue(d.date);

  // Registering breeding stock withdraws one kit from the available-weaning
  // balance; block it at zero so the balance never goes negative (mirrors the
  // offline app's guard). Record a weaning or a positive adjustment first.
  const { availableStock } = await getKitStockSummary();
  if (availableStock <= 0) {
    return { ok: false, errors: { _form: t.stock.noAvailableStock } };
  }

  const result = await createQuickRabbitOp({
    tagId: d.tagId ?? null,
    breed: d.breed ?? null,
    sex: d.sex,
    date,
    weightKg: d.weightKg ?? null,
  });
  if (!result.ok) {
    return { ok: false, errors: { tagId: t.rabbits.tagInUse } };
  }

  revalidatePath("/stock");
  revalidatePath("/weaning-sales");
  revalidatePath("/mortality");
  return {
    ok: true,
    rabbit: {
      id: result.data.id,
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
 * Stays on the page (no redirect) so several mothers can be added in a row.
 */
export async function createMother(
  _prev: CreateMotherFormState,
  formData: FormData
): Promise<CreateMotherFormState> {
  const { t } = await getDictionary();
  const parsed = createMotherSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  const result = await createMotherOp({
    tagId: d.tagId,
    breed: d.breed ?? null,
    weightKg: d.weightKg ?? null,
  });
  if (!result.ok) {
    return { ok: false, errors: { tagId: t.rabbits.motherTagInUse } };
  }

  revalidatePath("/mothers");
  revalidatePath("/does");
  revalidatePath("/rounds");
  return { ok: true, rabbit: { id: result.data.id, tagId: d.tagId, breed: d.breed ?? null } };
}

export type CreateBuckFormState = FormState & {
  rabbit?: {
    id: string;
    tagId: string | null;
    breed: string | null;
  };
};

export async function createBuck(
  _prev: CreateBuckFormState,
  formData: FormData
): Promise<CreateBuckFormState> {
  const { t } = await getDictionary();
  const parsed = createBuckSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  const result = await createBuckOp({
    tagId: d.tagId,
    breed: d.breed ?? null,
    weightKg: d.weightKg ?? null,
  });
  if (!result.ok) {
    return { ok: false, errors: { tagId: t.rabbits.buckTagInUse } };
  }

  revalidatePath("/bucks");
  revalidatePath("/bucks-rounds");
  return { ok: true, rabbit: { id: result.data.id, tagId: d.tagId, breed: d.breed ?? null } };
}

/**
 * Saves as soon as it's entered (called onBlur, not behind a submit button)
 * so the value isn't lost if the user navigates away before clicking anything.
 */
export async function saveQuickRabbitCage(
  id: string,
  cage: string
): Promise<{ ok: boolean; message?: string }> {
  const { t } = await getDictionary();
  const parsed = saveQuickRabbitCageSchema(t.validation).safeParse({ id, cage });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? t.rabbits.invalidCageFallback };
  }

  await saveQuickRabbitCageOp(parsed.data.id, parsed.data.cage);

  revalidatePath("/stock");
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath(`/rabbits/${parsed.data.id}`);
  return { ok: true };
}

export async function saveQuickRabbitWeight(
  id: string,
  weightKg: number
): Promise<{ ok: boolean; message?: string }> {
  const { t } = await getDictionary();
  const parsed = saveQuickRabbitWeightSchema(t.validation).safeParse({ id, weightKg });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? t.rabbits.invalidWeightFallback };
  }

  await saveQuickRabbitWeightOp(parsed.data.id, parsed.data.weightKg);

  revalidatePath("/stock");
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath(`/rabbits/${parsed.data.id}`);
  return { ok: true };
}

export async function promoteToHerdPen(
  id: string
): Promise<{ ok: boolean; message?: string }> {
  const { t } = await getDictionary();
  const result = await promoteToHerdPenOp(id);
  if (!result.ok) {
    const message =
      result.code === "NOT_FOUND"
        ? t.rabbits.strainNotFound
        : result.code === "CAGE_REQUIRED"
          ? t.rabbits.cageRequiredFirst
          : t.rabbits.weightRequiredFirst;
    return { ok: false, message };
  }

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
 * Triggered from the pending-mothers table on /mothers.
 */
export async function finalizeMother(
  _prev: FinalizeMotherFormState,
  formData: FormData
): Promise<FinalizeMotherFormState> {
  const { t } = await getDictionary();
  const parsed = finalizeMotherSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  const result = await finalizeMotherOp(d.id, d.tagId, d.weightKg);
  if (!result.ok) {
    return { ok: false, errors: { tagId: t.rabbits.motherTagInUse } };
  }

  revalidatePath("/mothers");
  // She now has a tagId, so she also newly qualifies for the "Farm
  // Operations" board query (sex: doe, tagId not null) — without this she'd
  // be missing there until something else happened to revalidate it.
  revalidatePath("/does");
  revalidatePath("/rounds");
  revalidatePath(`/rabbits/${d.id}`);
  return { ok: true, rabbit: { id: d.id, tagId: d.tagId } };
}

export type FinalizeBuckFormState = FormState & {
  rabbit?: { id: string; tagId: string | null };
};

/**
 * Triggered from the pending-bucks table on /bucks.
 */
export async function finalizeBuck(
  _prev: FinalizeBuckFormState,
  formData: FormData
): Promise<FinalizeBuckFormState> {
  const { t } = await getDictionary();
  const parsed = finalizeBuckSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  const result = await finalizeBuckOp(d.id, d.tagId, d.weightKg);
  if (!result.ok) {
    return { ok: false, errors: { tagId: t.rabbits.buckTagInUse } };
  }

  revalidatePath("/bucks");
  revalidatePath("/bucks-rounds");
  revalidatePath(`/rabbits/${d.id}`);
  return { ok: true, rabbit: { id: d.id, tagId: d.tagId } };
}

export async function updateRabbit(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { t } = await getDictionary();
  const parsed = rabbitSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error) };
  }

  const result = await updateRabbitOp(id, buildData(parsed.data));
  if (!result.ok) {
    if (result.code === "SELF_PARENT") {
      return { ok: false, errors: { _form: t.rabbits.selfParentError } };
    }
    return { ok: false, errors: { tagId: t.rabbits.tagInUse } };
  }

  // Any field here — tagId, sex, breed, cage, status — can change which of
  // /mothers, /bucks, /does, /stock this rabbit shows up on (or how it's
  // displayed there), so all four need to drop their cached data too.
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath("/does");
  revalidatePath("/rounds");
  revalidatePath("/bucks-rounds");
  revalidatePath("/stock");
  revalidatePath(`/rabbits/${id}`);
  redirect(`/rabbits/${id}`);
}

export async function deleteRabbit(
  id: string
): Promise<{ ok: boolean; message?: string }> {
  const { t } = await getDictionary();
  const result = await deleteRabbitOp(id);
  if (!result.ok) {
    return { ok: false, message: t.rabbits.deleteBlockedByBreeding };
  }
  revalidatePath("/stock");
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath("/does");
  revalidatePath("/rounds");
  revalidatePath("/bucks-rounds");
  // If this rabbit had a "retained" KitStockMovement, the DB cascade-deleted
  // it along with the rabbit, so the weaned-kit pool needs a refresh too.
  revalidatePath("/weaning-sales");
  revalidatePath("/mortality");
  return { ok: true };
}

export async function setRabbitStatus(id: string, status: string) {
  await setRabbitStatusOp(id, status);
  // Status is shown as a badge on all three herd tables, and a rabbit
  // flipping to/from "deceased" moves which of /stock's nursery pen, the
  // herd tables, and every breeding-workflow board (a deceased doe must stop
  // being a mating/pregnancy-test/kindling/weaning candidate) she belongs to.
  revalidatePath("/mothers");
  revalidatePath("/bucks");
  revalidatePath("/does");
  revalidatePath("/rounds");
  revalidatePath("/bucks-rounds");
  revalidatePath("/stock");
  revalidatePath("/mortality");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath(`/rabbits/${id}`);
}

export async function setDoeState(id: string, state: string) {
  await setDoeStateOp(id, state);
  revalidatePath("/does");
  revalidatePath("/rounds");
  // /mothers shows doeState too (reproductive state column).
  revalidatePath("/mothers");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath(`/rabbits/${id}`);
}
