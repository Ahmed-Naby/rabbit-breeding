"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { TextField, TextareaField, SelectField, type Option } from "@/components/form-fields";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form";
import { SEXES, RABBIT_STATUSES, label } from "@/lib/enums";
import { toDateInputValue } from "@/lib/dates";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/locales";

export type RabbitValues = {
  id?: string;
  tagId: string | null;
  breed: string | null;
  color: string | null;
  sex: string;
  status: string;
  cage: string | null;
  dateOfBirth: string | Date | null;
  acquiredDate: string | Date | null;
  acquiredFrom: string | null;
  sireId: string | null;
  damId: string | null;
  notes: string | null;
  photoUrl: string | null;
};

export function RabbitForm({
  action,
  rabbit,
  buckOptions,
  doeOptions,
  breedOptions,
  hiddenLitterId,
  submitLabel,
  tCommon,
  locale = "ar",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  rabbit?: RabbitValues;
  buckOptions: Option[];
  doeOptions: Option[];
  breedOptions: Option[];
  hiddenLitterId?: string;
  submitLabel?: string;
  tCommon: Dictionary["common"];
  locale?: Locale;
}) {
  const t = getClientDictionary(locale).rabbits;
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const e = state.errors ?? {};

  const sexOptions: Option[] = SEXES.map((s) => ({ value: s, label: label(s, locale) }));
  const statusOptions: Option[] = RABBIT_STATUSES.map((s) => ({
    value: s,
    label: label(s, locale),
  }));

  return (
    <form action={formAction} className="space-y-6">
      {hiddenLitterId ? (
        <input type="hidden" name="litterId" value={hiddenLitterId} />
      ) : null}
      {e._form ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {e._form}
        </p>
      ) : null}

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            name="tagId"
            type="text"
            maxLength={10}
            label={t.tagLabel}
            required
            placeholder={t.tagPlaceholder}
            defaultValue={rabbit?.tagId ?? ""}
            error={e.tagId}
          />
          <SelectField
            name="breed"
            label={t.breedLabel}
            options={breedOptions}
            defaultValue={rabbit?.breed ?? ""}
            includeNone
            noneLabel={tCommon.none}
            placeholder={t.breedPlaceholder}
            error={e.breed}
          />
          <TextField
            name="color"
            label={t.colorLabel}
            placeholder={t.colorPlaceholder}
            defaultValue={rabbit?.color ?? ""}
            error={e.color}
          />
          <SelectField
            name="sex"
            label={t.sexLabel}
            options={sexOptions}
            defaultValue={rabbit?.sex ?? "unknown"}
            error={e.sex}
          />
          <SelectField
            name="status"
            label={t.statusLabel}
            options={statusOptions}
            defaultValue={rabbit?.status ?? "active"}
            error={e.status}
          />
          <TextField
            name="dateOfBirth"
            type="date"
            label={t.dobLabel}
            defaultValue={toDateInputValue(
              rabbit?.dateOfBirth ? new Date(rabbit.dateOfBirth) : null
            )}
            error={e.dateOfBirth}
          />
          <TextField
            name="cage"
            label={t.cageLabel}
            placeholder={t.cagePlaceholder}
            defaultValue={rabbit?.cage ?? ""}
            error={e.cage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            name="sireId"
            label={t.sireLabel}
            options={buckOptions}
            defaultValue={rabbit?.sireId ?? ""}
            includeNone
            noneLabel={t.sireNone}
            placeholder={t.sirePlaceholder}
            error={e.sireId}
          />
          <SelectField
            name="damId"
            label={t.damLabel}
            options={doeOptions}
            defaultValue={rabbit?.damId ?? ""}
            includeNone
            noneLabel={t.damNone}
            placeholder={t.damPlaceholder}
            error={e.damId}
          />
          <TextField
            name="acquiredDate"
            type="date"
            label={t.acquiredDateLabel}
            defaultValue={toDateInputValue(
              rabbit?.acquiredDate ? new Date(rabbit.acquiredDate) : null
            )}
            error={e.acquiredDate}
          />
          <TextField
            name="acquiredFrom"
            label={t.acquiredFromLabel}
            placeholder={t.acquiredFromPlaceholder}
            defaultValue={rabbit?.acquiredFrom ?? ""}
            error={e.acquiredFrom}
          />
          <TextField
            name="photoUrl"
            label={t.photoUrlLabel}
            placeholder="https://…"
            defaultValue={rabbit?.photoUrl ?? ""}
            error={e.photoUrl}
            className="sm:col-span-2"
          />
          <TextareaField
            name="notes"
            label={t.notesLabel}
            rows={3}
            defaultValue={rabbit?.notes ?? ""}
            error={e.notes}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton pendingText={tCommon.saving}>{submitLabel ?? t.saveButton}</SubmitButton>
        <Button variant="ghost" type="button" asChild>
          <Link
            href={
              rabbit?.id
                ? `/rabbits/${rabbit.id}`
                : hiddenLitterId
                  ? `/litters/${hiddenLitterId}`
                  : "/stock"
            }
          >
            {t.cancelButton}
          </Link>
        </Button>
      </div>
    </form>
  );
}
