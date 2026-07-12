"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { transactionSchema } from "@/lib/validations";
import { fromDateInputValue } from "@/lib/dates";
import { toCents } from "@/lib/units";
import { type FormState, zodErrors, formDataToObject } from "@/lib/form";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function createTransaction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { t } = await getDictionary();
  const parsed = transactionSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  await prisma.transaction.create({
    data: {
      rabbitId: d.rabbitId || null,
      date: fromDateInputValue(d.date),
      type: d.type,
      category: d.category,
      amountCents: toCents(d.amount),
      notes: d.notes ?? null,
    },
  });
  revalidatePath("/finance");
  return { ok: true };
}

export async function deleteTransaction(id: string) {
  try {
    await prisma.transaction.delete({ where: { id } });
  } catch (e) {
    // Already deleted (e.g. a double-click) — nothing left to do.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return;
    }
    throw e;
  }
  revalidatePath("/finance");
}
