/**
 * "اللف على الأمهات" — one screen for the daily farm round: walk past each
 * doe and record kindling, a nursing-kit death, the doe's own death, or an
 * illness, all in place. Every action here calls the exact same
 * outbox.enqueue ops the does/mortality/health pages already use
 * (markKindled/setLitterCount, recordNursingKitDeath, setRabbitStatus,
 * createHealthRecord) — nothing new is written to the local mirror, so the
 * data shows up on those pages automatically with no separate entry step.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { computeDoeBoardRow } from "@/lib/does-board";
import type { DoeState } from "@/lib/enums";
import { DISEASE_TYPES, diseaseTypeLabel, type DiseaseType } from "@/lib/health-conditions";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { toDateInputValue } from "@/lib/dates";
import { naturalCompare } from "@/lib/sortable";
import { getDb } from "../db/client";
import { fetchDoesBoard, type DoeRow } from "../db/queries";
import type { LocalSettings } from "../db/types";
import { enqueue } from "../sync/outbox";
import { DoeStateBadge, DoeAvailabilityToggle, KindleButton, LitterCountInput } from "../components/doe-state-menu";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const HEALTH_TYPE_KEYS = ["illness", "treatment", "vaccination", "deworming", "checkup"] as const;

export function RoundsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const rt = t.rounds;
  const [does, setDoes] = useState<DoeRow[] | null>(null);
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [search, setSearch] = useState("");
  const [nursingCounts, setNursingCounts] = useState<Record<string, number>>({});
  const [healthOpen, setHealthOpen] = useState<Record<string, boolean>>({});
  const [healthDraft, setHealthDraft] = useState<
    Record<string, { type: string; disease: DiseaseType; description: string }>
  >({});

  const refresh = useCallback(async () => {
    const db = await getDb();
    const data = await fetchDoesBoard(db);
    setDoes(data.does);
    setSettings(data.settings);
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

  const handleNursingDeath = async (breedingId: string, available: number, doeId: string) => {
    const count = nursingCounts[doeId] || 1;
    if (count < 1 || count > available) {
      toast.error(locale === "ar" ? "العدد غير صحيح" : "Invalid count");
      return;
    }
    if (!window.confirm(t.mortality.nursingKitDeathConfirm(count))) return;
    const { outcome } = await enqueue("recordNursingKitDeath", { breedingId, count });
    if (outcome.status === "rejected") {
      toast.error(outcome.resultMessage || t.mortality.recordDeathFailedFallback);
      return;
    }
    toast.success(t.mortality.kitDeathToast(count));
    void refresh();
  };

  const handleDoeDeath = async (doe: DoeRow) => {
    if (!window.confirm(t.mortality.motherDeathConfirm(doe.tagId ?? ""))) return;
    await enqueue("setRabbitStatus", { id: doe.id, status: "deceased" });
    toast.success(t.mortality.deceasedToast);
    void refresh();
  };

  const handleSaveHealth = async (doeId: string) => {
    const draft = healthDraft[doeId] ?? { type: "illness", disease: "other" as DiseaseType, description: "" };
    if (!draft.description.trim()) {
      toast.error(rt.healthDescriptionRequired);
      return;
    }
    await enqueue("createHealthRecord", {
      rabbitId: doeId,
      date: toDateInputValue(new Date()),
      type: draft.type,
      description: draft.description.trim(),
      nextDueDate: null,
    });
    toast.success(rt.healthSavedToast);
    setHealthOpen((s) => ({ ...s, [doeId]: false }));
    setHealthDraft((s) => ({ ...s, [doeId]: { type: "illness", disease: "other", description: "" } }));
  };

  const sortedDoes = useMemo(
    () => [...(does ?? [])].sort((a, b) => naturalCompare(a.tagId ?? "", b.tagId ?? "")),
    [does]
  );
  const visibleDoes = useMemo(() => {
    const q = search.trim();
    if (!q) return sortedDoes;
    return sortedDoes.filter((d) => (d.tagId ?? "").includes(q));
  }, [sortedDoes, search]);

  if (does === null || settings === null) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  if (does.length === 0) {
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

      <div className="relative">
        <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={locale === "ar" ? "ابحث برقم الأم…" : "Search by doe number…"}
          className="ps-9"
        />
      </div>

      {visibleDoes.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">
          {locale === "ar" ? "لا توجد أم بهذا الرقم" : "No doe matches that number"}
        </p>
      ) : (
      <div className="space-y-3">
        {visibleDoes.map((doe) => {
          const { current: b, litterRow, countsRow, kindleActive } = computeDoeBoardRow(
            doe.doeState as DoeState,
            doe.status,
            doe.breedings,
            settings
          );
          const litter = litterRow?.litter ?? null;
          const nursingEligible = !!litter && !litter.weaningDate && litter.bornAlive > 0;
          const bornAlive = litter?.bornAlive ?? 0;
          const nursingCount = nursingCounts[doe.id] || 1;
          const healthDraftForDoe = healthDraft[doe.id] ?? { type: "illness", disease: "other" as DiseaseType, description: "" };

          return (
            <div key={doe.id} className="space-y-3 rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-semibold">{doe.tagId ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{doe.breed ?? "—"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge value={doe.status} locale={locale} />
                  <DoeStateBadge current={doe.doeState} locale={locale} />
                </div>
              </div>

              <DoeAvailabilityToggle id={doe.id} current={doe.status} locale={locale} onDone={refresh} />

              <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3">
                {/* Kindling */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">{rt.kindlingLabel}</span>
                  {kindleActive ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <KindleButton
                        breedingId={b?.id ?? ""}
                        doeId={doe.id}
                        text={t.does.kindleButton}
                        doeState={doe.doeState as DoeState}
                        locale={locale}
                        onDone={refresh}
                      />
                      <LitterCountInput
                        breedingId={countsRow?.id ?? ""}
                        field="bornAlive"
                        value={countsRow?.litter?.bornAlive ?? null}
                        disabled={!kindleActive}
                        locale={locale}
                        onDone={refresh}
                      />
                      <LitterCountInput
                        breedingId={countsRow?.id ?? ""}
                        field="bornDead"
                        value={countsRow?.litter?.bornDead ?? null}
                        disabled={!kindleActive}
                        locale={locale}
                        onDone={refresh}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{rt.notKindledYetNote}</span>
                  )}
                </div>

                {/* Nursing kit death */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">{rt.nursingDeathLabel}</span>
                  {nursingEligible ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={bornAlive}
                        value={nursingCount}
                        className="h-8 w-14 px-1.5 text-center text-xs"
                        onChange={(e) => {
                          const v = Math.min(bornAlive, Math.max(1, parseInt(e.target.value, 10) || 1));
                          setNursingCounts((s) => ({ ...s, [doe.id]: v }));
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                        onClick={() => handleNursingDeath(litterRow!.id, bornAlive, doe.id)}
                      >
                        {t.mortality.recordNursingDeathButton}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{rt.noNursingLitterNote}</span>
                  )}
                </div>

                {/* Doe death + health */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">{rt.healthLabel}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => setHealthOpen((s) => ({ ...s, [doe.id]: !s[doe.id] }))}
                    >
                      {rt.healthAddButton}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                      onClick={() => handleDoeDeath(doe)}
                    >
                      {rt.doeDeathButton}
                    </Button>
                  </div>
                </div>
              </div>

              {healthOpen[doe.id] ? (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      items={HEALTH_TYPE_KEYS.map((value) => ({ value, label: typeLabels[value] }))}
                      value={healthDraftForDoe.type}
                      onValueChange={(v) =>
                        setHealthDraft((s) => ({ ...s, [doe.id]: { ...healthDraftForDoe, type: v ?? "illness" } }))
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
                    {healthDraftForDoe.type === "illness" ? (
                      <Select
                        items={DISEASE_TYPES.map((value) => ({ value, label: diseaseTypeLabel(value, locale) }))}
                        value={healthDraftForDoe.disease}
                        onValueChange={(v) => {
                          const disease = (v ?? "other") as DiseaseType;
                          setHealthDraft((s) => ({
                            ...s,
                            [doe.id]: {
                              ...healthDraftForDoe,
                              disease,
                              description: disease === "other" ? "" : diseaseTypeLabel(disease, locale),
                            },
                          }));
                        }}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DISEASE_TYPES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {diseaseTypeLabel(value, locale)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <Input
                      value={healthDraftForDoe.description}
                      onChange={(e) =>
                        setHealthDraft((s) => ({
                          ...s,
                          [doe.id]: { ...healthDraftForDoe, description: e.target.value },
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
                      onClick={() => setHealthOpen((s) => ({ ...s, [doe.id]: false }))}
                    >
                      {rt.healthCancelButton}
                    </Button>
                    <Button size="sm" className="h-8 px-2.5 text-xs" onClick={() => handleSaveHealth(doe.id)}>
                      {rt.healthSaveButton}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
