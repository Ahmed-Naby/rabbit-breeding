"use server";

import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { transactionSchema, recurringExpenseSchema } from "@/lib/validations";
import { fromDateInputValue } from "@/lib/dates";
import { toCents } from "@/lib/units";
import { type FormState, zodErrors, formDataToObject } from "@/lib/form";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { resolveFarmId } from "@/lib/tenant";
import {
  parseRecurringExpenses,
  dueRecurringPostings,
  RECURRING_ID_PREFIX,
  type RecurringExpense,
} from "@/lib/recurring-expenses";

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

// المصروفات الثابتة الشهرية ---------------------------------------------------

/**
 * The templates live in a Json column, so every writer has to read-modify-write
 * the whole array. Centralised here so that stays in one place.
 */
async function writeTemplates(next: RecurringExpense[]) {
  const farmId = await resolveFarmId();
  await prisma.settings.upsert({
    where: { farmId },
    update: { recurringExpenses: next },
    create: { farmId, recurringExpenses: next },
  });
  revalidatePath("/finance");
}

async function readTemplates(): Promise<RecurringExpense[]> {
  const settings = await prisma.settings.findUnique({
    where: { farmId: await resolveFarmId() },
    select: { recurringExpenses: true },
  });
  return parseRecurringExpenses(settings?.recurringExpenses);
}

export async function addRecurringExpense(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { t } = await getDictionary();
  const parsed = recurringExpenseSchema(t.validation).safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;

  const templates = await readTemplates();
  await writeTemplates([
    ...templates,
    {
      id: createId(),
      category: d.category,
      amountCents: toCents(d.amount),
      dayOfMonth: d.dayOfMonth,
      // Stored as YYYY-MM-DD, matching what the date input produced, so the
      // month walk in dueRecurringPostings never has to reason about zones.
      startDate: d.startDate,
      note: d.note ?? null,
    },
  ]);
  return { ok: true };
}

/**
 * Drops a template. Deliberately leaves every Transaction it already posted
 * alone: those are booked costs the farm really paid, and a break-even price
 * that changes retroactively because someone tidied up a template would be
 * worse than useless. Removing it only stops future months.
 */
export async function removeRecurringExpense(id: string) {
  const templates = await readTemplates();
  const next = templates.filter((tpl) => tpl.id !== id);
  if (next.length === templates.length) return; // already gone
  await writeTemplates(next);
}

/**
 * Books every month that is due and not yet in the ledger.
 *
 * An explicit action rather than something that fires on page load: this writes
 * real money rows, and a farm should never find that merely opening a screen
 * added expenses to its accounts. Safe to press twice — the ids are derived
 * from template + month, so the second press finds everything already there.
 */
export async function postDueRecurringExpenses(): Promise<{ posted: number }> {
  const templates = await readTemplates();
  if (templates.length === 0) return { posted: 0 };

  const existing = await prisma.transaction.findMany({
    where: { id: { startsWith: RECURRING_ID_PREFIX } },
    select: { id: true },
  });
  const due = dueRecurringPostings(templates, new Date(), new Set(existing.map((r) => r.id)));
  if (due.length === 0) return { posted: 0 };

  // skipDuplicates as a second line of defence: the query above and this write
  // are not one transaction, so two tabs pressing the button together can both
  // see the same month as missing.
  const res = await prisma.transaction.createMany({
    data: due.map((row) => ({
      id: row.id,
      date: row.date,
      type: "expense",
      category: row.category,
      amountCents: row.amountCents,
      notes: row.notes,
    })),
    skipDuplicates: true,
  });
  revalidatePath("/finance");
  return { posted: res.count };
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
