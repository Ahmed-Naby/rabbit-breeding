"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { toDateInputValue } from "@/lib/dates";
import { recordKitSale } from "./actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export function SaleForm({
  currency,
  tCommon,
  locale,
}: {
  currency: string;
  tCommon: { saving: string };
  locale: Locale;
}) {
  const t = getClientDictionary(locale).weaningSales;
  const [state, formAction] = useActionState(recordKitSale, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.ok) {
      toast.success(t.saleAddedToast);
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.saleFormHeading}</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextField
              name="date"
              type="date"
              label={t.dateLabel}
              required
              defaultValue={toDateInputValue(new Date())}
              error={e.date}
            />
            <TextField
              name="count"
              type="number"
              min={1}
              step="1"
              label={t.countLabel}
              required
              error={e.count}
            />
            <TextField
              name="weightKg"
              type="number"
              min={0}
              step="0.001"
              label={t.totalWeightLabel}
              required
              error={e.weightKg}
            />
            <TextField
              name="pricePerKg"
              type="number"
              min={0}
              step="0.01"
              label={t.pricePerKgLabel(currency)}
              required
              error={e.pricePerKg}
            />
            <TextField name="notes" label={t.notesLabel} error={e.notes} />
          </div>
          <SubmitButton pendingText={tCommon.saving}>{t.saleSubmitButton}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
