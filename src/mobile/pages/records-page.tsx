import { useEffect, useState, useCallback } from "react";
import { HeartHandshake, Microscope, HeartPulse, Milk, ArrowLeftRight, Skull, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { getDb } from "../db/client";
import {
  fetchMatingPageData,
  fetchPregnancyPageData,
  fetchKindlingPageData,
  fetchWeaningPageData,
  fetchFosteringPageData,
  fetchMortalityPageData,
  type MatingLogEntry,
  type PregnancyTestLogEntry,
  type KindlingLogEntry,
  type WeanedLitterLogEntry,
  type LocalFosterLogEntry,
  type LocalDeceasedRabbit,
} from "../db/queries";
import { MatingLog } from "./mating-log";
import { PregnancyTestLog } from "./pregnancy-test-log";
import { KindlingLog } from "./kindling-log";
import { WeaningLog } from "./weaning-log";
import { FosteringLog } from "./fostering-log";
import { MortalityLog } from "./mortality-log";
import { CullingLog } from "./culling-log";

type RecordsTab = "mating" | "pregnancy-test" | "kindling" | "weaning" | "fostering" | "mortality" | "culling";

function LoadingLine({ locale }: { locale: Locale }) {
  return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
}

function MatingLogTab({ locale }: { locale: Locale }) {
  const [matingLog, setMatingLog] = useState<MatingLogEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchMatingPageData(db);
      setMatingLog(res.matingLog);
    })();
  }, []);

  if (matingLog === null) return <LoadingLine locale={locale} />;
  return <MatingLog matingLog={matingLog} locale={locale} />;
}

function PregnancyTestLogTab({ locale }: { locale: Locale }) {
  const [testLog, setTestLog] = useState<PregnancyTestLogEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchPregnancyPageData(db);
      setTestLog(res.testLog);
    })();
  }, []);

  if (testLog === null) return <LoadingLine locale={locale} />;
  return <PregnancyTestLog testLog={testLog} locale={locale} />;
}

function KindlingLogTab({ locale }: { locale: Locale }) {
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
  return <KindlingLog kindlingLog={kindlingLog} locale={locale} onDone={() => void load()} />;
}

function WeaningLogTab({ locale }: { locale: Locale }) {
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
  return <WeaningLog weanedLog={weanedLog} locale={locale} onDone={() => void load()} />;
}

function FosteringLogTab({ locale }: { locale: Locale }) {
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
  return <FosteringLog logs={logs} t={t} />;
}

function MortalityLogTab({ locale }: { locale: Locale }) {
  const [deceasedRabbits, setDeceasedRabbits] = useState<LocalDeceasedRabbit[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchMortalityPageData(db);
      setDeceasedRabbits(res.deceasedRabbits);
    })();
  }, []);

  if (deceasedRabbits === null) return <LoadingLine locale={locale} />;
  return <MortalityLog deceasedRabbits={deceasedRabbits} locale={locale} />;
}

function CullingLogTab({ locale }: { locale: Locale }) {
  const [culledRabbits, setCulledRabbits] = useState<LocalDeceasedRabbit[] | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const res = await fetchMortalityPageData(db);
      setCulledRabbits(res.culledRabbits);
    })();
  }, []);

  if (culledRabbits === null) return <LoadingLine locale={locale} />;
  return <CullingLog culledRabbits={culledRabbits} locale={locale} />;
}

export function RecordsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const rt = t.records;

  const [activeTab, setActiveTab] = useState<RecordsTab>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("tab=pregnancy-test")) return "pregnancy-test";
      if (hash.includes("tab=kindling")) return "kindling";
      if (hash.includes("tab=weaning")) return "weaning";
      if (hash.includes("tab=fostering")) return "fostering";
      if (hash.includes("tab=mortality")) return "mortality";
      if (hash.includes("tab=culling")) return "culling";
    }
    return "mating";
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{rt.title}</h1>
        <p className="text-sm text-muted-foreground">{rt.description}</p>
      </div>

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
      </div>

      <div className="animate-fade-in">
        {activeTab === "mating" && <MatingLogTab locale={locale} />}
        {activeTab === "pregnancy-test" && <PregnancyTestLogTab locale={locale} />}
        {activeTab === "kindling" && <KindlingLogTab locale={locale} />}
        {activeTab === "weaning" && <WeaningLogTab locale={locale} />}
        {activeTab === "fostering" && <FosteringLogTab locale={locale} />}
        {activeTab === "mortality" && <MortalityLogTab locale={locale} />}
        {activeTab === "culling" && <CullingLogTab locale={locale} />}
      </div>
    </div>
  );
}
