import { useEffect, useState, useCallback, useTransition, useRef } from "react";
import { X, DownloadCloud, UploadCloud, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { saveTextFile } from "../lib/save-file";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchSettingsPageData, type LocalBreed } from "../db/queries";
import {
  computeFeedPlan,
  RATION_KEYS,
  type FeedRations,
  type HerdComposition,
} from "@/lib/feed-plan";
import { enqueue } from "../sync/outbox";
import { exportBackup, restoreBackup, resetEverything, resetOperations } from "../db/backup";
import { AccountCard } from "../components/account-card";
import { getSyncStatus } from "../sync/sync-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { rebreedSystemBand, REBREED_MAX_DAYS, maxWeaningDays } from "@/lib/does-board";
import { REBREED_BAND_TARGET_CYCLES } from "@/lib/herd-productivity";
import { Field } from "@/components/form-fields";
import { formatMoney, fromCents, toCents } from "@/lib/units";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LocalSettings } from "../db/types";
import { PageSkeleton } from "@/components/skeleton";
import { PageHeader } from "@/components/page-header";

function backupFilename(): string {
  const date = new Date().toISOString().split("T")[0];
  return `rabbittrack-backup-${date}.json`;
}

function saveBackupFile(json: string, filename: string): Promise<void> {
  return saveTextFile(json, filename, "application/json");
}

/**
 * Delegates to the web form's Field so the offline settings screen cannot drift
 * from src/app/settings/settings-form.tsx — it had its own heavier label and
 * hint styling, which is the whole reason the two looked different.
 */
function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function FieldLayout({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {children}
    </Field>
  );
}

export function SettingsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [breeds, setBreeds] = useState<LocalBreed[]>([]);

  // Settings fields state
  const [weightUnit, setWeightUnit] = useState("kg");
  const [gestationDays, setGestationDays] = useState("");
  const [gestationWindowDays, setGestationWindowDays] = useState("");
  const [pregnancyTestDays, setPregnancyTestDays] = useState("");
  const [palpationCheckDays, setPalpationCheckDays] = useState("");
  const [weaningDays, setWeaningDays] = useState("");
  const [nestBoxDays, setNestBoxDays] = useState("");
  const [matingWeightGrams, setMatingWeightGrams] = useState("");
  const [rebreedAfterKindlingDays, setRebreedAfterKindlingDays] = useState("0");
  // Set when a number over the ceiling was typed and pulled back down to it —
  // see onRebreedChange / onWeaningChange.
  const [rebreedClamped, setRebreedClamped] = useState(false);
  const [weaningClamped, setWeaningClamped] = useState(false);
  const [fosterWindowDays, setFosterWindowDays] = useState("");
  const [fosterHighKits, setFosterHighKits] = useState("");
  const [fosterLowKits, setFosterLowKits] = useState("");
  const [currency, setCurrency] = useState("EGP");
  // Money is entered in whole currency units and stored as cents, same as the
  // web form; "" means unset, which saves as 0.
  const [defaultPricePerKg, setDefaultPricePerKg] = useState("");
  const [feedPricePerTon, setFeedPricePerTon] = useState("");
  // One string per animal class, keyed by the Settings column name so the
  // save payload is a straight Object.fromEntries — see RATION_KEYS.
  const [rations, setRations] = useState<Record<string, string>>(() =>
    Object.fromEntries(RATION_KEYS.map((k) => [k, ""]))
  );
  const [composition, setComposition] = useState<HerdComposition>({
    doesIdle: 0,
    doesPregnant: 0,
    doesNursing: 0,
    bucks: 0,
    growers: 0,
    juveniles: 0,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const plan = computeFeedPlan(
    composition,
    Object.fromEntries(
      RATION_KEYS.map((k) => [k, Number(rations[k]) || 0])
    ) as unknown as FeedRations,
    toCents(Number(feedPricePerTon) || 0)
  );

  const RATION_FIELDS: {
    key: (typeof RATION_KEYS)[number];
    label: string;
    head: number;
  }[] = [
    { key: "feedGramsDoeIdlePerDay", label: t.settings.rationDoeIdleLabel, head: composition.doesIdle },
    { key: "feedGramsDoePregnantPerDay", label: t.settings.rationDoePregnantLabel, head: composition.doesPregnant },
    { key: "feedGramsDoeNursingPerDay", label: t.settings.rationDoeNursingLabel, head: composition.doesNursing },
    { key: "feedGramsBuckPerDay", label: t.settings.rationBuckLabel, head: composition.bucks },
    { key: "feedGramsGrowerPerDay", label: t.settings.rationGrowerLabel, head: composition.growers },
    { key: "feedGramsJuvenilePerDay", label: t.settings.rationJuvenileLabel, head: composition.juveniles },
  ];

  // New Breed field state
  const [newBreedName, setNewBreedName] = useState("");
  const [savingBreed, setSavingBreed] = useState(false);

  const [deletingBreedId, setDeletingBreedId] = useState<string | null>(null);
  const [deletingBreedTransition, startDeletingBreed] = useTransition();

  // Backup / restore / reset state
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resettingOps, setResettingOps] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const res = await fetchSettingsPageData(db);
      const s = res.settings ?? {
        id: 1,
        weightUnit: "kg",
        gestationDays: 30,
        gestationWindowDays: 3,
        pregnancyTestDays: 10,
        palpationCheckDays: 15,
        weaningDays: 28,
        nestBoxDays: 27,
        matingWeightGrams: 3000,
        rebreedAfterKindlingDays: 0,
        fosterWindowDays: 2,
        fosterHighKits: 8,
        fosterLowKits: 4,
        currency: "EGP",
        defaultPricePerKgCents: 0,
        feedPricePerTonCents: 0,
        feedGramsDoeIdlePerDay: 0,
        feedGramsDoePregnantPerDay: 0,
        feedGramsDoeNursingPerDay: 0,
        feedGramsBuckPerDay: 0,
        feedGramsGrowerPerDay: 0,
        feedGramsJuvenilePerDay: 0,
      };
      setSettings(s);
      setBreeds(res.breeds ?? []);

      // Populate state fields with safe fallbacks
      setWeightUnit(s.weightUnit ?? "kg");
      setGestationDays(String(s.gestationDays ?? 30));
      setGestationWindowDays(String(s.gestationWindowDays ?? 3));
      setPregnancyTestDays(String(s.pregnancyTestDays ?? 10));
      setPalpationCheckDays(String(s.palpationCheckDays ?? 15));
      setWeaningDays(String(s.weaningDays ?? 28));
      setNestBoxDays(String(s.nestBoxDays ?? 27));
      setMatingWeightGrams(String(s.matingWeightGrams ?? 3000));
      setRebreedAfterKindlingDays(String(s.rebreedAfterKindlingDays ?? 0));
      setFosterWindowDays(String(s.fosterWindowDays ?? 2));
      setFosterHighKits(String(s.fosterHighKits ?? 8));
      setFosterLowKits(String(s.fosterLowKits ?? 4));
      setCurrency(s.currency ?? "EGP");
      setDefaultPricePerKg(fromCents(s.defaultPricePerKgCents));
      setFeedPricePerTon(fromCents(s.feedPricePerTonCents));
      setRations(
        Object.fromEntries(RATION_KEYS.map((k) => [k, s[k] ? String(s[k]) : ""]))
      );
      setComposition(res.composition);
    } catch (err) {
      console.error("[SettingsPage] Error loading settings:", err);
      // Fallback settings so the page never gets stuck on infinite loading
      setSettings({
        id: 1,
        weightUnit: "kg",
        gestationDays: 30,
        gestationWindowDays: 3,
        pregnancyTestDays: 10,
        palpationCheckDays: 15,
        weaningDays: 28,
        nestBoxDays: 27,
        matingWeightGrams: 3000,
        rebreedAfterKindlingDays: 0,
        fosterWindowDays: 2,
        fosterHighKits: 8,
        fosterLowKits: 4,
        currency: "EGP",
        defaultPricePerKgCents: 0,
        feedPricePerTonCents: 0,
        feedGramsDoeIdlePerDay: 0,
        feedGramsDoePregnantPerDay: 0,
        feedGramsDoeNursingPerDay: 0,
        feedGramsBuckPerDay: 0,
        feedGramsGrowerPerDay: 0,
        feedGramsJuvenilePerDay: 0,
        recurringExpenses: null,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const payload = {
        weightUnit,
        gestationDays: parseInt(gestationDays, 10),
        gestationWindowDays: parseInt(gestationWindowDays, 10),
        pregnancyTestDays: parseInt(pregnancyTestDays, 10),
        palpationCheckDays: parseInt(palpationCheckDays, 10),
        // Clamped like rebreedAfterKindlingDays below, and to a ceiling that
        // moves with it — nothing on the sync path revalidates this op.
        weaningDays: Math.min(
          maxWeaningDays(Math.min(REBREED_MAX_DAYS, parseInt(rebreedAfterKindlingDays, 10) || 0)),
          Math.max(0, parseInt(weaningDays, 10) || 0)
        ),
        nestBoxDays: parseInt(nestBoxDays, 10),
        matingWeightGrams: parseInt(matingWeightGrams, 10),
        // Guarded unlike its neighbours: this one used to be a Select and now
        // takes free typing, so an emptied box is reachable — and 0 (تلقيح يوم
        // الولادة) is a real, safe value for it, not a silent wrong default.
        // Clamped to the same ceiling the web schema enforces, because nothing
        // on the sync path revalidates what this op carries.
        rebreedAfterKindlingDays: Math.min(
          REBREED_MAX_DAYS,
          Math.max(0, parseInt(rebreedAfterKindlingDays, 10) || 0)
        ),
        fosterWindowDays: parseInt(fosterWindowDays, 10),
        fosterHighKits: parseInt(fosterHighKits, 10),
        fosterLowKits: parseInt(fosterLowKits, 10),
        currency,
        defaultPricePerKgCents: toCents(parseFloat(defaultPricePerKg) || 0),
        feedPricePerTonCents: toCents(parseFloat(feedPricePerTon) || 0),
        ...Object.fromEntries(
          RATION_KEYS.map((k) => [k, parseInt(rations[k], 10) || 0])
        ),
      };

      await enqueue("updateSettings", payload);
      toast.success(t.settings.savedToast);
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddBreed = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBreedName.trim();
    if (!name) {
      toast.error(locale === "ar" ? "يرجى إدخال اسم السلالة" : "Please enter breed name");
      return;
    }

    setSavingBreed(true);
    try {
      await enqueue("addBreed", { name });
      toast.success(t.settings.breedAdded);
      setNewBreedName("");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSavingBreed(false);
    }
  };

  const handleDeleteBreed = async (id: string) => {
    setDeletingBreedId(id);
    startDeletingBreed(async () => {
      try {
        await enqueue("deleteBreed", { id });
        toast.success(t.settings.breedDeletedToast);
        void load();
      } catch (err: any) {
        toast.error(err.message || "Error");
      } finally {
        setDeletingBreedId(null);
      }
    });
  };

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      const json = await exportBackup();
      await saveBackupFile(json, backupFilename());
      toast.success(t.mobileSettings.backupSuccessToast);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm(t.mobileSettings.restoreConfirm)) return;

    setRestoring(true);
    try {
      const text = await file.text();
      await restoreBackup(text);
      toast.success(t.mobileSettings.restoreSuccessToast);
      window.location.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      toast.error(
        message === "INVALID_BACKUP_FILE"
          ? t.mobileSettings.restoreInvalidFile
          : message === "RESTORE_UPLOAD_FAILED"
            ? t.mobileSettings.restoreUploadFailed
            : message
      );
      setRestoring(false);
    }
  };

  const handleReset = async () => {
    const pendingCount = getSyncStatus().pendingCount;
    if (!window.confirm(t.mobileSettings.resetConfirm(pendingCount))) return;

    setResetting(true);
    try {
      // A reset is unrecoverable except from a backup file, and a restore
      // can only rewind to the moment its file was taken — so always save a
      // fresh backup right before wiping. If saving fails (or the user
      // cancels the Android share sheet), the reset aborts untouched.
      const json = await exportBackup();
      await saveBackupFile(json, backupFilename());

      await resetEverything();
      toast.success(t.mobileSettings.resetSuccessToast);
      window.location.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      toast.error(message === "RESET_OFFLINE" ? t.mobileSettings.resetOffline : message);
      setResetting(false);
    }
  };

  const handleResetOperations = async () => {
    const pendingCount = getSyncStatus().pendingCount;
    if (!window.confirm(t.mobileSettings.resetOpsConfirm(pendingCount))) return;

    setResettingOps(true);
    try {
      // Same reasoning as handleReset: an operations reset is unrecoverable
      // except from a backup file, so always save a fresh one right before
      // clearing (if it fails, the reset aborts untouched).
      const json = await exportBackup();
      await saveBackupFile(json, backupFilename());

      await resetOperations();
      toast.success(t.mobileSettings.resetOpsSuccessToast);
      window.location.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      toast.error(message === "RESET_OFFLINE" ? t.mobileSettings.resetOffline : message);
      setResettingOps(false);
    }
  };

  if (!settings) {
    return <PageSkeleton label={locale === "ar" ? "جارِ التحميل…" : "Loading…"} />;
  }

  const weaningCap = maxWeaningDays(Number(rebreedAfterKindlingDays) || 0);

  const onRebreedChange = (raw: string) => {
    const over = raw.trim() !== "" && Number(raw) > REBREED_MAX_DAYS;
    setRebreedClamped(over);
    const next = over ? String(REBREED_MAX_DAYS) : raw;
    setRebreedAfterKindlingDays(next);
    // Shortening the rebreed interval lowers the weaning ceiling under a value
    // already in the box, so the cap is re-applied here too.
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
  const rebreedBand = rebreedSystemBand(Number(rebreedAfterKindlingDays) || 0);
  const rebreedBadgeLabel = {
    intensive: t.settings.rebreedIntensive,
    semiIntensive: t.settings.rebreedSemiIntensive,
    natural: t.settings.rebreedNatural,
  }[rebreedBand];
  const rebreedCyclesLabel = t.settings.rebreedCyclesBadge.replace(
    "{cycles}",
    String(REBREED_BAND_TARGET_CYCLES[rebreedBand])
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.settings.title}
        description={t.settings.description}
      />

      <AccountCard locale={locale} />

      {/* Settings Form */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldLayout label={t.settings.weightUnitLabel} hint={t.settings.weightUnitHint}>
              <Select
                items={[
                  { value: "kg", label: "كيلوجرام" },
                  { value: "g", label: "جرام" },
                  { value: "lbs", label: "رطل" },
                ]}
                value={weightUnit}
                onValueChange={(v) => setWeightUnit(v ?? "kg")}
                disabled={savingSettings}
              >
                <SelectTrigger id="weightUnit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">كيلوجرام</SelectItem>
                  <SelectItem value="g">جرام</SelectItem>
                  <SelectItem value="lbs">رطل</SelectItem>
                </SelectContent>
              </Select>
            </FieldLayout>

            <FieldLayout label={t.settings.currencyLabel} hint={t.settings.currencyHint}>
              <Input
                id="currency"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <FieldLayout label={t.settings.gestationDaysLabel} hint={t.settings.gestationDaysHint}>
              <Input
                id="gestationDays"
                type="number"
                min={1}
                max={60}
                value={gestationDays}
                onChange={(e) => setGestationDays(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <FieldLayout label={t.settings.gestationWindowDaysLabel} hint={t.settings.gestationWindowDaysHint}>
              <Input
                id="gestationWindowDays"
                type="number"
                min={0}
                max={14}
                value={gestationWindowDays}
                onChange={(e) => setGestationWindowDays(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <FieldLayout label={t.settings.pregnancyTestDaysLabel} hint={t.settings.pregnancyTestDaysHint}>
              <Input
                id="pregnancyTestDays"
                type="number"
                min={1}
                max={30}
                value={pregnancyTestDays}
                onChange={(e) => setPregnancyTestDays(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <FieldLayout label={t.settings.palpationCheckDaysLabel} hint={t.settings.palpationCheckDaysHint}>
              <Input
                id="palpationCheckDays"
                type="number"
                min={1}
                max={30}
                value={palpationCheckDays}
                onChange={(e) => setPalpationCheckDays(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            {/* Before مدة انتظار الفطام, not after: the weaning ceiling is
                derived from this number, so it has to be the one already
                filled in when the farm reaches the field it caps. */}
            <FieldLayout
              label={t.settings.rebreedLabel}
              hint={t.settings.rebreedHint}
              error={rebreedClamped ? t.validation.rebreedMaxDays(REBREED_MAX_DAYS) : undefined}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-24 flex-1">
                  <Input
                    id="rebreedAfterKindlingDays"
                    type="number"
                    min={0}
                    max={REBREED_MAX_DAYS}
                    value={rebreedAfterKindlingDays}
                    onChange={(e) => onRebreedChange(e.target.value)}
                    disabled={savingSettings}
                  />
                </div>
                {rebreedAfterKindlingDays.trim() === "" ? null : (
                  <>
                    <Badge variant="secondary">{rebreedBadgeLabel}</Badge>
                    <Badge variant="outline">{rebreedCyclesLabel}</Badge>
                  </>
                )}
              </div>
            </FieldLayout>

            <FieldLayout
              label={t.settings.weaningDaysLabel}
              hint={t.settings.weaningDaysHint.replace("{max}", String(weaningCap))}
              error={weaningClamped ? t.validation.weaningMaxDays(weaningCap) : undefined}
            >
              <Input
                id="weaningDays"
                type="number"
                min={0}
                max={weaningCap}
                value={weaningDays}
                onChange={(e) => onWeaningChange(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <FieldLayout label={t.settings.nestBoxDaysLabel} hint={t.settings.nestBoxDaysHint}>
              <Input
                id="nestBoxDays"
                type="number"
                min={1}
                max={30}
                value={nestBoxDays}
                onChange={(e) => setNestBoxDays(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <FieldLayout label={t.settings.fosterWindowDaysLabel} hint={t.settings.fosterWindowDaysHint}>
              <Input
                id="fosterWindowDays"
                type="number"
                min={0}
                max={14}
                value={fosterWindowDays}
                onChange={(e) => setFosterWindowDays(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <FieldLayout label={t.settings.fosterHighKitsLabel} hint={t.settings.fosterHighKitsHint}>
              <Input
                id="fosterHighKits"
                type="number"
                min={1}
                max={20}
                value={fosterHighKits}
                onChange={(e) => setFosterHighKits(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <FieldLayout label={t.settings.fosterLowKitsLabel} hint={t.settings.fosterLowKitsHint}>
              <Input
                id="fosterLowKits"
                type="number"
                min={0}
                max={20}
                value={fosterLowKits}
                onChange={(e) => setFosterLowKits(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>
          </CardContent>
          {/* A save within reach of the fields, rather than one button under
              a page of them. Same submit in every card: it saves the whole
              form, not the card it sits in. */}
          <CardFooter className="mt-6 justify-end">
            <Button type="submit" disabled={savingSettings}>
              {t.settings.saveButton}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="font-medium">{t.settings.pricingSectionTitle}</h2>
              <p className="text-xs text-muted-foreground">{t.settings.pricingSectionHint}</p>
            </div>

            <FieldLayout
              label={`${t.settings.defaultPricePerKgLabel} (${currency})`}
              hint={t.settings.defaultPricePerKgHint}
            >
              <Input
                id="defaultPricePerKg"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={defaultPricePerKg}
                onChange={(e) => setDefaultPricePerKg(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <FieldLayout
              label={`${t.settings.feedPricePerTonLabel} (${currency})`}
              hint={t.settings.feedPricePerTonHint}
            >
              <Input
                id="feedPricePerTon"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={feedPricePerTon}
                onChange={(e) => setFeedPricePerTon(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>
          </CardContent>
          <CardFooter className="mt-6 justify-end">
            <Button type="submit" disabled={savingSettings}>
              {t.settings.saveButton}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="font-medium">{t.settings.rationsSectionTitle}</h2>
              <p className="text-xs text-muted-foreground">
                {t.settings.rationsSectionHint}
              </p>
            </div>

            {RATION_FIELDS.map((f) => (
              <FieldLayout
                key={f.key}
                label={`${f.label} · ${f.head} ${t.settings.feedPlanHeadUnit}`}
              >
                <Input
                  id={f.key}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={5000}
                  value={rations[f.key] ?? ""}
                  onChange={(e) =>
                    setRations((r) => ({ ...r, [f.key]: e.target.value }))
                  }
                  disabled={savingSettings}
                />
              </FieldLayout>
            ))}

            {/* Same live plan as the web form — the rations only mean
                something multiplied out over the herd that exists. */}
            <div className="rounded-md border border-dashed p-3 text-sm">
              <div className="font-medium">{t.settings.feedPlanTitle}</div>
              {plan.gramsPerDay > 0 ? (
                <>
                  <dl className="mt-2 space-y-1">
                    <PlanRow
                      label={t.settings.feedPlanKgPerMonthLabel}
                      value={`${Math.round(plan.kgPerMonth).toLocaleString(locale)} ${
                        locale === "ar" ? "كجم" : "kg"
                      }`}
                    />
                    <PlanRow
                      label={t.settings.feedPlanCostPerMonthLabel}
                      value={
                        plan.costPerMonthCents != null
                          ? formatMoney(plan.costPerMonthCents, currency)
                          : "—"
                      }
                    />
                    <PlanRow
                      label={t.settings.feedCostPerDoePerDayLabel}
                      value={
                        plan.costPerDoePerDayCents != null
                          ? formatMoney(plan.costPerDoePerDayCents, currency)
                          : "—"
                      }
                    />
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t.settings.feedPlanNote}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.settings.feedPlanEmpty}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="mt-6 justify-end">
            <Button type="submit" disabled={savingSettings}>
              {t.settings.saveButton}
            </Button>
          </CardFooter>
        </Card>
        {/* No loose button under the last card any more — it would sit right
            under that card's own footer as a second identical save. */}
      </form>

      {/* Breeds Management Card */}
      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.settings.breedsHeading}</h2>
            <p className="text-sm text-muted-foreground">{t.settings.breedsDescription}</p>
          </div>

          {breeds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.settings.noBreeds}</p>
          ) : (
            <div className="flex flex-wrap gap-2 py-2">
              {breeds.map((b) => {
                const pendingDelete = deletingBreedTransition && deletingBreedId === b.id;
                return (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pe-1 ps-3 text-sm"
                  >
                    {b.name}
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pendingDelete}
                      className="size-5 rounded-full p-0 flex items-center justify-center hover:bg-destructive/10"
                      onClick={() => handleDeleteBreed(b.id)}
                    >
                      <X className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </span>
                );
              })}
            </div>
          )}

          <form onSubmit={handleAddBreed} className="flex items-end gap-3">
            <Field label={t.settings.newBreedLabel} className="flex-1">
              <Input
                placeholder={t.settings.newBreedPlaceholder}
                value={newBreedName}
                onChange={(e) => setNewBreedName(e.target.value)}
                disabled={savingBreed}
              />
            </Field>
            <Button type="submit" disabled={savingBreed}>
              {t.settings.addBreedButton}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Backup / Restore / Reset Card */}
      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.mobileSettings.backupHeading}</h2>
            <p className="text-sm text-muted-foreground">{t.mobileSettings.backupDescription}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={backingUp || restoring || resetting || resettingOps}
              onClick={handleBackupNow}
              className="flex-1 gap-2"
            >
              <DownloadCloud className="size-4" />
              {backingUp ? t.mobileSettings.backingUpLabel : t.mobileSettings.backupButton}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={backingUp || restoring || resetting || resettingOps}
              onClick={() => restoreInputRef.current?.click()}
              className="flex-1 gap-2"
            >
              <UploadCloud className="size-4" />
              {restoring ? t.mobileSettings.restoringLabel : t.mobileSettings.restoreButton}
            </Button>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleRestoreFileSelected}
            />

            <Button
              type="button"
              variant="destructive"
              disabled={backingUp || restoring || resetting || resettingOps}
              onClick={handleReset}
              className="flex-1 gap-2"
            >
              <TriangleAlert className="size-4" />
              {resetting ? t.mobileSettings.resettingLabel : t.mobileSettings.resetButton}
            </Button>
          </div>

          <div className="border-t pt-4">
            <Button
              type="button"
              variant="destructive"
              disabled={backingUp || restoring || resetting || resettingOps}
              onClick={handleResetOperations}
              className="w-full gap-2"
            >
              <TriangleAlert className="size-4" />
              {resettingOps ? t.mobileSettings.resettingOpsLabel : t.mobileSettings.resetOpsButton}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground leading-normal">
              {t.settings.resetOpsKeepNote}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
