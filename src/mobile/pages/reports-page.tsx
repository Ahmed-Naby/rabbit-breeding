import { useEffect, useState, useCallback } from "react";
import { addDays } from "date-fns";
import { FileText, TrendingUp, Venus, Mars, Rabbit, Layers } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";

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
      // Both spellings: the legacy standalone routes (#/does-fertility,
      // #/bucks-fertility — still live in app-shell's LEGACY_REPORTS_ROUTES and
      // where كارت الأم's back link points) as well as the ?tab= form. Matching
      // only the latter left the legacy routes opening on متابعة يومية instead.
      const hash = window.location.hash;
      if (hash.includes("does-fertility")) return "does-fertility";
      if (hash.includes("bucks-fertility")) return "bucks-fertility";
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
      <PageHeader
        title={rt.title}
        description={rt.description}
      />

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
          {/* القطيع + السلالات sit ABOVE the date filter on purpose: both are
              current balances, not period totals, so the range inputs below
              have no effect on them. */}
          {report && <BalanceCards report={report} rt={rt} />}

          {/* The averages, unlike the two cards above, ARE bounded by the date
              filter below — they sit here because they're the headline of the
              report, not because the range doesn't reach them. Each group
              prints its own denominator, which is what ties it back to the
              selected period. */}
          {report && <AveragesSection averages={report.averages} rt={rt} />}

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

type RT = ReturnType<typeof getClientDictionary>["reports"];

const STOCK_BUCKETS = ["under1m", "m1to2", "m2to3", "over3m"] as const;

const TONE_TEXT = {
  rose: "text-rose-600 dark:text-rose-400",
  sky: "text-sky-600 dark:text-sky-400",
} as const;

const TONE_TILE = {
  rose: "border-rose-500/25 bg-rose-500/10",
  sky: "border-sky-500/25 bg-sky-500/10",
} as const;

/**
 * The five averages, split into the two groups that share a denominator.
 * Mirrors the web AveragesSection (src/app/reports/page.tsx) — grouping is the
 * point: these numbers are only comparable within a group, and a flat list
 * invites reading «متوسط الفطام ÷ عدد مرات الفطام» against «متوسط البطن الحي ÷
 * عدد الولادات» as if the difference were the losses.
 */
function AveragesSection({ averages, rt }: { averages: FollowUpReport["averages"]; rt: RT }) {
  // One decimal: litter-sized quantities, where 7.3 says something 7 doesn't,
  // and a second decimal is false precision on a handful of litters.
  const avg = (v: number | null) =>
    v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <TrendingUp className="size-5" />
          </span>
          {rt.sectionAverages}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AveragesGroup basis={rt.avgKindlingBasis(averages.kindlings)}>
          <AveragesTile label={rt.avgBornAliveLabel} value={avg(averages.bornAlive)} />
          <AveragesTile label={rt.avgNursingDeathsLabel} value={avg(averages.nursingDeaths)} />
        </AveragesGroup>

        <AveragesGroup basis={rt.avgWeaningBasis(averages.weanings)}>
          <AveragesTile label={rt.avgWeanedLabel} value={avg(averages.weaned)} />
          <AveragesTile label={rt.avgWeanedStockDeathsLabel} value={avg(averages.weanedStockDeaths)} />
          <AveragesTile label={rt.avgRemainingStockLabel} value={avg(averages.remainingStock)} />
        </AveragesGroup>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{rt.avgRemainingStockNote}</p>
          {/* Only when history is actually missing — a permanent caveat that is
              usually inapplicable teaches people to ignore the whole block. */}
          {averages.unknownNursingLitters > 0 && (
            <p className="text-amber-600 dark:text-amber-400">
              {rt.avgUnknownNursingNote(averages.unknownNursingLitters)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AveragesGroup({ basis, children }: { basis: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="mb-2 border-b border-border/50 pb-2 text-xs font-semibold text-muted-foreground">
        {basis}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function AveragesTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function BalanceCards({ report, rt }: { report: FollowUpReport; rt: RT }) {
  const stockTotal = report.stock.males.total + report.stock.females.total;
  const bucketLabels: Record<(typeof STOCK_BUCKETS)[number], string> = {
    under1m: rt.stockAgeUnder1mLabel,
    m1to2: rt.stockAge1to2mLabel,
    m2to3: rt.stockAge2to3mLabel,
    over3m: rt.stockAgeOver3mLabel,
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BalanceCard icon={<Rabbit className="size-5" />} title={rt.sectionHerd} badge={rt.allTimeBadge}>
          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={<Venus className="size-4" />} label={rt.doesLabel} value={report.herd.does} tone="rose" />
            <StatTile icon={<Mars className="size-4" />} label={rt.bucksLabel} value={report.herd.bucks} tone="sky" />
          </div>
        </BalanceCard>

        <BalanceCard
          icon={<Layers className="size-5" />}
          title={rt.sectionStock}
          badge={rt.allTimeBadge}
          total={stockTotal}
        >
          {/* Split by time in السلالات, not weight — see fetchFollowUpReport. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["males", rt.stockMalesLabel, <Mars key="m" className="size-4" />, "sky"],
              ["females", rt.stockFemalesLabel, <Venus key="f" className="size-4" />, "rose"],
            ] as const).map(([sexKey, sexLabel, icon, tone]) => (
              <div key={sexKey} className="rounded-xl border border-border/60 bg-background/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                  <span className={cn("flex items-center gap-1.5 text-sm font-semibold", TONE_TEXT[tone])}>
                    {icon}
                    {sexLabel}
                  </span>
                  <span className="text-xl font-bold tabular-nums">
                    {report.stock[sexKey].total.toLocaleString()}
                  </span>
                </div>
                <div className="space-y-1">
                  {STOCK_BUCKETS.map((bucket) => (
                    <div key={bucket} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{bucketLabels[bucket]}</span>
                      <span className="font-semibold tabular-nums">
                        {report.stock[sexKey][bucket].toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </BalanceCard>
      </div>

      <p className="text-xs text-muted-foreground">{rt.allTimeNote}</p>
    </div>
  );
}

function BalanceCard({
  icon,
  title,
  badge,
  total,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  total?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-linear-to-br from-primary/8 via-card to-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              {icon}
            </span>
            {title}
            {total != null && (
              <span className="text-2xl font-bold tabular-nums text-primary">{total.toLocaleString()}</span>
            )}
          </CardTitle>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {badge}
          </span>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: keyof typeof TONE_TILE;
}) {
  return (
    <div className={cn("rounded-xl border p-4", TONE_TILE[tone])}>
      <div className={cn("flex items-center gap-1.5 text-xs font-semibold", TONE_TEXT[tone])}>
        {icon}
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold tabular-nums">{value.toLocaleString()}</div>
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
