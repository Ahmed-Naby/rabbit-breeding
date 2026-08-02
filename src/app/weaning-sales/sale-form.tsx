"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField, Field } from "@/components/form-fields";
import { KitMovementTypeChoice, type KitMovementChoice } from "@/components/kit-movement-type-choice";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { toDateInputValue } from "@/lib/dates";
import { fromCents } from "@/lib/units";
import { recordKitMovementAction } from "./actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export function SaleForm({
  currency,
  defaultPricePerKgCents,
  tCommon,
  locale,
}: {
  currency: string;
  /** Settings.defaultPricePerKgCents; 0 means the farm hasn't set one. */
  defaultPricePerKgCents: number;
  tCommon: { saving: string };
  locale: Locale;
}) {
  const t = getClientDictionary(locale).weaningSales;
  const [state, formAction] = useActionState(recordKitMovementAction, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.errors ?? {};
  
  const [today] = useState(() => toDateInputValue(new Date()));
  const [type, setType] = useState<KitMovementChoice>("sale");

  useEffect(() => {
    if (state.ok) {
      toast.success(locale === "ar" ? "تم التسجيل بنجاح" : "Logged successfully");
      formRef.current?.reset();
      setType("sale");
    }
  }, [state, locale]);

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

            {/* Two columns wide on a wide screen: a pair of buttons needs the
                room a single field doesn't, and in a quarter of the row
                «تسوية المخزون» wraps onto a second line. */}
            <Field
              label={locale === "ar" ? "نوع الحركة" : "Movement Type"}
              error={e.type}
              className="lg:col-span-2"
            >
              <KitMovementTypeChoice name="type" value={type} onChange={setType} locale={locale} />
            </Field>

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
                  // Pre-filled from the farm's settings, not forced: today's
                  // price is what the buyer paid, which is why this stays an
                  // ordinary editable field and the sale keeps its own
                  // pricePerKgCents rather than reading settings at report time.
                  defaultValue={fromCents(defaultPricePerKgCents)}
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
