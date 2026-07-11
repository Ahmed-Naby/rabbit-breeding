"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { litterSchema } from "@/lib/validations";
import { fromDateInputValue } from "@/lib/dates";
import { type FormState, zodErrors, formDataToObject } from "@/lib/form";

export async function updateLitter(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const existing = await prisma.litter.findUnique({
    where: { id },
    include: { breeding: { select: { doeId: true } } },
  });
  if (!existing) return { ok: false, message: "لم يتم العثور على الولادة" };

  const parsed = litterSchema.safeParse({
    ...formDataToObject(formData),
    breedingId: existing.breedingId,
  });
  if (!parsed.success) {
    return { ok: false, errors: zodErrors(parsed.error) };
  }
  const data = parsed.data;
  const kindlingDate = fromDateInputValue(data.kindlingDate);

  await prisma.$transaction([
    prisma.litter.update({
      where: { id },
      data: {
        kindlingDate,
        bornAlive: data.bornAlive,
        bornDead: data.bornDead,
        weaned: data.weaned ?? null,
        weaningDate: data.weaningDate
          ? fromDateInputValue(data.weaningDate)
          : null,
        notes: data.notes ?? null,
      },
    }),
    // Keep the breeding's actual kindling date in sync.
    prisma.breeding.update({
      where: { id: existing.breedingId },
      data: { actualKindlingDate: kindlingDate },
    }),
  ]);

  // bornAlive/bornDead/weaned feed the counts shown on /does, /kindling
  // (سجل الولادات inline counts) and /weaning (weanActive/isWeaned
  // derivation); weaningDate/kindlingDate can move which board a doe's
  // row appears on entirely.
  revalidatePath("/does");
  revalidatePath("/kindling");
  revalidatePath("/weaning");
  revalidatePath(`/breedings/${existing.breedingId}`);
  revalidatePath(`/rabbits/${existing.breeding.doeId}`);
  revalidatePath(`/litters/${id}`);
  redirect(`/litters/${id}`);
}
