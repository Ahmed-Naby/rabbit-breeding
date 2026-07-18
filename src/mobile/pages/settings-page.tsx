import { useEffect, useState, useCallback, useTransition, useRef } from "react";
import { X, Save, Plus, DownloadCloud, UploadCloud, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchSettingsPageData, type LocalBreed } from "../db/queries";
import { enqueue } from "../sync/outbox";
import {
  exportBackup,
  restoreBackup,
  resetDatabase,
  exportOnlineBackup,
  wipeOnlineDatabase,
  restoreOnlineDatabase,
} from "../db/backup";
import { syncNow, getSyncStatus } from "../sync/sync-manager";
import { WIPE_CONFIRM_PHRASE } from "@/lib/sync/wipe-confirm-phrase";
import { RESTORE_CONFIRM_PHRASE } from "@/lib/sync/restore-confirm-phrase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { LocalSettings } from "../db/types";

function backupFilename(): string {
  const date = new Date().toISOString().split("T")[0];
  return `rabbittrack-backup-${date}.json`;
}

function onlineBackupFilename(): string {
  const date = new Date().toISOString().split("T")[0];
  return `rabbittrack-online-backup-${date}.json`;
}

/** Android WebViews don't honor `<a download>`, so the file is written to
 * cache and handed to the native share sheet; Electron's renderer is plain
 * Chromium, where a Blob download works directly. */
async function saveBackupFile(json: string, filename: string): Promise<void> {
  if (Capacitor.getPlatform() === "android") {
    await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: filename });
    await Share.share({ title: filename, url: uri });
    return;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function FieldLayout({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground leading-normal">{hint}</p>}
    </div>
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
  const [weaningDays, setWeaningDays] = useState("");
  const [nestBoxDays, setNestBoxDays] = useState("");
  const [matingWeightGrams, setMatingWeightGrams] = useState("");
  const [rebreedAfterKindlingDays, setRebreedAfterKindlingDays] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [savingSettings, setSavingSettings] = useState(false);

  // New Breed field state
  const [newBreedName, setNewBreedName] = useState("");
  const [savingBreed, setSavingBreed] = useState(false);

  const [deletingBreedId, setDeletingBreedId] = useState<string | null>(null);
  const [deletingBreedTransition, startDeletingBreed] = useTransition();

  // Backup / restore state
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Reset (danger zone) state. localBackupDownloaded gates the reset
  // button the same way onlineBackupDownloaded gates the online wipe below
  // — deliberately session/render state, not persisted, so every reset
  // attempt requires a fresh backup rather than trusting a stale flag.
  const [resetting, setResetting] = useState(false);
  const [localBackupDownloaded, setLocalBackupDownloaded] = useState(false);

  // Wipe online database (danger zone) state. onlineBackupDownloaded is
  // deliberately session/render state, not persisted anywhere — every wipe
  // attempt requires a fresh download, so there's no stale "I already backed
  // up an hour ago" flag to rely on.
  const [downloadingOnlineBackup, setDownloadingOnlineBackup] = useState(false);
  const [onlineBackupDownloaded, setOnlineBackupDownloaded] = useState(false);
  const [wipingOnline, setWipingOnline] = useState(false);
  const [restoringOnline, setRestoringOnline] = useState(false);
  const restoreOnlineInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchSettingsPageData(db);
    setSettings(res.settings);
    setBreeds(res.breeds);

    // Populate state fields
    setWeightUnit(res.settings.weightUnit);
    setGestationDays(String(res.settings.gestationDays));
    setGestationWindowDays(String(res.settings.gestationWindowDays));
    setPregnancyTestDays(String(res.settings.pregnancyTestDays));
    setWeaningDays(String(res.settings.weaningDays));
    setNestBoxDays(String(res.settings.nestBoxDays));
    setMatingWeightGrams(String(res.settings.matingWeightGrams));
    setRebreedAfterKindlingDays(String(res.settings.rebreedAfterKindlingDays));
    setCurrency(res.settings.currency);
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
        weaningDays: parseInt(weaningDays, 10),
        nestBoxDays: parseInt(nestBoxDays, 10),
        matingWeightGrams: parseInt(matingWeightGrams, 10),
        rebreedAfterKindlingDays: parseInt(rebreedAfterKindlingDays, 10),
        currency,
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
      setLocalBackupDownloaded(true);
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

  const handleResetDatabase = async () => {
    if (!localBackupDownloaded) return;
    const pendingCount = getSyncStatus().pendingCount;
    if (!window.confirm(t.mobileSettings.resetConfirm(pendingCount))) return;

    setResetting(true);
    try {
      await resetDatabase();
      toast.success(t.mobileSettings.resetSuccessToast);
      try {
        await syncNow();
      } catch {
        // Offline or server unreachable — the periodic/resume sync will
        // pick it up once connectivity returns; the reload below still
        // shows the (now empty) local state in the meantime.
      }
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
      setResetting(false);
    }
  };

  const handleDownloadOnlineBackup = async () => {
    setDownloadingOnlineBackup(true);
    try {
      const json = await exportOnlineBackup();
      await saveBackupFile(json, onlineBackupFilename());
      setOnlineBackupDownloaded(true);
      toast.success(t.mobileSettings.onlineBackupSuccessToast);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setDownloadingOnlineBackup(false);
    }
  };

  const handleWipeOnlineDatabase = async () => {
    if (!onlineBackupDownloaded) return;
    if (!window.confirm(t.mobileSettings.wipeOnlineConfirmWarning)) return;

    const typed = window.prompt(t.mobileSettings.wipeOnlinePrompt);
    if (typed === null) return; // user cancelled the prompt
    if (typed !== WIPE_CONFIRM_PHRASE) {
      toast.error(t.mobileSettings.wipeOnlineMismatch);
      return;
    }

    setWipingOnline(true);
    try {
      await wipeOnlineDatabase(typed);
      toast.success(t.mobileSettings.wipeOnlineSuccessToast);
      try {
        await syncNow();
      } catch {
        // Offline right after wiping — the local mirror still shows stale
        // data until the next successful sync notices dataResetAt and
        // wipes+re-bootstraps this device (see pull() in sync-manager.ts).
      }
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
      setWipingOnline(false);
    }
  };

  const handleRestoreOnlineFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!onlineBackupDownloaded) return;
    if (!window.confirm(t.mobileSettings.restoreOnlineConfirmWarning)) return;

    const typed = window.prompt(t.mobileSettings.restoreOnlinePrompt);
    if (typed === null) return; // user cancelled the prompt
    if (typed !== RESTORE_CONFIRM_PHRASE) {
      toast.error(t.mobileSettings.restoreOnlineMismatch);
      return;
    }

    setRestoringOnline(true);
    try {
      const text = await file.text();
      await restoreOnlineDatabase(typed, text);
      toast.success(t.mobileSettings.restoreOnlineSuccessToast);
      try {
        await syncNow();
      } catch {
        // Offline right after restoring — the local mirror still shows stale
        // data until the next successful sync notices dataResetAt and
        // wipes+re-bootstraps this device (see pull() in sync-manager.ts).
      }
      window.location.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      toast.error(message === "INVALID_BACKUP_FILE" ? t.mobileSettings.restoreOnlineInvalidFile : message);
      setRestoringOnline(false);
    }
  };

  if (!settings) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  const rebreedOptions = [
    { value: "0", label: t.settings.rebreedIntensive },
    { value: "15", label: t.settings.rebreedSemiIntensive },
    { value: "30", label: t.settings.rebreedNatural },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{t.settings.description}</p>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <Card>
          <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2 p-6">
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
                <SelectTrigger id="weightUnit">
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

            <FieldLayout label={t.settings.weaningDaysLabel} hint={t.settings.weaningDaysHint}>
              <Input
                id="weaningDays"
                type="number"
                min={0}
                max={90}
                value={weaningDays}
                onChange={(e) => setWeaningDays(e.target.value)}
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

            <FieldLayout label={t.settings.matingWeightGramsLabel} hint={t.settings.matingWeightGramsHint}>
              <Input
                id="matingWeightGrams"
                type="number"
                min={1}
                value={matingWeightGrams}
                onChange={(e) => setMatingWeightGrams(e.target.value)}
                disabled={savingSettings}
              />
            </FieldLayout>

            <div className="sm:col-span-2">
              <FieldLayout label={t.settings.rebreedLabel} hint={t.settings.rebreedHint}>
                <Select
                  items={rebreedOptions}
                  value={rebreedAfterKindlingDays}
                  onValueChange={(v) => setRebreedAfterKindlingDays(v ?? "0")}
                  disabled={savingSettings}
                >
                  <SelectTrigger id="rebreedAfterKindlingDays">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rebreedOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldLayout>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={savingSettings} className="w-full py-5 text-sm font-semibold">
          {t.settings.saveButton}
        </Button>
      </form>

      {/* Breeds Management Card */}
      <Card>
        <CardContent className="space-y-4 p-6">
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

          <form onSubmit={handleAddBreed} className="flex items-end gap-3 pt-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm font-semibold">{t.settings.newBreedLabel}</Label>
              <Input
                placeholder={t.settings.newBreedPlaceholder}
                value={newBreedName}
                onChange={(e) => setNewBreedName(e.target.value)}
                disabled={savingBreed}
              />
            </div>
            <Button type="submit" disabled={savingBreed} className="h-10">
              {t.settings.addBreedButton}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Backup & Restore Card */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.mobileSettings.backupHeading}</h2>
            <p className="text-sm text-muted-foreground">{t.mobileSettings.backupDescription}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={backingUp || restoring}
              onClick={handleBackupNow}
              className="flex-1 gap-2"
            >
              <DownloadCloud className="size-4" />
              {backingUp ? t.mobileSettings.backingUpLabel : t.mobileSettings.backupButton}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={backingUp || restoring}
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
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone Card */}
      <Card className="border-destructive/30">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" />
            <h2 className="text-lg font-semibold tracking-tight text-destructive">{t.mobileSettings.dangerZoneHeading}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t.mobileSettings.resetDescription}</p>

          <Button
            type="button"
            variant="destructive"
            disabled={!localBackupDownloaded || resetting}
            onClick={handleResetDatabase}
            className="w-full sm:w-auto"
          >
            {resetting ? t.mobileSettings.resettingLabel : t.mobileSettings.resetButton}
          </Button>
          {!localBackupDownloaded && (
            <p className="text-xs text-muted-foreground">{t.mobileSettings.resetNeedsBackupHint}</p>
          )}

          <Separator />

          <div>
            <h3 className="text-base font-semibold tracking-tight text-destructive">
              {t.mobileSettings.wipeOnlineHeading}
            </h3>
            <p className="text-sm text-muted-foreground">{t.mobileSettings.wipeOnlineDescription}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={downloadingOnlineBackup || wipingOnline}
              onClick={handleDownloadOnlineBackup}
              className="flex-1 gap-2"
            >
              <DownloadCloud className="size-4" />
              {downloadingOnlineBackup
                ? t.mobileSettings.downloadingOnlineBackupLabel
                : t.mobileSettings.downloadOnlineBackupButton}
            </Button>

            <Button
              type="button"
              variant="destructive"
              disabled={!onlineBackupDownloaded || wipingOnline}
              onClick={handleWipeOnlineDatabase}
              className="flex-1"
            >
              {wipingOnline ? t.mobileSettings.wipingOnlineLabel : t.mobileSettings.wipeOnlineButton}
            </Button>
          </div>
          {!onlineBackupDownloaded && (
            <p className="text-xs text-muted-foreground">{t.mobileSettings.wipeOnlineNeedsBackupHint}</p>
          )}

          <Separator />

          <div>
            <h3 className="text-base font-semibold tracking-tight text-destructive">
              {t.mobileSettings.restoreOnlineHeading}
            </h3>
            <p className="text-sm text-muted-foreground">{t.mobileSettings.restoreOnlineDescription}</p>
          </div>

          <Button
            type="button"
            variant="destructive"
            disabled={!onlineBackupDownloaded || restoringOnline || wipingOnline}
            onClick={() => restoreOnlineInputRef.current?.click()}
            className="w-full gap-2 sm:w-auto"
          >
            <UploadCloud className="size-4" />
            {restoringOnline ? t.mobileSettings.restoringOnlineLabel : t.mobileSettings.restoreOnlineButton}
          </Button>
          <input
            ref={restoreOnlineInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleRestoreOnlineFileSelected}
          />
          {!onlineBackupDownloaded && (
            <p className="text-xs text-muted-foreground">{t.mobileSettings.restoreOnlineNeedsBackupHint}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
