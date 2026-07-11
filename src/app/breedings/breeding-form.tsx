"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import {
  TextField,
  TextareaField,
  SelectField,
  type Option,
} from "@/components/form-fields";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form";
import { BREEDING_OUTCOMES, label } from "@/lib/enums";
import { toDateInputValue } from "@/lib/dates";

export type BreedingValues = {
  id?: string;
  buckId: string | null;
  doeId: string;
  matingDate: string | Date | null;
  actualKindlingDate: string | Date | null;
  outcome: string;
  notes: string | null;
};

const outcomeOptions: Option[] = BREEDING_OUTCOMES.map((o) => ({
  value: o,
  label: label(o),
}));

export function BreedingForm({
  action,
  breeding,
  buckOptions,
  doeOptions,
  gestationDays,
  submitLabel = "حفظ التلقيح",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  breeding?: BreedingValues;
  buckOptions: Option[];
  doeOptions: Option[];
  gestationDays: number;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state.message ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            name="buckId"
            label="الذكر (الأب)"
            options={buckOptions}
            defaultValue={breeding?.buckId ?? ""}
            placeholder="اختر ذكرًا…"
            required
            error={e.buckId}
          />
          <SelectField
            name="doeId"
            label="الأنثى (الأم)"
            options={doeOptions}
            defaultValue={breeding?.doeId ?? ""}
            placeholder="اختر أنثى…"
            required
            error={e.doeId}
          />
          <TextField
            name="matingDate"
            type="date"
            label="تاريخ التلقيح"
            required
            defaultValue={toDateInputValue(
              breeding?.matingDate ? new Date(breeding.matingDate) : new Date()
            )}
            error={e.matingDate}
            hint={`يُحسب موعد الولادة المتوقع تلقائيًا كتاريخ التلقيح + ${gestationDays} يومًا.`}
          />
          <SelectField
            name="outcome"
            label="النتيجة"
            options={outcomeOptions}
            defaultValue={breeding?.outcome ?? "pending"}
            error={e.outcome}
          />
          <TextField
            name="actualKindlingDate"
            type="date"
            label="تاريخ الولادة الفعلي"
            defaultValue={toDateInputValue(
              breeding?.actualKindlingDate
                ? new Date(breeding.actualKindlingDate)
                : null
            )}
            error={e.actualKindlingDate}
            hint="اتركه فارغًا حتى تلد."
          />
          <TextareaField
            name="notes"
            label="ملاحظات"
            rows={3}
            defaultValue={breeding?.notes ?? ""}
            error={e.notes}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Button variant="ghost" type="button" asChild>
          <Link href={breeding?.id ? `/breedings/${breeding.id}` : "/mating"}>
            إلغاء
          </Link>
        </Button>
      </div>
    </form>
  );
}
