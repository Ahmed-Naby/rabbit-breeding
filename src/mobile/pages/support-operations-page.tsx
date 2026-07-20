import { useState } from "react";
import { Box, Skull } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { NestBoxPage } from "./nest-box-page";
import { MortalityPage } from "./mortality-page";
import { cn } from "@/lib/utils";

type SupportTab = "nest-box" | "mortality";

export function SupportOperationsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const sops = t.supportOperations;

  const [activeTab, setActiveTab] = useState<SupportTab>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("tab=mortality") || hash.startsWith("#/mortality")) return "mortality";
      if (hash.includes("tab=nest-box") || hash.startsWith("#/nest-box")) return "nest-box";
    }
    return "nest-box";
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{sops.title}</h1>
        <p className="text-sm text-muted-foreground">{sops.description}</p>
      </div>

      {/* 2 Tabs Navigation Bar */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("nest-box")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "nest-box"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Box className="size-4 text-amber-500" />
          {sops.tabNestBox}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mortality")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "mortality"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Skull className="size-4 text-rose-500" />
          {sops.tabMortality}
        </button>
      </div>

      {/* Active Tab Content */}
      <div className="animate-fade-in">
        {activeTab === "nest-box" && <NestBoxPage locale={locale} hideHeader={true} />}
        {activeTab === "mortality" && <MortalityPage locale={locale} hideHeader={true} />}
      </div>
    </div>
  );
}
