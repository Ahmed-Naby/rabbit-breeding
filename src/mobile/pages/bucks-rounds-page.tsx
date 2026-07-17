/**
 * "اللف على الذكور" — buck counterpart to rounds-page.tsx: walk past each
 * buck and record its death or an illness in place. Uses the exact same
 * outbox ops the bucks/mortality/health pages already use (setRabbitStatus,
 * createHealthRecord), so nothing new is written to the local mirror.
 */
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { BUCK_DISEASE_TYPES, diseaseTypeLabel, type DiseaseType } from "@/lib/health-conditions";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { toDateInputValue } from "@/lib/dates";
import { getDb } from "../db/client";
import { fetchBucksPageData } from "../db/queries";
import { enqueue } from "../sync/outbox";
import { DoeAvailabilityToggle } from "../components/doe-state-menu";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const HEALTH_TYPE_KEYS = ["illness", "treatment", "vaccination", "deworming", "checkup"] as const;

type Buck = { id: string; tagId: string | null; breed: string | null; status: string };

export function BucksRoundsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const rt = t.bucksRounds;
  const [bucks, setBucks] = useState<Buck[] | null>(null);
  const [healthOpen, setHealthOpen] = useState<Record<string, boolean>>({});
  const [healthDraft, setHealthDraft] = useState<
    Record<string, { type: string; disease: DiseaseType; description: string }>
  >({});

  const refresh = useCallback(async () => {
    const db = await getDb();
    const data = await fetchBucksPageData(db);
    setBucks(data.bucks);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const typeLabels: Record<string, string> = {
    illness: locale === "ar" ? "مرض" : "Illness",
    treatment: locale === "ar" ? "علاج" : "Treatment",
    vaccination: locale === "ar" ? "تحصين" : "Vaccination",
    deworming: locale === "ar" ? "مضاد طفيليات" : "Deworming",
    checkup: locale === "ar" ? "فحص دوري" : "Checkup",
  };

  const handleBuckDeath = async (buck: Buck) => {
    if (!window.confirm(t.mortality.buckDeathConfirm(buck.tagId ?? ""))) return;
    await enqueue("setRabbitStatus", { id: buck.id, status: "deceased" });
    toast.success(t.mortality.deceasedToast);
    void refresh();
  };

  const handleSaveHealth = async (buckId: string) => {
    const draft = healthDraft[buckId] ?? { type: "illness", disease: "mange" as DiseaseType, description: "" };
    if (!draft.description.trim()) {
      toast.error(rt.healthDescriptionRequired);
      return;
    }
    await enqueue("createHealthRecord", {
      rabbitId: buckId,
      date: toDateInputValue(new Date()),
      type: draft.type,
      description: draft.description.trim(),
      nextDueDate: null,
    });
    toast.success(rt.healthSavedToast);
    setHealthOpen((s) => ({ ...s, [buckId]: false }));
    setHealthDraft((s) => ({ ...s, [buckId]: { type: "illness", disease: "mange", description: "" } }));
  };

  if (bucks === null) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  if (bucks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
        <ClipboardCheck className="h-8 w-8" />
        <p className="font-medium">{rt.emptyTitle}</p>
        <p className="text-sm">{rt.emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{rt.title}</h1>
        <p className="text-sm text-muted-foreground">{rt.description}</p>
      </div>

      <div className="space-y-3">
        {bucks.map((buck) => {
          const healthDraftForBuck = healthDraft[buck.id] ?? { type: "illness", disease: "mange" as DiseaseType, description: "" };

          return (
            <div key={buck.id} className="space-y-3 rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-semibold">{buck.tagId ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{buck.breed ?? "—"}</span>
                </div>
                <StatusBadge value={buck.status} locale={locale} />
              </div>

              <DoeAvailabilityToggle id={buck.id} current={buck.status} locale={locale} onDone={refresh} />

              <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
                <span className="text-[11px] font-medium text-muted-foreground me-1">{rt.healthLabel}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setHealthOpen((s) => ({ ...s, [buck.id]: !s[buck.id] }))}
                >
                  {rt.healthAddButton}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                  onClick={() => handleBuckDeath(buck)}
                >
                  {rt.deathButton}
                </Button>
              </div>

              {healthOpen[buck.id] ? (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      items={HEALTH_TYPE_KEYS.map((value) => ({ value, label: typeLabels[value] }))}
                      value={healthDraftForBuck.type}
                      onValueChange={(v) =>
                        setHealthDraft((s) => ({ ...s, [buck.id]: { ...healthDraftForBuck, type: v ?? "illness" } }))
                      }
                    >
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HEALTH_TYPE_KEYS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {typeLabels[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {healthDraftForBuck.type === "illness" ? (
                      <Select
                        items={BUCK_DISEASE_TYPES.map((value) => ({ value, label: diseaseTypeLabel(value, locale) }))}
                        value={healthDraftForBuck.disease}
                        onValueChange={(v) => {
                          const disease = (v ?? "mange") as DiseaseType;
                          setHealthDraft((s) => ({
                            ...s,
                            [buck.id]: {
                              ...healthDraftForBuck,
                              disease,
                              description: diseaseTypeLabel(disease, locale),
                            },
                          }));
                        }}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUCK_DISEASE_TYPES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {diseaseTypeLabel(value, locale)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <Input
                      value={healthDraftForBuck.description}
                      onChange={(e) =>
                        setHealthDraft((s) => ({
                          ...s,
                          [buck.id]: { ...healthDraftForBuck, description: e.target.value },
                        }))
                      }
                      placeholder={rt.healthDescriptionPlaceholder}
                      className="h-8 min-w-40 flex-1 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => setHealthOpen((s) => ({ ...s, [buck.id]: false }))}
                    >
                      {rt.healthCancelButton}
                    </Button>
                    <Button size="sm" className="h-8 px-2.5 text-xs" onClick={() => handleSaveHealth(buck.id)}>
                      {rt.healthSaveButton}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
