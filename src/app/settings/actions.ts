"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { settingsSchema, breedSchema } from "@/lib/validations";
import { type FormState, zodErrors, formDataToObject } from "@/lib/form";
import { Prisma } from "@/generated/prisma/client";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function updateSettings(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { t } = await getDictionary();
  const parsed = settingsSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  // settingsSchema's fields are kept 1:1 with the Settings model, so the
  // parsed data doubles as both the update and (with an id) the create
  // payload — no per-field list to keep in sync here.
  await prisma.settings.upsert({
    where: { id: 1 },
    update: d,
    create: { id: 1, ...d },
  });

  // Settings affect display across the whole app.
  revalidatePath("/", "layout");
  return { ok: true, message: t.settings.savedToast };
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
  const { t } = await getDictionary();
  const parsed = breedSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };

  try {
    await prisma.breed.create({ data: { name: parsed.data.name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, errors: { name: t.settings.breedAlreadyExists } };
    }
    throw e;
  }

  revalidatePath("/", "layout");
  return { ok: true, message: t.settings.breedAdded };
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
