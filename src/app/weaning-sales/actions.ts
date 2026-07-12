"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { kitSaleSchema } from "@/lib/validations";
import { fromDateInputValue } from "@/lib/dates";
import { toGrams, toCents } from "@/lib/units";
import { type FormState, zodErrors, formDataToObject } from "@/lib/form";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getKitStockSummary } from "./stock";

function revalidateAll() {
  revalidatePath("/weaning-sales");
  revalidatePath("/finance");
}

export async function recordKitSale(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { t } = await getDictionary();
  const parsed = kitSaleSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  const date = fromDateInputValue(d.date);
  const weightGrams = toGrams({ kg: d.weightKg }, "kg");
  const pricePerKgCents = toCents(d.pricePerKg);
  const amountCents = Math.round((weightGrams * pricePerKgCents) / 1000);

  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        date,
        type: "income",
        category: "sale",
        amountCents,
        notes: d.notes ?? null,
      },
    });
    await tx.kitStockMovement.create({
      data: {
        date,
        type: "sale",
        count: d.count,
        weightGrams,
        pricePerKgCents,
        amountCents,
        transactionId: transaction.id,
        notes: d.notes ?? null,
      },
    });
  });

  revalidateAll();
  return { ok: true };
}

/**
 * "+1 نافق" from the weaned-stock mortality section (/mortality): one weaned
 * kit from the available (weaned, not yet sold) stock died. Mirrors
 * recordNursingKitDeath's "+1 per click" pattern rather than a date/count
 * form, since this is meant to be logged the moment it happens.
 */
export async function recordWeanedKitDeath(
  count: number = 1
): Promise<{ ok: boolean; message?: string }> {
  const { availableStock } = await getKitStockSummary();
  if (availableStock <= 0) {
    const { t } = await getDictionary();
    return { ok: false, message: t.mortality.noWeanedStockAvailable };
  }
  if (!Number.isInteger(count) || count < 1 || count > availableStock) {
    const { t } = await getDictionary();
    return { ok: false, message: t.mortality.weaningStockDeathCountExceedsAvailable };
  }

  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  await prisma.kitStockMovement.create({
    data: { date, type: "death", count },
  });

  revalidatePath("/mortality");
  revalidateAll();
  return { ok: true };
}

export async function deleteKitStockMovement(id: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const movement = await tx.kitStockMovement.delete({ where: { id } });
      if (movement.transactionId) {
        await tx.transaction.delete({ where: { id: movement.transactionId } });
      }
    });
  } catch (e) {
    // Already deleted (e.g. a double-click) — nothing left to do.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return;
    }
    throw e;
  }
  revalidateAll();
}
