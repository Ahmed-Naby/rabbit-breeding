import { useEffect, useState, useCallback, useTransition } from "react";
import { X, Save, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchSettingsPageData, type LocalBreed } from "../db/queries";
import { enqueue } from "../sync/outbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LocalSettings } from "../db/types";

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
              <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v ?? "kg")} disabled={savingSettings}>
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
                <Select value={rebreedAfterKindlingDays} onValueChange={(v) => setRebreedAfterKindlingDays(v ?? "0")} disabled={savingSettings}>
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
    </div>
  );
}
