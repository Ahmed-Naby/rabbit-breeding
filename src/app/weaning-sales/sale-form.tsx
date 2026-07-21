"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField, SelectField } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { toDateInputValue } from "@/lib/dates";
import { recordKitMovementAction } from "./actions";
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
  const [state, formAction] = useActionState(recordKitMovementAction, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.errors ?? {};
  
  const [today] = useState(() => toDateInputValue(new Date()));
  const [type, setType] = useState<"sale" | "death" | "adjustment">("sale");

  useEffect(() => {
    if (state.ok) {
      toast.success(locale === "ar" ? "تم التسجيل بنجاح" : "Logged successfully");
      formRef.current?.reset();
      setType("sale");
    }
  }, [state, locale]);

  const typeOptions = [
    { value: "sale", label: locale === "ar" ? "بيع خلفات" : "Kit Sale" },
    { value: "death", label: locale === "ar" ? "نافق فطام" : "Weaned Death" },
    { value: "adjustment", label: locale === "ar" ? "تسوية المخزون" : "Stock Adjustment" },
  ];

  return (
    <Card className="animate-fade-in-up">
      <CardHeader>
        <CardTitle className="text-base">
          {locale === "ar" ? "تسجيل حركة" : "Record Movement"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              label={locale === "ar" ? "نوع الحركة" : "Movement Type"}
              options={typeOptions}
              defaultValue="sale"
              onValueChange={(v) => setType(v as any)}
              error={e.type}
            />

            <div className="space-y-1">
              <TextField
                name="count"
                type="number"
                min={type === "adjustment" ? undefined : 1}
                step="1"
                label={t.countLabel}
                required
                error={e.count}
              />
              {type === "adjustment" && (
                <p className="text-[10px] text-muted-foreground">
                  {locale === "ar"
                    ? "موجب يزيد المخزون، وسالب ينقصه."
                    : "Positive increases stock, negative decreases it."}
                </p>
              )}
            </div>

            {type === "sale" && (
              <>
                <TextField
                  name="weightKg"
                  type="number"
                  min={0}
                  step="0.25"
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
              </>
            )}

            <TextField name="notes" label={t.notesLabel} error={e.notes} />
          </div>
          <SubmitButton pendingText={tCommon.saving}>
            {locale === "ar" ? "حفظ الحركة" : "Save Movement"}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
