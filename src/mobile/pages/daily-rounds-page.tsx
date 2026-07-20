import { useState } from "react";
import { Venus, Mars } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { RoundsPage } from "./rounds-page";
import { BucksRoundsPage } from "./bucks-rounds-page";
import { cn } from "@/lib/utils";

type RoundsTab = "does-rounds" | "bucks-rounds";

export function DailyRoundsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const dr = t.dailyRounds;

  const [activeTab, setActiveTab] = useState<RoundsTab>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("tab=bucks-rounds") || hash.startsWith("#/bucks-rounds")) return "bucks-rounds";
      if (hash.includes("tab=does-rounds") || hash.startsWith("#/rounds")) return "does-rounds";
    }
    return "does-rounds";
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{dr.title}</h1>
        <p className="text-sm text-muted-foreground">{dr.description}</p>
      </div>

      {/* 2 Tabs Navigation Bar */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("does-rounds")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "does-rounds"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Venus className="size-4 text-rose-500" />
          {dr.tabDoesRounds}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bucks-rounds")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "bucks-rounds"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Mars className="size-4 text-sky-500" />
          {dr.tabBucksRounds}
        </button>
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === "does-rounds" && <RoundsPage locale={locale} hideHeader={true} />}
        {activeTab === "bucks-rounds" && <BucksRoundsPage locale={locale} hideHeader={true} />}
      </div>
    </div>
  );
}
