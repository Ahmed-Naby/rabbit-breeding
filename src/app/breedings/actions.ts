"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { breedingSchema, litterSchema, fosterSchema } from "@/lib/validations";
import { fromDateInputValue } from "@/lib/dates";
import { type FormState, zodErrors, formDataToObject } from "@/lib/form";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import {
  buckExistsOp,
  createBreedingOp,
  updateBreedingOp,
  startBreedingOp,
  setBreedingOutcomeOp,
  setPregnancyTestResultOp,
  markMatedOp,
  confirmPregnantOp,
  installNestBoxOp,
  markKindledOp,
  markWeanedOp,
  setLitterCountOp,
  setLitterWeaningWeightOp,
  recordNursingKitDeathOp,
  markMatingFailedOp,
  clearDoeRowOp,
  setMatingDateOp,
  recordKindlingOp,
  transferKitsOp,
} from "@/lib/breeding-ops";

function revalidateAllBreedingPaths() {
  revalidatePath("/does");
  revalidatePath("/nest-box");
  revalidatePath("/mating");
  revalidatePath("/pregnancy-test");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
}

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

  const breeding = await createBreedingOp({
    buckId: data.buckId,
    doeId: data.doeId,
    matingDate: fromDateInputValue(data.matingDate),
    actualKindlingDate: data.actualKindlingDate ? fromDateInputValue(data.actualKindlingDate) : null,
    outcome: data.outcome,
    notes: data.notes ?? null,
  });

  revalidateAllBreedingPaths();
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

  const result = await updateBreedingOp(id, {
    buckId: data.buckId,
    doeId: data.doeId,
    matingDate: fromDateInputValue(data.matingDate),
    actualKindlingDate: data.actualKindlingDate ? fromDateInputValue(data.actualKindlingDate) : null,
    outcome: data.outcome,
    notes: data.notes ?? null,
  });
  if (!result.ok) return { ok: false, message: t.breedings.notFound };

  // Any of matingDate/actualKindlingDate/buckId/doeId/outcome can change what
  // the does/mating/pregnancy-test/kindling/weaning boards show for this
  // cycle, and doeId itself can move this row to a different rabbit's page.
  revalidateAllBreedingPaths();
  revalidatePath(`/rabbits/${data.doeId}`);
  if (result.data.previousDoeId !== data.doeId) revalidatePath(`/rabbits/${result.data.previousDoeId}`);
  revalidatePath(`/breedings/${id}`);
  redirect(`/breedings/${id}`);
}

export async function buckExists(buckTagId: string): Promise<boolean> {
  return buckExistsOp(buckTagId);
}

export async function startBreeding(
  doeId: string,
  buckTagId?: string
): Promise<{ ok: true; buckFound: boolean }> {
  const { buckFound } = await startBreedingOp(doeId, buckTagId);

  revalidateAllBreedingPaths();
  revalidatePath(`/rabbits/${doeId}`);

  return { ok: true, buckFound };
}

/** Quick outcome change from the list/detail without opening the full form. */
export async function setBreedingOutcome(id: string, outcome: string) {
  await setBreedingOutcomeOp(id, outcome);
  revalidatePath(`/breedings/${id}`);
}

/** Quick pregnancy-test result change (the ~10-day-after-mating check). */
export async function setPregnancyTestResult(id: string, result: string) {
  await setPregnancyTestResultOp(id, result);
  revalidateAllBreedingPaths();
  revalidatePath(`/breedings/${id}`);
}

export async function markMated(
  breedingId: string,
  doeId: string,
  buckTagId?: string
): Promise<{ ok: true; buckFound: boolean }> {
  const { buckFound } = await markMatedOp(breedingId, doeId, buckTagId);

  revalidateAllBreedingPaths();
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);

  return { ok: true, buckFound };
}

export async function confirmPregnant(breedingId: string, doeId: string, target: string) {
  await confirmPregnantOp(breedingId, doeId, target);

  revalidateAllBreedingPaths();
  revalidatePath(`/rabbits/${doeId}`);
}

export async function installNestBox(breedingId: string, doeId: string) {
  await installNestBoxOp(breedingId);

  revalidateAllBreedingPaths();
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
}

export async function markKindled(breedingId: string, doeId: string) {
  const result = await markKindledOp(breedingId, doeId);
  if (!result.ok) {
    throw new Error(`Cannot mark kindled: ${result.code}`);
  }

  revalidateAllBreedingPaths();
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
}

export async function markWeaned(breedingId: string, doeId: string) {
  await markWeanedOp(breedingId, doeId);

  revalidateAllBreedingPaths();
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
}

export async function setLitterCount(
  breedingId: string,
  field: "bornAlive" | "bornDead" | "weaned",
  value: number | null
): Promise<{ ok: boolean; message?: string }> {
  const result = await setLitterCountOp(breedingId, field, value);
  if (!result.ok) {
    const { t } = await getDictionary();
    return { ok: false, message: t.breedings.weanedExceedsBornAlive };
  }

  revalidateAllBreedingPaths();
  revalidatePath(`/breedings/${breedingId}`);
  return { ok: true };
}

export async function setLitterWeaningWeight(
  breedingId: string,
  weaningWeightGrams: number | null
): Promise<{ ok: boolean; message?: string }> {
  const result = await setLitterWeaningWeightOp(breedingId, weaningWeightGrams);
  if (!result.ok) {
    const { t } = await getDictionary();
    return { ok: false, message: t.doeStateMenu.invalidValueFallback };
  }

  revalidatePath("/weaning");
  revalidatePath(`/breedings/${breedingId}`);
  return { ok: true };
}

export async function recordNursingKitDeath(
  breedingId: string,
  count: number = 1
): Promise<{ ok: boolean; message?: string }> {
  const result = await recordNursingKitDeathOp(breedingId, count);
  if (!result.ok) {
    const { t } = await getDictionary();
    return { ok: false, message: t.breedings.noNursingKitsToRecordDeath };
  }

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

export async function markMatingFailed(breedingId: string, doeId: string) {
  await markMatingFailedOp(breedingId, doeId);

  revalidateAllBreedingPaths();
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
}

export async function clearDoeRow(breedingId: string, doeId: string) {
  await clearDoeRowOp(breedingId, doeId);

  revalidateAllBreedingPaths();
  revalidatePath(`/breedings/${breedingId}`);
  revalidatePath(`/rabbits/${doeId}`);
}

export async function setMatingDate(breedingId: string, value: string) {
  await setMatingDateOp(breedingId, value ? fromDateInputValue(value) : null);

  revalidateAllBreedingPaths();
  revalidatePath(`/breedings/${breedingId}`);
}

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

  const result = await recordKindlingOp(breedingId, {
    kindlingDate: fromDateInputValue(data.kindlingDate),
    bornAlive: data.bornAlive,
    bornDead: data.bornDead,
    weaned: data.weaned ?? null,
    weaningDate: data.weaningDate ? fromDateInputValue(data.weaningDate) : null,
    notes: data.notes ?? null,
  });
  if (!result.ok) {
    return { ok: false, message: t.breedings.litterAlreadyExists };
  }

  revalidateAllBreedingPaths();
  revalidatePath(`/rabbits/${result.data.doeId}`);
  revalidatePath(`/breedings/${breedingId}`);
  redirect(`/breedings/${breedingId}`);
}

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

  const result = await transferKitsOp(data);
  if (!result.ok) {
    const err = result.code;
    if (err.field === "fromTagId") {
      return {
        ok: false,
        errors: {
          fromTagId:
            err.code === "DOE_NOT_FOUND" ? t.breedings.doeNotFound(err.tagId) : t.breedings.noCurrentLitter(err.tagId),
        },
      };
    }
    if (err.field === "toTagId") {
      return {
        ok: false,
        errors: {
          toTagId:
            err.code === "DOE_NOT_FOUND" ? t.breedings.doeNotFound(err.tagId) : t.breedings.noCurrentLitter(err.tagId),
        },
      };
    }
    return {
      ok: false,
      errors: { count: t.breedings.notEnoughBornAlive(err.tagId, err.available) },
    };
  }

  revalidatePath("/does");
  revalidatePath("/fostering");
  revalidatePath("/mortality");
  revalidatePath("/weaning");
  revalidatePath("/weaning-sales");
  revalidatePath(`/rabbits/${result.data.fromDoeId}`);
  revalidatePath(`/rabbits/${result.data.toDoeId}`);

  return { ok: true, message: t.breedings.transferSuccessToast };
}
