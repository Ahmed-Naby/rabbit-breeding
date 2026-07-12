"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { TextField, TextareaField } from "@/components/form-fields";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form";
import { toDateInputValue } from "@/lib/dates";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export function KindlingForm({
  action,
  defaultKindlingDate,
  locale = "ar",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultKindlingDate: string | Date;
  locale?: Locale;
}) {
  const t = getClientDictionary(locale).breedings;
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="kindlingDate"
          type="date"
          label={t.kindlingDateLabel}
          required
          defaultValue={toDateInputValue(new Date(defaultKindlingDate))}
          error={e.kindlingDate}
        />
        <TextField
          name="bornAlive"
          type="number"
          min={0}
          label={t.bornAliveLabel}
          defaultValue="0"
          error={e.bornAlive}
        />
        <TextField
          name="bornDead"
          type="number"
          min={0}
          label={t.bornDeadLabel}
          defaultValue="0"
          error={e.bornDead}
        />
        <TextField
          name="weaned"
          type="number"
          min={0}
          label={t.weanedLabel}
          placeholder={t.weanedPlaceholder}
          error={e.weaned}
        />
        <TextField
          name="weaningDate"
          type="date"
          label={t.weaningDateLabel}
          error={e.weaningDate}
        />
        <TextareaField
          name="notes"
          label={t.notesLabel}
          rows={2}
          error={e.notes}
          className="sm:col-span-2"
        />
      </div>
      <SubmitButton>{t.recordKindlingButton}</SubmitButton>
    </form>
  );
}
