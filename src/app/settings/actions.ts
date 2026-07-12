"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { settingsSchema, breedSchema } from "@/lib/validations";
import { type FormState, zodErrors, formDataToObject } from "@/lib/form";
import { Prisma } from "@/generated/prisma/client";

export async function updateSettings(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = settingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      weightUnit: d.weightUnit,
      gestationDays: d.gestationDays,
      gestationWindowDays: d.gestationWindowDays,
      pregnancyTestDays: d.pregnancyTestDays,
      weaningDays: d.weaningDays,
      nestBoxDays: d.nestBoxDays,
      matingWeightGrams: d.matingWeightGrams,
      rebreedAfterKindlingDays: d.rebreedAfterKindlingDays,
      currency: d.currency,
    },
    create: {
      id: 1,
      weightUnit: d.weightUnit,
      gestationDays: d.gestationDays,
      gestationWindowDays: d.gestationWindowDays,
      pregnancyTestDays: d.pregnancyTestDays,
      weaningDays: d.weaningDays,
      nestBoxDays: d.nestBoxDays,
      matingWeightGrams: d.matingWeightGrams,
      rebreedAfterKindlingDays: d.rebreedAfterKindlingDays,
      currency: d.currency,
    },
  });

  // Settings affect display across the whole app.
  revalidatePath("/", "layout");
  return { ok: true, message: "تم حفظ الإعدادات" };
}

/**
 * Registers a new breed/type name for the "النوع" dropdowns used when adding
 * or editing a rabbit. Rabbit.breed itself stays free text (not a FK to this
 * table), so this is purely a curated menu, not an enforced constraint.
 */
export async function addBreed(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = breedSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };

  try {
    await prisma.breed.create({ data: { name: parsed.data.name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, errors: { name: "هذا النوع مسجل بالفعل" } };
    }
    throw e;
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "تم إضافة النوع" };
}

/**
 * Removes a breed from the registry only — rabbits already tagged with this
 * breed name keep it untouched (breed is free text, not a FK), so this never
 * loses or breaks existing data, it just drops the option from future pickers.
 */
export async function deleteBreed(id: string) {
  try {
    await prisma.breed.delete({ where: { id } });
  } catch (e) {
    // Already deleted (e.g. a double-click) — nothing left to do.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return;
    }
    throw e;
  }
  revalidatePath("/", "layout");
}
