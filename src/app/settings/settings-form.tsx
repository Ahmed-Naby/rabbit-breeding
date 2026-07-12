"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { TextField, SelectField, type Option } from "@/components/form-fields";
import { SubmitButton } from "@/components/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { WEIGHT_UNITS, label } from "@/lib/enums";
import type { AppSettings } from "@/lib/settings";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import { updateSettings } from "./actions";

export function SettingsForm({
  settings,
  locale,
  t,
}: {
  settings: AppSettings;
  locale: Locale;
  t: Dictionary["settings"];
}) {
  const [state, formAction] = useActionState(updateSettings, EMPTY_FORM_STATE);
  const e = state.errors ?? {};

  const unitOptions: Option[] = WEIGHT_UNITS.map((u) => ({
    value: u,
    label: label(u, locale),
  }));

  const rebreedOptions: Option[] = [
    { value: "0", label: t.rebreedIntensive },
    { value: "15", label: t.rebreedSemiIntensive },
    { value: "30", label: t.rebreedNatural },
  ];

  useEffect(() => {
    if (state.ok) toast.success(state.message ?? t.savedToast);
  }, [state, t.savedToast]);

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            name="weightUnit"
            label={t.weightUnitLabel}
            options={unitOptions}
            defaultValue={settings.weightUnit}
            hint={t.weightUnitHint}
            error={e.weightUnit}
          />
          <TextField
            name="currency"
            label={t.currencyLabel}
            defaultValue={settings.currency}
            maxLength={3}
            hint={t.currencyHint}
            error={e.currency}
          />
          <TextField
            name="gestationDays"
            type="number"
            min={1}
            max={60}
            label={t.gestationDaysLabel}
            defaultValue={settings.gestationDays.toString()}
            hint={t.gestationDaysHint}
            error={e.gestationDays}
          />
          <TextField
            name="gestationWindowDays"
            type="number"
            min={0}
            max={14}
            label={t.gestationWindowDaysLabel}
            defaultValue={settings.gestationWindowDays.toString()}
            hint={t.gestationWindowDaysHint}
            error={e.gestationWindowDays}
          />
          <TextField
            name="pregnancyTestDays"
            type="number"
            min={1}
            max={30}
            label={t.pregnancyTestDaysLabel}
            defaultValue={settings.pregnancyTestDays.toString()}
            hint={t.pregnancyTestDaysHint}
            error={e.pregnancyTestDays}
          />
          <TextField
            name="weaningDays"
            type="number"
            min={0}
            max={90}
            label={t.weaningDaysLabel}
            defaultValue={settings.weaningDays.toString()}
            hint={t.weaningDaysHint}
            error={e.weaningDays}
          />
          <TextField
            name="nestBoxDays"
            type="number"
            min={1}
            max={30}
            label={t.nestBoxDaysLabel}
            defaultValue={settings.nestBoxDays.toString()}
            hint={t.nestBoxDaysHint}
            error={e.nestBoxDays}
          />
          <TextField
            name="matingWeightGrams"
            type="number"
            min={1}
            label={t.matingWeightGramsLabel}
            defaultValue={settings.matingWeightGrams.toString()}
            hint={t.matingWeightGramsHint}
            error={e.matingWeightGrams}
          />
          <SelectField
            name="rebreedAfterKindlingDays"
            label={t.rebreedLabel}
            options={rebreedOptions}
            defaultValue={settings.rebreedAfterKindlingDays.toString()}
            hint={t.rebreedHint}
            error={e.rebreedAfterKindlingDays}
          />
        </CardContent>
      </Card>
      <SubmitButton>{t.saveButton}</SubmitButton>
    </form>
  );
}
