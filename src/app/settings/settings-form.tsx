"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Badge } from "@/components/ui/badge";
import { rebreedSystemBand, REBREED_MAX_DAYS, maxWeaningDays } from "@/lib/does-board";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { REBREED_BAND_TARGET_CYCLES } from "@/lib/herd-productivity";
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
  // The clamp notice is the same string the schema rejects with, so the box and
  // the server never phrase the same rule two different ways.
  const vt = getClientDictionary(locale).validation;

  const unitOptions: Option[] = WEIGHT_UNITS.map((u) => ({
    value: u,
    label: label(u, locale),
  }));

  const [rebreedDays, setRebreedDays] = useState(() =>
    settings.rebreedAfterKindlingDays.toString()
  );
  // Set when a number over the ceiling was typed and pulled back down to it.
  // Shown instead of the hint until the next edit, so the correction is
  // explained rather than looking like the box swallowed a keystroke.
  const [rebreedClamped, setRebreedClamped] = useState(false);
  const [weaningDays, setWeaningDays] = useState(() => settings.weaningDays.toString());
  const [weaningClamped, setWeaningClamped] = useState(false);

  const weaningCap = maxWeaningDays(Number(rebreedDays) || 0);

  const onRebreedChange = (raw: string) => {
    const over = raw.trim() !== "" && Number(raw) > REBREED_MAX_DAYS;
    setRebreedClamped(over);
    const next = over ? String(REBREED_MAX_DAYS) : raw;
    setRebreedDays(next);
    // Shortening the rebreed interval lowers the weaning ceiling under a value
    // already in the box, so the cap has to be re-applied here too — otherwise
    // the form looks fine and the save is the first thing to complain.
    const cap = maxWeaningDays(Number(next) || 0);
    if (weaningDays.trim() !== "" && Number(weaningDays) > cap) {
      setWeaningDays(String(cap));
      setWeaningClamped(true);
    }
  };

  const onWeaningChange = (raw: string) => {
    const over = raw.trim() !== "" && Number(raw) > weaningCap;
    setWeaningClamped(over);
    setWeaningDays(over ? String(weaningCap) : raw);
  };
  const rebreedBand = rebreedSystemBand(Number(rebreedDays) || 0);
  const rebreedBadgeLabel = {
    intensive: t.rebreedIntensive,
    semiIntensive: t.rebreedSemiIntensive,
    natural: t.rebreedNatural,
  }[rebreedBand];
  // The same figure the report prints as «المستهدف حسب نظام إعادة التلقيح» —
  // read off REBREED_BAND_TARGET_CYCLES, never re-typed here, so the settings
  // page and the report can never promise two different targets.
  const rebreedCyclesLabel = t.rebreedCyclesBadge.replace(
    "{cycles}",
    String(REBREED_BAND_TARGET_CYCLES[rebreedBand])
  );

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
          {/* Before مدة انتظار الفطام, not after: the weaning ceiling is
              derived from this number, so it has to be the one already filled
              in when the farm reaches the field it caps. The two are also the
              only controlled fields in this card — their badge and their cap
              have to follow the typing, not wait for a save. */}
          <TextField
            name="rebreedAfterKindlingDays"
            type="number"
            min={0}
            max={REBREED_MAX_DAYS}
            label={t.rebreedLabel}
            value={rebreedDays}
            onChange={(ev) => onRebreedChange(ev.target.value)}
            hint={t.rebreedHint}
            error={
              e.rebreedAfterKindlingDays ??
              (rebreedClamped ? vt.rebreedMaxDays(REBREED_MAX_DAYS) : undefined)
            }
            badge={
              rebreedDays.trim() === "" ? null : (
                <>
                  <Badge variant="secondary">{rebreedBadgeLabel}</Badge>
                  <Badge variant="outline">{rebreedCyclesLabel}</Badge>
                </>
              )
            }
          />
          <TextField
            name="weaningDays"
            type="number"
            min={0}
            max={weaningCap}
            label={t.weaningDaysLabel}
            value={weaningDays}
            onChange={(ev) => onWeaningChange(ev.target.value)}
            hint={t.weaningDaysHint.replace("{max}", String(weaningCap))}
            error={
              e.weaningDays ?? (weaningClamped ? vt.weaningMaxDays(weaningCap) : undefined)
            }
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
        {/* The card with the most fields, and the one furthest from the button
            at the bottom of the form — so it gets its own. Same submit, same
            action: it saves the whole form, not this card alone. */}
        <CardFooter className="mt-6 justify-end">
          <SubmitButton>{t.saveButton}</SubmitButton>
        </CardFooter>
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
