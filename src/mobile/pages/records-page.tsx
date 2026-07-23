import { useEffect, useState, useCallback } from "react";
import { HeartHandshake, Microscope, Droplets, HeartPulse, Milk, ArrowLeftRight, Skull, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { isWithinDateRange } from "@/lib/dates";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getDb } from "../db/client";
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
} from "../db/queries";
import { MatingLog } from "./mating-log";
import { PregnancyTestLog } from "./pregnancy-test-log";
import { ResorptionLog } from "./resorption-log";
import { KindlingLog } from "./kindling-log";
import { WeaningLog } from "./weaning-log";
import { FosteringLog } from "./fostering-log";
import { MortalityLog } from "./mortality-log";
import { CullingLog } from "./culling-log";

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
  return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
}

type DateRange = { from: string; to: string };

function MatingLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [matingLog, setMatingLog] = useState<MatingLogEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchMatingPageData(db);
      setMatingLog(res.matingLog);
    })();
  }, []);

  if (matingLog === null) return <LoadingLine locale={locale} />;
  const filtered = matingLog.filter((row) => isWithinDateRange(row.matingDate, range.from, range.to));
  return <MatingLog matingLog={filtered} locale={locale} />;
}

function PregnancyTestLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [testLog, setTestLog] = useState<PregnancyTestLogEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchPregnancyPageData(db);
      setTestLog(res.testLog);
    })();
  }, []);

  if (testLog === null) return <LoadingLine locale={locale} />;
  const filtered = testLog.filter((row) => isWithinDateRange(row.testDate, range.from, range.to));
  return <PregnancyTestLog testLog={filtered} locale={locale} />;
}

function ResorptionLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [resorptionLog, setResorptionLog] = useState<ResorptionLogEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchResorptionPageData(db);
      setResorptionLog(res.resorptionLog);
    })();
  }, []);

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

  if (kindlingLog === null) return <LoadingLine locale={locale} />;
  const filtered = kindlingLog.filter((row) => isWithinDateRange(row.kindlingDate, range.from, range.to));
  return <KindlingLog kindlingLog={filtered} locale={locale} onDone={() => void load()} />;
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

  if (weanedLog === null) return <LoadingLine locale={locale} />;
  const filtered = weanedLog.filter((row) => isWithinDateRange(row.weaningDate, range.from, range.to));
  return <WeaningLog weanedLog={filtered} locale={locale} onDone={() => void load()} />;
}

function FosteringLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const t = getClientDictionary(locale);
  const [logs, setLogs] = useState<LocalFosterLogEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchFosteringPageData(db);
      setLogs(res.logs);
    })();
  }, []);

  if (logs === null) return <LoadingLine locale={locale} />;
  const filtered = logs.filter((row) => isWithinDateRange(row.date, range.from, range.to));
  return <FosteringLog logs={filtered} t={t} />;
}

function MortalityLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [deceasedRabbits, setDeceasedRabbits] = useState<LocalDeceasedRabbit[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchMortalityPageData(db);
      setDeceasedRabbits(res.deceasedRabbits);
    })();
  }, []);

  if (deceasedRabbits === null) return <LoadingLine locale={locale} />;
  const filtered = deceasedRabbits.filter((row) => isWithinDateRange(row.updatedAt, range.from, range.to));
  return <MortalityLog deceasedRabbits={filtered} locale={locale} />;
}

function CullingLogTab({ locale, range }: { locale: Locale; range: DateRange }) {
  const [culledRabbits, setCulledRabbits] = useState<LocalDeceasedRabbit[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchMortalityPageData(db);
      setCulledRabbits(res.culledRabbits);
    })();
  }, []);

  if (culledRabbits === null) return <LoadingLine locale={locale} />;
  const filtered = culledRabbits.filter((row) => isWithinDateRange(row.updatedAt, range.from, range.to));
  return <CullingLog culledRabbits={filtered} locale={locale} />;
}

export function RecordsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const rt = t.records;

  const [activeTab, setActiveTab] = useState<RecordsTab>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("tab=pregnancy-test")) return "pregnancy-test";
      if (hash.includes("tab=resorption")) return "resorption";
      if (hash.includes("tab=kindling")) return "kindling";
      if (hash.includes("tab=weaning")) return "weaning";
      if (hash.includes("tab=fostering")) return "fostering";
      if (hash.includes("tab=mortality")) return "mortality";
      if (hash.includes("tab=culling")) return "culling";
    }
    return "mating";
  });

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range: DateRange = { from, to };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{rt.title}</h1>
        <p className="text-sm text-muted-foreground">{rt.description}</p>
      </div>

      <Card>
        <CardContent className="py-4">
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
            {(from || to) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                {rt.clearButton}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
      </div>

      <div className="animate-fade-in">
        {activeTab === "mating" && <MatingLogTab locale={locale} range={range} />}
        {activeTab === "pregnancy-test" && <PregnancyTestLogTab locale={locale} range={range} />}
        {activeTab === "resorption" && <ResorptionLogTab locale={locale} range={range} />}
        {activeTab === "kindling" && <KindlingLogTab locale={locale} range={range} />}
        {activeTab === "weaning" && <WeaningLogTab locale={locale} range={range} />}
        {activeTab === "fostering" && <FosteringLogTab locale={locale} range={range} />}
        {activeTab === "mortality" && <MortalityLogTab locale={locale} range={range} />}
        {activeTab === "culling" && <CullingLogTab locale={locale} range={range} />}
      </div>
    </div>
  );
}
