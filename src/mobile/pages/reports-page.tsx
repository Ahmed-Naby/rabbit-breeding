import { useEffect, useState, useCallback } from "react";
import { addDays } from "date-fns";
import { FileText, TrendingUp, Venus, Mars } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchFollowUpReport, type FollowUpReport } from "../db/queries";
import { fromDateInputValue, toDateInputValue } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DoesFertilityPage } from "./does-fertility-page";
import { BucksFertilityPage } from "./bucks-fertility-page";
import { cn } from "@/lib/utils";

function defaultRange() {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = addDays(to, -6);
  return { from, to };
}

export function ReportsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const rt = t.reports;
  const { from: defaultFrom, to: defaultTo } = defaultRange();

  const [activeTab, setActiveTab] = useState<"follow-up" | "does-fertility" | "bucks-fertility">(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("tab=does-fertility")) return "does-fertility";
      if (hash.includes("tab=bucks-fertility")) return "bucks-fertility";
    }
    return "follow-up";
  });

  const [fromInput, setFromInput] = useState(() => toDateInputValue(defaultFrom));
  const [toInput, setToInput] = useState(() => toDateInputValue(defaultTo));
  const [report, setReport] = useState<FollowUpReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (fromVal: string, toVal: string) => {
    setLoading(true);
    try {
      const db = await getDb();
      const fromIso = fromDateInputValue(fromVal).toISOString();
      const toIso = addDays(fromDateInputValue(toVal), 1).toISOString();
      const res = await fetchFollowUpReport(db, fromIso, toIso);
      setReport(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fromInput, toInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    void load(fromInput, toInput);
  };

  const dash = "—";
  const n = (v: number | null | undefined) => (v == null ? dash : v.toLocaleString());

  return (
    <div className="space-y-6">
      {/* Page Main Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{rt.title}</h1>
        <p className="text-sm text-muted-foreground">{rt.description}</p>
      </div>

      {/* 3 Tabs Bar */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("follow-up")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "follow-up"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <FileText className="size-4 text-primary" />
          {rt.tabFollowUp}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("does-fertility")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "does-fertility"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Venus className="size-4 text-rose-500" />
          {rt.tabDoesFertility}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bucks-fertility")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "bucks-fertility"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Mars className="size-4 text-sky-500" />
          {rt.tabBucksFertility}
        </button>
      </div>

      {/* TAB 1: Follow-Up Reports */}
      {activeTab === "follow-up" && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardContent className="py-4">
              <form onSubmit={handleApply} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="from">{rt.fromLabel}</Label>
                  <Input id="from" type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="to">{rt.toLabel}</Label>
                  <Input id="to" type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} className="w-40" />
                </div>
                <Button type="submit" size="sm" disabled={loading}>
                  {rt.applyButton}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">{rt.notTrackedNote}</p>

          {report && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Section title={rt.sectionHerd}>
                <Row label={rt.doesLabel} value={n(report.herd.does)} />
                <Row label={rt.bucksLabel} value={n(report.herd.bucks)} />
              </Section>

              <Section title={rt.sectionStock}>
                <Row label={`${rt.stockMalesLabel} — ${rt.weightHeavyLabel}`} value={n(report.stock.males.heavy)} />
                <Row label={`${rt.stockMalesLabel} — ${rt.weightMediumLabel}`} value={n(report.stock.males.medium)} />
                <Row label={`${rt.stockMalesLabel} — ${rt.weightLightLabel}`} value={n(report.stock.males.light)} />
                <Row label={`${rt.stockFemalesLabel} — ${rt.weightHeavyLabel}`} value={n(report.stock.females.heavy)} />
                <Row label={`${rt.stockFemalesLabel} — ${rt.weightMediumLabel}`} value={n(report.stock.females.medium)} />
                <Row label={`${rt.stockFemalesLabel} — ${rt.weightLightLabel}`} value={n(report.stock.females.light)} />
              </Section>

              <Section title={rt.sectionDeaths}>
                <Row label={rt.totalDeathsLabel} value={n(report.deaths.total)} />
                <Row label={rt.newbornDeathsLabel} value={n(report.deaths.newborn)} />
                <Row label={rt.weanedStockDeathsLabel} value={n(report.deaths.weanedStock)} />
                <Row label={rt.stockDeathsLabel} value={n(report.deaths.stock)} />
                <Row label={rt.doeDeathsLabel} value={n(report.deaths.does)} />
                <Row label={rt.buckDeathsLabel} value={n(report.deaths.bucks)} />
                <Row label={rt.culledExcludedDeathsLabel} value={n(report.deaths.culledExcluded)} />
                <Row label={rt.cullsLabel} value={n(report.culls)} />
              </Section>

              <Section title={rt.sectionWeaning}>
                <Row label={rt.totalWeanedLabel} value={n(report.weaning.totalWeaned)} />
                <Row label={rt.soldLabel} value={n(report.weaning.sold)} />
                <Row label={rt.retainedLabel} value={n(report.weaning.retained)} />
                <Row label={rt.remainingStockLabel} value={n(report.weaning.remainingStock)} />
              </Section>

              <Section title={rt.sectionHealth}>
                <Row label={rt.mangeStockLabel} value={dash} />
                <Row label={rt.mangeDoesLabel} value={dash} />
                <Row label={rt.mangeBucksLabel} value={dash} />
                <Row label={rt.uterineInfectionLabel} value={dash} />
                <Row label={rt.mastitisLabel} value={dash} />
              </Section>

              <Section title={rt.sectionBreeding}>
                <Row label={rt.matingsLabel} value={n(report.breeding.matings)} />
                <Row label={rt.pregnancyPositiveLabel} value={n(report.breeding.pregnancyPositive)} />
                <Row label={rt.kindlingsLabel} value={n(report.breeding.kindlings)} />
              </Section>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Does Fertility Record */}
      {activeTab === "does-fertility" && (
        <div className="animate-fade-in">
          <DoesFertilityPage locale={locale} hideHeader={true} />
        </div>
      )}

      {/* TAB 3: Farm / Bucks Fertility Record */}
      {activeTab === "bucks-fertility" && (
        <div className="animate-fade-in">
          <BucksFertilityPage locale={locale} hideHeader={true} />
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
