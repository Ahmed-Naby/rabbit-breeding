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
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export type BreedingValues = {
  id?: string;
  buckId: string | null;
  doeId: string;
  matingDate: string | Date | null;
  actualKindlingDate: string | Date | null;
  outcome: string;
  notes: string | null;
};

export function BreedingForm({
  action,
  breeding,
  buckOptions,
  doeOptions,
  gestationDays,
  submitLabel,
  locale = "ar",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  breeding?: BreedingValues;
  buckOptions: Option[];
  doeOptions: Option[];
  gestationDays: number;
  submitLabel?: string;
  locale?: Locale;
}) {
  const t = getClientDictionary(locale).breedings;
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const e = state.errors ?? {};

  const outcomeOptions: Option[] = BREEDING_OUTCOMES.map((o) => ({
    value: o,
    label: label(o, locale),
  }));

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
            label={t.matingLabel}
            options={buckOptions}
            defaultValue={breeding?.buckId ?? ""}
            placeholder={t.buckPlaceholder}
            required
            error={e.buckId}
          />
          <SelectField
            name="doeId"
            label={t.doeLabel}
            options={doeOptions}
            defaultValue={breeding?.doeId ?? ""}
            placeholder={t.doePlaceholder}
            required
            error={e.doeId}
          />
          <TextField
            name="matingDate"
            type="date"
            label={t.matingDateLabel}
            required
            defaultValue={toDateInputValue(
              breeding?.matingDate ? new Date(breeding.matingDate) : new Date()
            )}
            error={e.matingDate}
            hint={t.matingDateHint(gestationDays)}
          />
          <SelectField
            name="outcome"
            label={t.outcomeLabel}
            options={outcomeOptions}
            defaultValue={breeding?.outcome ?? "pending"}
            error={e.outcome}
          />
          <TextField
            name="actualKindlingDate"
            type="date"
            label={t.actualKindlingDateLabel}
            defaultValue={toDateInputValue(
              breeding?.actualKindlingDate
                ? new Date(breeding.actualKindlingDate)
                : null
            )}
            error={e.actualKindlingDate}
            hint={t.actualKindlingDateHint}
          />
          <TextareaField
            name="notes"
            label={t.notesLabel}
            rows={3}
            defaultValue={breeding?.notes ?? ""}
            error={e.notes}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton>{submitLabel ?? t.saveButton}</SubmitButton>
        <Button variant="ghost" type="button" asChild>
          <Link href={breeding?.id ? `/breedings/${breeding.id}` : "/mating"}>
            {t.cancelButton}
          </Link>
        </Button>
      </div>
    </form>
  );
}
