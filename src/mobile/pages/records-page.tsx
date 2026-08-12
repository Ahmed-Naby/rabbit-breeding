import { useEffect, useState, useCallback } from "react";
import { HeartHandshake, Microscope, Droplets, HeartPulse, Milk, ArrowLeftRight, Skull, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { isWithinDateRange, presetRange } from "@/lib/dates";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getDb } from "../db/client";
import { useDbRefresh } from "../lib/use-db-refresh";
import {
  fetchMatingPageData,
  fetchPregnancyPageData,
  fetchResorptionPageData,
  fetchKindlingPageData,
  fetchWeaningPageData,
  fetchFosteringPageData,
  fetchMortalityPageData,
  type MatingLogEntry,
  type PregnancyTestLogEntry,
  type ResorptionLogEntry,
  type KindlingLogEntry,
  type WeanedLitterLogEntry,
  type LocalFosterLogEntry,
  type LocalDeceasedRabbit,
  type LocalKitDeath,
} from "../db/queries";
import { MatingLog } from "./mating-log";
import { PregnancyTestLog } from "./pregnancy-test-log";
import { ResorptionLog } from "./resorption-log";
import { KindlingLog } from "./kindling-log";
import { WeaningLog } from "./weaning-log";
import { FosteringLog } from "./fostering-log";
import { MortalityLog } from "./mortality-log";
import { CullingLog } from "./culling-log";
import { PageSkeleton } from "@/components/skeleton";
import { PageHeader } from "@/components/page-header";

type RecordsTab =
  | "mating"
  | "pregnancy-test"
  | "resorption"
  | "kindling"
  | "weaning"
  | "fostering"
  | "mortality"
  | "culling";

function LoadingLine({ locale }: { locale: Locale }) {
  // No stat cards: a records tab is a table and a date filter, nothing else,
  // so blocking out cards here would promise a row that never arrives.
  return <PageSkeleton label={locale === "ar" ? "جارِ التحميل…" : "Loading…"} cards={0} />;
}

type DateRange = { from: string; to: string };

function MatingLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [matingLog, setMatingLog] = useState<MatingLogEntry[] | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchMatingPageData(db);
    setMatingLog(res.matingLog);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  if (matingLog === null) return <LoadingLine locale={locale} />;
  const filtered = matingLog.filter((row) => isWithinDateRange(row.matingDate, range.from, range.to));
  return <MatingLog matingLog={filtered} locale={locale} />;
}

function PregnancyTestLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [testLog, setTestLog] = useState<PregnancyTestLogEntry[] | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchPregnancyPageData(db);
    setTestLog(res.testLog);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  if (testLog === null) return <LoadingLine locale={locale} />;
  const filtered = testLog.filter((row) => isWithinDateRange(row.testDate, range.from, range.to));
  return <PregnancyTestLog testLog={filtered} locale={locale} />;
}

function ResorptionLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [resorptionLog, setResorptionLog] = useState<ResorptionLogEntry[] | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchResorptionPageData(db);
    setResorptionLog(res.resorptionLog);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  if (resorptionLog === null) return <LoadingLine locale={locale} />;
  const filtered = resorptionLog.filter((row) => isWithinDateRange(row.resorptionDate, range.from, range.to));
  return <ResorptionLog resorptionLog={filtered} locale={locale} />;
}

function KindlingLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [kindlingLog, setKindlingLog] = useState<KindlingLogEntry[] | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchKindlingPageData(db);
    setKindlingLog(res.kindlingLog);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  if (kindlingLog === null) return <LoadingLine locale={locale} />;
  const filtered = kindlingLog.filter((row) => isWithinDateRange(row.kindlingDate, range.from, range.to));
  return <KindlingLog kindlingLog={filtered} locale={locale} />;
}

function WeaningLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [weanedLog, setWeanedLog] = useState<WeanedLitterLogEntry[] | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchWeaningPageData(db);
    setWeanedLog(res.weanedLog);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  if (weanedLog === null) return <LoadingLine locale={locale} />;
  const filtered = weanedLog.filter((row) => isWithinDateRange(row.weaningDate, range.from, range.to));
  return <WeaningLog weanedLog={filtered} locale={locale} />;
}

function FosteringLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const t = getClientDictionary(locale);
  const [logs, setLogs] = useState<LocalFosterLogEntry[] | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchFosteringPageData(db);
    setLogs(res.logs);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  if (logs === null) return <LoadingLine locale={locale} />;
  const filtered = logs.filter((row) => isWithinDateRange(row.date, range.from, range.to));
  return <FosteringLog logs={filtered} t={t} />;
}

function MortalityLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [data, setData] = useState<{
    deceasedRabbits: LocalDeceasedRabbit[];
    kitDeaths: LocalKitDeath[];
  } | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchMortalityPageData(db);
    setData({ deceasedRabbits: res.deceasedRabbits, kitDeaths: res.kitDeaths });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  if (data === null) return <LoadingLine locale={locale} />;
  const filtered = data.deceasedRabbits.filter((row) => isWithinDateRange(row.updatedAt, range.from, range.to));
  // Kit deaths carry their own event date, not updatedAt.
  const filteredKitDeaths = data.kitDeaths.filter((row) => isWithinDateRange(row.date, range.from, range.to));
  return <MortalityLog deceasedRabbits={filtered} kitDeaths={filteredKitDeaths} locale={locale} />;
}

function CullingLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [culledRabbits, setCulledRabbits] = useState<LocalDeceasedRabbit[] | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchMortalityPageData(db);
    setCulledRabbits(res.culledRabbits);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  if (culledRabbits === null) return <LoadingLine locale={locale} />;
  const filtered = culledRabbits.filter((row) => isWithinDateRange(row.updatedAt, range.from, range.to));
  return <CullingLog culledRabbits={filtered} locale={locale} />;
}

function tabFromRoute(hash: string): RecordsTab {
  if (hash.includes("tab=pregnancy-test")) return "pregnancy-test";
  if (hash.includes("tab=resorption")) return "resorption";
  if (hash.includes("tab=kindling")) return "kindling";
  if (hash.includes("tab=weaning")) return "weaning";
  if (hash.includes("tab=fostering")) return "fostering";
  if (hash.includes("tab=mortality")) return "mortality";
  if (hash.includes("tab=culling")) return "culling";
  return "mating";
}

/** `route` selects the tab on each fresh arrival — see DailyOperationsPage. */
export function RecordsPage({ locale, route = "" }: { locale: Locale; route?: string }) {
  const t = getClientDictionary(locale);
  const rt = t.records;

  const [activeTab, setActiveTab] = useState<RecordsTab>(() =>
    tabFromRoute(route || (typeof window !== "undefined" ? window.location.hash : ""))
  );
  const [lastRoute, setLastRoute] = useState(route);
  if (route !== lastRoute) {
    setLastRoute(route);
    setActiveTab(tabFromRoute(route));
  }

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range: DateRange = { from, to };

  return (
    <div className="space-y-6">
      <PageHeader
        title={rt.title}
        description={rt.description}
      />

      {/* Tabs first, then the range filter: the filter applies to whichever
          log is open, so picking the log comes before narrowing its dates. */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("mating")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "mating"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <HeartHandshake className="size-4 text-pink-500" />
          {rt.tabMating}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pregnancy-test")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "pregnancy-test"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Microscope className="size-4 text-purple-500" />
          {rt.tabPregnancyTest}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("kindling")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "kindling"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <HeartPulse className="size-4 text-emerald-500" />
          {rt.tabKindling}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("weaning")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "weaning"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Milk className="size-4 text-sky-500" />
          {rt.tabWeaning}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("fostering")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "fostering"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <ArrowLeftRight className="size-4 text-indigo-500" />
          {rt.tabFostering}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mortality")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "mortality"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Skull className="size-4 text-slate-500" />
          {rt.tabMortality}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("culling")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "culling"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Trash2 className="size-4 text-orange-500" />
          {rt.tabCulling}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("resorption")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "resorption"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Droplets className="size-4 text-cyan-500" />
          {rt.tabResorption}
        </button>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4">
          {/* One press fills both boxes; the table filters off state, so there
              is nothing to apply afterwards. «من بداية التشغيل» is the empty
              pair «إلغاء التصفية» produced, named for what it shows. */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["month", rt.rangeMonthButton],
                ["quarter", rt.rangeQuarterButton],
                ["year", rt.rangeYearButton],
                ["all", rt.rangeAllButton],
              ] as const
            ).map(([preset, label]) => {
              const range = presetRange(preset);
              const active = from === range.from && to === range.to;
              return (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  disabled={active}
                  onClick={() => {
                    setFrom(range.from);
                    setTo(range.to);
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="records-from">{rt.fromLabel}</Label>
              <Input
                id="records-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="records-to">{rt.toLabel}</Label>
              <Input id="records-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="animate-fade-in">
        {activeTab === "mating" && <MatingLogTab locale={locale} range={range} />}
        {activeTab === "pregnancy-test" && <PregnancyTestLogTab locale={locale} range={range} />}
        {activeTab === "kindling" && <KindlingLogTab locale={locale} range={range} />}
        {activeTab === "weaning" && <WeaningLogTab locale={locale} range={range} />}
        {activeTab === "fostering" && <FosteringLogTab locale={locale} range={range} />}
        {activeTab === "mortality" && <MortalityLogTab locale={locale} range={range} />}
        {activeTab === "culling" && <CullingLogTab locale={locale} range={range} />}
        {activeTab === "resorption" && <ResorptionLogTab locale={locale} range={range} />}
      </div>
    </div>
  );
}
