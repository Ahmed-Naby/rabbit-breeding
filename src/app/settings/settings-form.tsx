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
import { formatMoney, fromCents, toCents } from "@/lib/units";
import {
  computeFeedPlan,
  RATION_KEYS,
  type FeedRations,
  type HerdComposition,
} from "@/lib/feed-plan";
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
  composition,
  locale,
  t,
}: {
  settings: AppSettings;
  /** The herd as it stands today — the multiplier for the rations below. */
  composition: HerdComposition;
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

  // The feed block is the one part of this form that computes something, so
  // its inputs are mirrored into state as raw strings and the plan is recomputed
  // on every keystroke. Everything else stays uncontrolled.
  const [feedTon, setFeedTon] = useState(() => fromCents(settings.feedPricePerTonCents));
  const [rations, setRations] = useState<Record<string, string>>(() =>
    Object.fromEntries(RATION_KEYS.map((k) => [k, settings[k] ? String(settings[k]) : ""]))
  );
  const plan = computeFeedPlan(
    composition,
    Object.fromEntries(
      RATION_KEYS.map((k) => [k, Number(rations[k]) || 0])
    ) as unknown as FeedRations,
    toCents(Number(feedTon) || 0)
  );

  const RATION_FIELDS: { key: (typeof RATION_KEYS)[number]; label: string; head: number }[] = [
    { key: "feedGramsDoeIdlePerDay", label: t.rationDoeIdleLabel, head: composition.doesIdle },
    {
      key: "feedGramsDoePregnantPerDay",
      label: t.rationDoePregnantLabel,
      head: composition.doesPregnant,
    },
    {
      key: "feedGramsDoeNursingPerDay",
      label: t.rationDoeNursingLabel,
      head: composition.doesNursing,
    },
    { key: "feedGramsBuckPerDay", label: t.rationBuckLabel, head: composition.bucks },
    { key: "feedGramsGrowerPerDay", label: t.rationGrowerLabel, head: composition.growers },
    {
      key: "feedGramsJuvenilePerDay",
      label: t.rationJuvenileLabel,
      head: composition.juveniles,
    },
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.rationsSectionTitle}</CardTitle>
          <CardDescription>{t.rationsSectionHint}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {RATION_FIELDS.map((f) => (
              <TextField
                key={f.key}
                name={f.key}
                type="number"
                min={0}
                max={5000}
                // The head count rides on the label so the farm can see what
                // each ration is being multiplied by without cross-referencing
                // the summary below.
                label={`${f.label} · ${f.head} ${t.feedPlanHeadUnit}`}
                defaultValue={settings[f.key] ? String(settings[f.key]) : ""}
                error={e[f.key]}
                onChange={(ev) =>
                  setRations((r) => ({ ...r, [f.key]: ev.target.value }))
                }
              />
            ))}
          </div>

          {/* The number the whole section exists to produce. Live rather than
              on save: the rations are only meaningful multiplied out, and a
              farm judges them by whether the total matches the bills it pays. */}
          <div className="rounded-md border border-dashed p-4">
            <div className="text-sm font-medium">{t.feedPlanTitle}</div>
            {plan.gramsPerDay > 0 ? (
              <>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Figure
                    label={t.feedPlanKgPerMonthLabel}
                    value={`${Math.round(plan.kgPerMonth).toLocaleString(locale)} ${
                      locale === "ar" ? "كجم" : "kg"
                    }`}
                  />
                  <Figure
                    label={t.feedPlanCostPerMonthLabel}
                    value={
                      plan.costPerMonthCents != null
                        ? formatMoney(plan.costPerMonthCents, settings.currency)
                        : "—"
                    }
                  />
                  <Figure
                    label={t.feedCostPerDoePerDayLabel}
                    value={
                      plan.costPerDoePerDayCents != null
                        ? formatMoney(plan.costPerDoePerDayCents, settings.currency)
                        : "—"
                    }
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{t.feedPlanNote}</p>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{t.feedPlanEmpty}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <SubmitButton>{t.saveButton}</SubmitButton>
    </form>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
