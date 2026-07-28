"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney, fromCents } from "@/lib/units";
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
    { value: "10", label: t.rebreedSemiIntensive },
    { value: "30", label: t.rebreedNatural },
  ];

  // Kept as the raw input strings so the derived cost below tracks typing.
  // Prices are stored as cents but entered in whole currency units.
  const [feedTon, setFeedTon] = useState(() => fromCents(settings.feedPricePerTonCents));
  const [feedGrams, setFeedGrams] = useState(() =>
    settings.feedGramsPerDoePerDay.toString()
  );
  const feedCostPerDoePerDayCents = Math.round(
    ((Number(feedTon) || 0) * 100 * (Number(feedGrams) || 0)) / 1_000_000
  );

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
            name="palpationCheckDays"
            type="number"
            min={1}
            max={30}
            label={t.palpationCheckDaysLabel}
            defaultValue={settings.palpationCheckDays.toString()}
            hint={t.palpationCheckDaysHint}
            error={e.palpationCheckDays}
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
          <SelectField
            name="rebreedAfterKindlingDays"
            label={t.rebreedLabel}
            options={rebreedOptions}
            defaultValue={settings.rebreedAfterKindlingDays.toString()}
            hint={t.rebreedHint}
            error={e.rebreedAfterKindlingDays}
          />
          <TextField
            name="fosterWindowDays"
            type="number"
            min={0}
            max={14}
            label={t.fosterWindowDaysLabel}
            defaultValue={settings.fosterWindowDays.toString()}
            hint={t.fosterWindowDaysHint}
            error={e.fosterWindowDays}
          />
          <TextField
            name="fosterHighKits"
            type="number"
            min={1}
            max={20}
            label={t.fosterHighKitsLabel}
            defaultValue={settings.fosterHighKits.toString()}
            hint={t.fosterHighKitsHint}
            error={e.fosterHighKits}
          />
          <TextField
            name="fosterLowKits"
            type="number"
            min={0}
            max={20}
            label={t.fosterLowKitsLabel}
            defaultValue={settings.fosterLowKits.toString()}
            hint={t.fosterLowKitsHint}
            error={e.fosterLowKits}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.pricingSectionTitle}</CardTitle>
          <CardDescription>{t.pricingSectionHint}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            name="defaultPricePerKg"
            type="number"
            step="0.01"
            min={0}
            label={`${t.defaultPricePerKgLabel} (${settings.currency})`}
            defaultValue={fromCents(settings.defaultPricePerKgCents)}
            hint={t.defaultPricePerKgHint}
            error={e.defaultPricePerKg}
          />
          <TextField
            name="feedPricePerTon"
            type="number"
            step="0.01"
            min={0}
            label={`${t.feedPricePerTonLabel} (${settings.currency})`}
            defaultValue={fromCents(settings.feedPricePerTonCents)}
            hint={t.feedPricePerTonHint}
            error={e.feedPricePerTon}
            onChange={(ev) => setFeedTon(ev.target.value)}
          />
          <TextField
            name="feedGramsPerDoePerDay"
            type="number"
            min={0}
            max={5000}
            label={t.feedGramsPerDoePerDayLabel}
            defaultValue={settings.feedGramsPerDoePerDay.toString()}
            hint={t.feedGramsPerDoePerDayHint}
            error={e.feedGramsPerDoePerDay}
            onChange={(ev) => setFeedGrams(ev.target.value)}
          />
          {/* The number the two feed fields exist to produce. Shown live rather
              than on save, because the pair is only meaningful together and a
              farm checks the answer against what it already knows it spends. */}
          <div className="self-end rounded-md border border-dashed px-3 py-2 text-sm">
            <div className="text-muted-foreground">{t.feedCostPerDoePerDayLabel}</div>
            <div className="font-medium tabular-nums">
              {feedCostPerDoePerDayCents > 0
                ? formatMoney(feedCostPerDoePerDayCents, settings.currency)
                : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      <SubmitButton>{t.saveButton}</SubmitButton>
    </form>
  );
}
