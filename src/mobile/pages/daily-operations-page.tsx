import { useState } from "react";
import {
  HeartHandshake,
  Microscope,
  HeartPulse,
  Milk,
  ArrowLeftRight,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { MatingPage } from "./mating-page";
import { PregnancyTestPage } from "./pregnancy-test-page";
import { KindlingPage } from "./kindling-page";
import { WeaningPage } from "./weaning-page";
import { FosteringPage } from "./fostering-page";
import { cn } from "@/lib/utils";

type OperationTab = "mating" | "pregnancy-test" | "kindling" | "weaning" | "fostering";

export function DailyOperationsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const ops = t.dailyOperations;

  const [activeTab, setActiveTab] = useState<OperationTab>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("tab=pregnancy-test") || hash.startsWith("#/pregnancy-test")) return "pregnancy-test";
      if (hash.includes("tab=kindling") || hash.startsWith("#/kindling")) return "kindling";
      if (hash.includes("tab=weaning") || hash.startsWith("#/weaning")) return "weaning";
      if (hash.includes("tab=fostering") || hash.startsWith("#/fostering")) return "fostering";
      if (hash.includes("tab=mating") || hash.startsWith("#/mating")) return "mating";
    }
    return "mating";
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{ops.title}</h1>
        <p className="text-sm text-muted-foreground">{ops.description}</p>
      </div>

      {/* Tabs Navigation Bar */}
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
          {ops.tabMating}
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
          {ops.tabPregnancyTest}
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
          {ops.tabKindling}
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
          {ops.tabWeaning}
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
          {ops.tabFostering}
        </button>
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === "mating" && <MatingPage locale={locale} hideHeader={true} />}
        {activeTab === "pregnancy-test" && <PregnancyTestPage locale={locale} hideHeader={true} />}
        {activeTab === "kindling" && <KindlingPage locale={locale} hideHeader={true} />}
        {activeTab === "weaning" && <WeaningPage locale={locale} hideHeader={true} />}
        {activeTab === "fostering" && <FosteringPage locale={locale} hideHeader={true} />}
      </div>
    </div>
  );
}
