import { useState } from "react";
import { Sprout, Venus, Mars } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { StockPage } from "./stock-page";
import { MothersPage } from "./mothers-page";
import { BucksPage } from "./bucks-page";
import { cn } from "@/lib/utils";

type HerdTab = "stock" | "mothers" | "bucks";

export function HerdAndStockPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const hs = t.herdAndStock;

  const [activeTab, setActiveTab] = useState<HerdTab>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("tab=mothers") || hash.startsWith("#/mothers")) return "mothers";
      if (hash.includes("tab=bucks") || hash.startsWith("#/bucks")) return "bucks";
      if (hash.includes("tab=stock") || hash.startsWith("#/stock")) return "stock";
    }
    return "stock";
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{hs.title}</h1>
        <p className="text-sm text-muted-foreground">{hs.description}</p>
      </div>

      {/* 3 Tabs Navigation Bar */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("stock")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "stock"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Sprout className="size-4 text-emerald-500" />
          {hs.tabStock}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mothers")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "mothers"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Venus className="size-4 text-rose-500" />
          {hs.tabMothers}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bucks")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "bucks"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Mars className="size-4 text-sky-500" />
          {hs.tabBucks}
        </button>
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === "stock" && <StockPage locale={locale} hideHeader={true} />}
        {activeTab === "mothers" && <MothersPage locale={locale} hideHeader={true} />}
        {activeTab === "bucks" && <BucksPage locale={locale} hideHeader={true} />}
      </div>
    </div>
  );
}
