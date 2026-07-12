"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { TextField, TextareaField, SelectField, type Option } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { toDateInputValue } from "@/lib/dates";
import {
  TRANSACTION_TYPES,
  TRANSACTION_CATEGORIES,
  label,
} from "@/lib/enums";
import { createTransaction } from "./actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/locales";

export function TransactionForm({
  rabbitOptions,
  currency,
  tCommon,
  locale = "ar",
}: {
  rabbitOptions: Option[];
  currency: string;
  tCommon: Dictionary["common"];
  locale?: Locale;
}) {
  const t = getClientDictionary(locale).finance;
  const [state, formAction] = useActionState(
    createTransaction,
    EMPTY_FORM_STATE
  );
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.errors ?? {};
  // Computed once (not inline in JSX) so it stays stable across re-renders —
  // Base UI's uncontrolled Input warns if defaultValue changes after mount.
  const [today] = useState(() => toDateInputValue(new Date()));

  const typeOptions: Option[] = TRANSACTION_TYPES.map((type) => ({
    value: type,
    label: label(type, locale),
  }));
  const categoryOptions: Option[] = TRANSACTION_CATEGORIES.map((c) => ({
    value: c,
    label: label(c, locale),
  }));

  useEffect(() => {
    if (state.ok) {
      toast.success(t.addedToast);
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              name="date"
              type="date"
              label={t.dateLabel}
              required
              defaultValue={today}
              error={e.date}
            />
            <SelectField
              name="type"
              label={t.typeLabel}
              options={typeOptions}
              defaultValue="expense"
              error={e.type}
            />
            <SelectField
              name="category"
              label={t.categoryLabel}
              options={categoryOptions}
              defaultValue="feed"
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
            <SelectField
              name="rabbitId"
              label={t.rabbitLabel}
              options={rabbitOptions}
              includeNone
              noneLabel={t.farmWideOption}
              placeholder={t.farmWideOption}
              error={e.rabbitId}
            />
            <TextField name="notes" label={t.notesLabel} error={e.notes} />
          </div>
          <SubmitButton pendingText={tCommon.saving}>{t.submitButton}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
