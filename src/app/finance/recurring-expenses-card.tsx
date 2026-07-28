"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Trash2, CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextField, SelectField, type Option } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { toDateInputValue } from "@/lib/dates";
import { formatMoney } from "@/lib/units";
import { TRANSACTION_CATEGORIES, label } from "@/lib/enums";
import {
  recurringMonthlyTotalCents,
  type RecurringExpense,
} from "@/lib/recurring-expenses";
import {
  addRecurringExpense,
  removeRecurringExpense,
  postDueRecurringExpenses,
} from "./actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/locales";

export function RecurringExpensesCard({
  templates,
  dueCount,
  dueTotalCents,
  currency,
  doeCount,
  tCommon,
  locale = "ar",
}: {
  templates: RecurringExpense[];
  /** Computed on the server so both platforms agree on what "due" means. */
  dueCount: number;
  dueTotalCents: number;
  currency: string;
  /** Active does, for the per-doe reading of the monthly total. 0 hides it. */
  doeCount: number;
  tCommon: Dictionary["common"];
  locale?: Locale;
}) {
  const t = getClientDictionary(locale).finance;
  const [state, formAction] = useActionState(addRecurringExpense, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.errors ?? {};
  const [pending, start] = useTransition();
  // Stable across re-renders — Base UI's uncontrolled Input warns if a
  // defaultValue changes after mount.
  const [today] = useState(() => toDateInputValue(new Date()));

  const monthlyTotal = recurringMonthlyTotalCents(templates);

  const categoryOptions: Option[] = TRANSACTION_CATEGORIES.map((c) => ({
    value: c,
    label: label(c, locale),
  }));

  useEffect(() => {
    if (state.ok) {
      toast.success(t.recurringAddedToast);
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const handleRemove = (id: string) => {
    if (!window.confirm(t.recurringRemoveConfirm)) return;
    start(async () => {
      await removeRecurringExpense(id);
      toast.success(t.recurringRemovedToast);
    });
  };

  const handlePost = () => {
    start(async () => {
      const { posted } = await postDueRecurringExpenses();
      if (posted === 0) toast.info(t.recurringNothingDue);
      else toast.success(t.recurringPostedToast(posted));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-muted-foreground" />
          {t.recurringTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">{t.recurringDescription}</p>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.recurringEmpty}</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {label(tpl.category, locale)}
                    {tpl.note ? (
                      <span className="ms-2 font-normal text-muted-foreground">{tpl.note}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.recurringDayOf(tpl.dayOfMonth)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                    −{formatMoney(tpl.amountCents, currency)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    onClick={() => handleRemove(tpl.id)}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {templates.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3">
            <div className="text-sm">
              <p className="font-medium">{t.recurringMonthlyTotal(formatMoney(monthlyTotal, currency))}</p>
              {doeCount > 0 ? (
                // The figure that actually decides things: fixed cost per doe
                // per month is what a farm compares against what a doe earns.
                <p className="text-xs text-muted-foreground">
                  {t.recurringPerDoeHint(formatMoney(Math.round(monthlyTotal / doeCount), currency))}
                </p>
              ) : null}
            </div>
            <div className="text-end">
              <Button size="sm" disabled={pending || dueCount === 0} onClick={handlePost}>
                {t.recurringPostButton}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                {dueCount === 0
                  ? t.recurringNothingDue
                  : t.recurringDueCount(dueCount, formatMoney(dueTotalCents, currency))}
              </p>
            </div>
          </div>
        ) : null}

        <form ref={formRef} action={formAction} className="space-y-4 border-t pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SelectField
              name="category"
              label={t.categoryLabel}
              options={categoryOptions}
              defaultValue="rent"
              error={e.category}
            />
            <TextField
              name="amount"
              type="number"
              step="0.01"
              min={0}
              label={t.amountLabel(currency)}
              required
              error={e.amount}
            />
            <TextField
              name="dayOfMonth"
              type="number"
              min={1}
              max={28}
              label={t.recurringDayLabel}
              hint={t.recurringDayHint}
              required
              defaultValue="1"
              error={e.dayOfMonth}
            />
            <TextField
              name="startDate"
              type="date"
              label={t.recurringStartLabel}
              hint={t.recurringStartHint}
              required
              defaultValue={today}
              error={e.startDate}
            />
            <TextField name="note" label={t.notesLabel} error={e.note} />
          </div>
          <SubmitButton pendingText={tCommon.saving}>
            <Plus className="size-4" />
            {t.recurringAddButton}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
