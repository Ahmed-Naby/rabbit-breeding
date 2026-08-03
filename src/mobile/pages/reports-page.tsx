import { useEffect, useState, useCallback } from "react";
import { addDays } from "date-fns";
import {
  FileText,
  TrendingUp,
  Venus,
  Mars,
  Rabbit,
  Layers,
  Gauge,
  ChartArea,
  ChartColumn,
} from "lucide-react";
import { KitStockChart } from "@/components/kit-stock-chart";
import { MonthlySalesChart } from "@/components/monthly-sales-chart";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchFollowUpReport, fetchHerdReport, type FollowUpReport } from "../db/queries";
import type { HerdReport } from "@/lib/herd-productivity";
import { formatMoney } from "@/lib/units";
import { fromDateInputValue, toDateInputValue } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LocalDate } from "@/components/local-date";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { ExportXlsxButton } from "@/components/export-xlsx-button";
import { saveBinaryFile } from "../lib/save-file";
import { DoesFertilityPage } from "./does-fertility-page";
import { BucksFertilityPage } from "./bucks-fertility-page";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

// An empty date box means "no bound", not "today": «إلغاء التصفية» clears both
// and the report then covers the whole record. The pair is wide enough for any
// date a farm can enter — an animal acquired before the app existed, a movement
// dated a month ahead. Mirrors src/app/reports/page.tsx.
const ALL_TIME_FROM = "1970-01-01";
const ALL_TIME_TO = "2999-12-31";

function defaultRange(spanDays: number) {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = addDays(to, -(spanDays - 1));
  return { from, to };
}

export function ReportsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const rt = t.reports;
  const { from: defaultFrom, to: defaultTo } = defaultRange(7);
  // 90 days for the herd tab, not the follow-up tab's week: its headline rates
  // are annualised, so a seven-day window multiplies that week's noise by 52.
  // Ninety days spans at least one full cycle under any rebreed system.
  const { from: herdDefaultFrom, to: herdDefaultTo } = defaultRange(90);

  const [activeTab, setActiveTab] = useState<"follow-up" | "herd" | "does-fertility" | "bucks-fertility">(() => {
    if (typeof window !== "undefined") {
      // Both spellings: the legacy standalone routes (#/does-fertility,
      // #/bucks-fertility — still live in app-shell's LEGACY_REPORTS_ROUTES and
      // where كارت الأم's back link points) as well as the ?tab= form. Matching
      // only the latter left the legacy routes opening on متابعة يومية instead.
      const hash = window.location.hash;
      if (hash.includes("does-fertility")) return "does-fertility";
      if (hash.includes("bucks-fertility")) return "bucks-fertility";
      if (hash.includes("herd")) return "herd";
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
      const fromIso = fromDateInputValue(fromVal || ALL_TIME_FROM).toISOString();
      const toIso = addDays(fromDateInputValue(toVal || ALL_TIME_TO), 1).toISOString();
      const res = await fetchFollowUpReport(db, fromIso, toIso);
      setReport(res);
    } finally {
      setLoading(false);
    }
  }, []);

  // The herd tab keeps its own range and its own fetch, and is loaded lazily:
  // its idle-doe list scans every kindling row ever recorded, which has no
  // business running behind the tab people actually land on.
  const [herdFromInput, setHerdFromInput] = useState(() => toDateInputValue(herdDefaultFrom));
  const [herdToInput, setHerdToInput] = useState(() => toDateInputValue(herdDefaultTo));
  const [herd, setHerd] = useState<HerdReport | null>(null);
  const [herdLoading, setHerdLoading] = useState(false);

  const loadHerd = useCallback(async (fromVal: string, toVal: string) => {
    setHerdLoading(true);
    try {
      const db = await getDb();
      const fromIso = fromDateInputValue(fromVal || ALL_TIME_FROM).toISOString();
      const toIso = addDays(fromDateInputValue(toVal || ALL_TIME_TO), 1).toISOString();
      setHerd(await fetchHerdReport(db, fromIso, toIso));
    } finally {
      setHerdLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fromInput, toInput);
    // Only for a deep link that lands straight on the herd tab (#/reports?tab=herd).
    // Every other way in goes through the tab button, which loads it on click —
    // deliberately not an [activeTab] effect, so switching tabs stays a plain
    // event handler rather than a render-triggered fetch.
    if (activeTab === "herd") void loadHerd(herdFromInput, herdToInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    void load(fromInput, toInput);
  };

  // «إلغاء التصفية» empties both boxes and reloads over the whole record — the
  // page opens on a window (a week here, 90 days for القطيع) but that's a
  // starting point, not a floor. Disabled once they're already empty, so the
  // button reads as done rather than as something still worth pressing.
  const handleClearFilter = () => {
    setFromInput("");
    setToInput("");
    void load("", "");
  };

  const handleClearHerdFilter = () => {
    setHerdFromInput("");
    setHerdToInput("");
    void loadHerd("", "");
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

      {/* 4 Tabs Bar */}
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
          onClick={() => {
            setActiveTab("herd");
            // Fetched here rather than in an effect: this is the first open,
            // and re-running it on every tab switch back would re-scan every
            // kindling row for a report that has not changed.
            if (!herd && !herdLoading) void loadHerd(herdFromInput, herdToInput);
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
            activeTab === "herd"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Gauge className="size-4 text-emerald-500" />
          {rt.tabHerdProductivity}
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

          {/* Lifetime like the two cards above, so it also belongs ahead of the
              date filter. Each group still prints its own denominator, which is
              what says how many kindlings/weanings the average stands on. */}
          {report && (
            <AveragesSection
              averages={report.averages}
              monthlySales={report.monthlySales}
              soldPerWeaning={report.soldPerWeaning}
              salesPerDoe={report.salesPerDoe}
              weightPerDoe={report.weightPerDoe}
              rt={rt}
            />
          )}

          {/* Sales first, then the stock they came out of: the bars explain the
              dips in the curve below them. */}
          {report && <SalesChartSection points={report.monthlySalesHistory} rt={rt} locale={locale} />}

          {/* The same رصيد الفطام number the card above ends on, drawn back to
              the farm's first weaning. Lifetime too — hence its place here. */}
          {report && <StockChartSection history={report.kitStockHistory} rt={rt} locale={locale} />}

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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleClearFilter}
                  disabled={loading || (!fromInput && !toInput)}
                >
                  {rt.clearFilterButton}
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
                {/* Dated, unlike the three rows above it: this one is a running
                    balance as of the end of the period, not a total earned
                    inside it. With the filter cleared there's no end date to
                    print, and the balance is simply today's. */}
                <Row
                  label={toInput ? rt.remainingStockLabel(toInput) : rt.remainingStockNowLabel}
                  value={n(report.weaning.remainingStock)}
                />
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

      {/* TAB 2: Herd Productivity — the same five ideas as the averages above,
          but divided by every doe in the barn instead of by the does that
          actually completed a cycle. The gap between the two tabs IS the cost
          of the idle does listed at the bottom of this one. */}
      {activeTab === "herd" && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardContent className="py-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadHerd(herdFromInput, herdToInput);
                }}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="space-y-1">
                  <Label htmlFor="herd-from">{rt.fromLabel}</Label>
                  <Input id="herd-from" type="date" value={herdFromInput} onChange={(e) => setHerdFromInput(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="herd-to">{rt.toLabel}</Label>
                  <Input id="herd-to" type="date" value={herdToInput} onChange={(e) => setHerdToInput(e.target.value)} className="w-40" />
                </div>
                <Button type="submit" size="sm" disabled={herdLoading}>
                  {rt.applyButton}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleClearHerdFilter}
                  disabled={herdLoading || (!herdFromInput && !herdToInput)}
                >
                  {rt.clearFilterButton}
                </Button>
              </form>
            </CardContent>
          </Card>

          {herd && <HerdProductivitySection herd={herd} rt={rt} locale={locale} />}
        </div>
      )}

      {/* TAB 3: Does Fertility Record */}
      {activeTab === "does-fertility" && (
        <div className="animate-fade-in">
          <DoesFertilityPage locale={locale} hideHeader={true} />
        </div>
      )}

      {/* TAB 4: Farm / Bucks Fertility Record */}
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
 *
 * Every figure here is lifetime and the date filter below never touches it —
 * hence the badge in the header.
 */
function AveragesSection({
  averages,
  monthlySales,
  soldPerWeaning,
  salesPerDoe,
  weightPerDoe,
  rt,
}: {
  averages: FollowUpReport["averages"];
  monthlySales: FollowUpReport["monthlySales"];
  soldPerWeaning: FollowUpReport["soldPerWeaning"];
  salesPerDoe: FollowUpReport["salesPerDoe"];
  weightPerDoe: FollowUpReport["weightPerDoe"];
  rt: RT;
}) {
  // One decimal: litter-sized quantities, where 7.3 says something 7 doesn't,
  // and a second decimal is false precision on a handful of litters.
  const avg = (v: number | null) =>
    v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // Monthly sales run in the hundreds, where a decimal is noise, not precision.
  const whole = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString());
  // Stored in grams, read in kilos — the unit the sale form and the القطيع tab
  // both use. Two decimals, like that tab's twin tile.
  const kg = (grams: number | null) =>
    grams == null
      ? "—"
      : (grams / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Card>
      <CardHeader>
        {/* The badge carries its weight here: this whole board is lifetime, so
            a reader who just moved the date filter needs to see why it didn't
            move — same badge the القطيع/السلالات balance cards wear. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <TrendingUp className="size-5" />
            </span>
            {rt.sectionAverages}
          </CardTitle>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {rt.avgAllTimeBadge}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <AveragesGroup basis={rt.avgKindlingBasis(averages.kindlings)}>
          <AveragesTile label={rt.avgBornAliveLabel} value={avg(averages.bornAlive)} />
          <AveragesTile label={rt.avgNursingDeathsLabel} value={avg(averages.nursingDeaths)} />
        </AveragesGroup>

        <AveragesGroup basis={rt.avgWeaningBasis(averages.weanings)}>
          <AveragesTile label={rt.avgWeanedLabel} value={avg(averages.weaned)} />
          <AveragesTile label={rt.avgWeanedStockDeathsLabel} value={avg(averages.weanedStockDeaths)} />
        </AveragesGroup>

        {/* Divided by TIME, not by an event count — the only group here that
            is, which is why it cannot join either of the two above. */}
        <AveragesGroup basis={rt.avgMonthsBasis(monthlySales.months)}>
          <AveragesTile label={rt.avgMonthlySalesLabel} value={whole(monthlySales.perMonth)} />
        </AveragesGroup>

        {/* Its own basis line because it is a mean OF MONTHLY RATIOS, not a
            single division — see the web copy for the full reasoning. */}
        <AveragesGroup basis={rt.avgLaggedMonthsBasis(soldPerWeaning.months)}>
          <AveragesTile label={rt.avgSoldPerWeaningLabel} value={avg(soldPerWeaning.perWeaning)} />
        </AveragesGroup>

        {/* Same monthly sales, a different denominator: the working herd rather
            than last month's weanings. */}
        <AveragesGroup basis={rt.avgSalesPerDoeBasis(salesPerDoe.months)}>
          <AveragesTile label={rt.avgSalesPerDoeLabel} value={avg(salesPerDoe.perDoe)} />
        </AveragesGroup>

        {/* Weight, not head — see the web copy for why it gets its own basis. */}
        <AveragesGroup basis={rt.avgWeightPerDoeBasis(weightPerDoe.months)}>
          <AveragesTile label={rt.avgWeightPerDoeLabel} value={kg(weightPerDoe.perDoeGrams)} />
        </AveragesGroup>

        {/* Its own group: a stock level, not an average — no denominator, and
            whole head counts rather than the one decimal the averages carry. */}
        <AveragesGroup basis={rt.avgLifetimeBasis}>
          <AveragesTile
            label={rt.avgRemainingStockLabel}
            value={averages.remainingStock.toLocaleString()}
          />
        </AveragesGroup>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{rt.avgRemainingStockNote}</p>
          {/* Without this, 5.9 weaned against 4.8 sold reads as a 1.1 loss per
              litter — most of that gap is stock still standing in the barn. */}
          <p>{rt.avgSoldPerWeaningNote}</p>
          {/* The herd size on a past date is reconstructed, not recorded. */}
          <p>{rt.avgSalesPerDoeNote}</p>
          {/* Only when weights are actually missing — see avgUnknownNursingNote. */}
          {weightPerDoe.unknownWeightMonths > 0 && (
            <p className="text-amber-600 dark:text-amber-400">
              {rt.avgUnknownWeightMonthsNote(weightPerDoe.unknownWeightMonths)}
            </p>
          )}
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

/**
 * Mirrors the web HerdProductivitySection (src/app/reports/page.tsx). Both are
 * fed by computeHerdProductivity/findIdleDoes, so only the presentation is
 * duplicated here — never the arithmetic.
 */
function HerdProductivitySection({
  herd,
  rt,
  locale,
}: {
  herd: HerdReport;
  rt: RT;
  locale: Locale;
}) {
  const p = herd.productivity;
  // One decimal, same as the event-based averages — a second decimal is false
  // precision on a herd of a few dozen does.
  const num = (v: number | null, digits = 1) =>
    v == null
      ? "—"
      : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const money = (v: number | null) => (v == null ? "—" : formatMoney(Math.round(v), herd.currency));
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  const idleShare = p.doeCount > 0 ? herd.idleDoes.length / p.doeCount : null;

  // Worst first, matching what findIdleDoes already returns: the top rows are
  // the استبعاد shortlist and should need no clicking.
  const idleSort = useSortableRows(
    herd.idleDoes,
    {
      tag: { type: "tag", value: (r) => r.tagId },
      breed: { type: "string", value: (r) => r.breed },
      last: { type: "date", value: (r) => r.lastKindlingDate },
      idleDays: { type: "number", value: (r) => r.idleDays },
    },
    { key: "idleDays", direction: "desc" }
  );

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/70 bg-linear-to-br from-emerald-500/8 via-card to-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                <Gauge className="size-5" />
              </span>
              {rt.herdTitle}
            </CardTitle>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              {rt.herdBasis(p.doeCount, p.periodDays)}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{rt.herdDescription}</p>
        </CardContent>
      </Card>

      {/* An empty herd makes every figure below «—»; say why once instead of
          printing a wall of dashes with no explanation. */}
      {p.doeCount === 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">{rt.herdNoDoesNote}</p>
      )}

      <Section title={rt.herdSectionCycles}>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <HerdTile label={rt.herdCyclesActualLabel} value={num(p.cyclesPerDoePerYear)} strong />
          <HerdTile label={rt.herdCyclesTargetLabel} value={num(p.targetCyclesPerYear)} />
          <HerdTile
            label={rt.herdCycleAchievementLabel}
            value={pct(p.cycleAchievement)}
            // The one number on the page with a natural pass mark: below 80% of
            // the system the farm chose, the barn is idling.
            tone={p.cycleAchievement == null ? undefined : p.cycleAchievement >= 0.8 ? "good" : "bad"}
          />
        </div>
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          {rt.herdCycleNote(p.targetCyclesPerYear, herd.cycleDays)}
        </p>
      </Section>

      <Section title={rt.herdSectionPerDoe}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <HerdTile label={rt.herdBornAlivePerDoeLabel} value={num(p.bornAlivePerDoe)} />
          <HerdTile label={rt.herdNursedPerDoeLabel} value={num(p.nursedPerDoe)} />
          <HerdTile label={rt.herdDeathsPerDoeLabel} value={num(p.kitDeathsPerDoe)} />
          <HerdTile label={rt.herdWeanedPerDoeLabel} value={num(p.weanedPerDoe)} strong />
        </div>
        <p className="px-4 pb-4 text-xs text-muted-foreground">{rt.herdDeathsPerDoeNote}</p>
      </Section>

      <Section title={rt.herdSectionMonthly}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <HerdTile label={rt.herdWeanedPerMonthLabel} value={num(p.weanedPerDoePerMonth)} />
          <HerdTile label={rt.herdKgSoldPerMonthLabel} value={num(p.kgSoldPerDoePerMonth, 2)} />
          <HerdTile label={rt.herdRevenuePerMonthLabel} value={money(p.revenuePerDoePerMonthCents)} />
          <HerdTile label={rt.herdCostPerMonthLabel} value={money(p.costPerDoePerMonthCents)} />
          <HerdTile
            label={rt.herdNetPerMonthLabel}
            value={money(p.netPerDoePerMonthCents)}
            strong
            tone={
              p.netPerDoePerMonthCents == null ? undefined : p.netPerDoePerMonthCents >= 0 ? "good" : "bad"
            }
          />
        </div>
        <div className="space-y-1 px-4 pb-4 text-xs text-muted-foreground">
          <p>{rt.herdCostNote}</p>
          {p.netPerDoePerMonthCents != null && (
            <p
              className={cn(
                p.netPerDoePerMonthCents >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              )}
            >
              {p.netPerDoePerMonthCents >= 0 ? rt.herdNetPositiveNote : rt.herdNetNegativeNote}
            </p>
          )}
        </div>
      </Section>

      {/* Same two sections as the web report, same shared computation — see
          computeHerdProductivity. */}
      <Section title={rt.herdSectionTotals}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <HerdTile label={rt.herdTotalIncomeLabel} value={money(p.incomeCents)} />
          <HerdTile label={rt.herdTotalExpenseLabel} value={money(p.expenseCents)} />
          <HerdTile
            label={rt.herdTotalNetLabel}
            value={money(p.netCents)}
            strong
            tone={p.netCents >= 0 ? "good" : "bad"}
          />
          <HerdTile label={rt.herdSoldCountLabel} value={num(p.soldCount, 0)} />
          <HerdTile
            label={rt.herdSoldPerDoePerYearLabel}
            value={num(p.soldPerDoePerYear, 1)}
            strong
          />
          <HerdTile label={rt.herdKgSoldLabel} value={num(p.kgSold, 1)} />
        </div>
        <div className="space-y-1 px-4 pb-4 text-xs text-muted-foreground">
          <p>{rt.herdTotalsNote}</p>
          <p
            className={cn(
              p.netCents >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            )}
          >
            {p.netCents >= 0
              ? rt.herdTotalsProfitNote(formatMoney(p.netCents, herd.currency))
              : rt.herdTotalsLossNote(formatMoney(Math.abs(p.netCents), herd.currency))}
          </p>
        </div>
      </Section>

      <Section title={rt.herdSectionBreakEven}>
        {p.breakEvenPricePerKgCents == null ? (
          <p className="p-4 text-sm text-muted-foreground">{rt.herdBreakEvenNoSales}</p>
        ) : (
          <>
            {/* kgSold lives in حصيلة الفترة above, with the other absolute
                quantities; every tile here is a per-kilo figure. */}
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <HerdTile label={rt.herdRealizedPriceLabel} value={money(p.realizedPricePerKgCents)} />
              <HerdTile
                label={rt.herdBreakEvenPriceLabel}
                value={money(p.breakEvenPricePerKgCents)}
                strong
              />
              <HerdTile
                label={rt.herdMarginPerKgLabel}
                value={money(p.marginPerKgCents)}
                strong
                tone={
                  p.marginPerKgCents == null ? undefined : p.marginPerKgCents >= 0 ? "good" : "bad"
                }
              />
              <HerdTile label={rt.herdFeedKgLabel} value={num(p.feedKgConsumed, 0)} />
              <HerdTile label={rt.herdFeedConversionLabel} value={num(p.feedConversionRatio, 2)} />
            </div>
            <div className="space-y-1 px-4 pb-4 text-xs text-muted-foreground">
              <p>{rt.herdBreakEvenNote}</p>
              <p>{rt.herdFeedConversionNote}</p>
              {p.marginPerKgCents != null && (
                <p
                  className={cn(
                    p.marginPerKgCents >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  )}
                >
                  {p.marginPerKgCents >= 0
                    ? rt.herdBreakEvenPositiveNote(formatMoney(p.marginPerKgCents, herd.currency))
                    : rt.herdBreakEvenNegativeNote(
                        formatMoney(Math.abs(p.marginPerKgCents), herd.currency)
                      )}
                </p>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title={rt.herdSectionIdle}>
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">{rt.herdIdleDescription(herd.cycleDays)}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <HerdTile
              label={rt.herdIdleCountLabel}
              value={herd.idleDoes.length.toLocaleString()}
              strong
              tone={herd.idleDoes.length > 0 ? "bad" : "good"}
            />
            <HerdTile label={rt.herdIdleShareLabel} value={pct(idleShare)} />
          </div>

          {herd.idleDoes.length === 0 ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{rt.herdIdleEmpty}</p>
          ) : (
            <>
            <div className="flex justify-end">
              <ExportXlsxButton
                locale={locale}
                save={saveBinaryFile}
                spec={{
                  kind: "idleDoes",
                  rows: herd.idleDoes.map((doe) => ({
                    tagId: doe.tagId,
                    breed: doe.breed,
                    lastKindlingDate: doe.lastKindlingDate,
                    neverKindled: doe.neverKindled,
                    idleDays: doe.idleDays,
                  })),
                }}
              />
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="[&>th]:text-center">
                    <TableHead>{rt.herdColIndex}</TableHead>
                    <SortableTh
                      label={rt.herdColTag}
                      sortKey="tag"
                      activeSortKey={idleSort.sortKey}
                      direction={idleSort.direction}
                      onSort={idleSort.toggleSort}
                    />
                    <SortableTh
                      className="hidden sm:table-cell"
                      label={rt.herdColBreed}
                      sortKey="breed"
                      activeSortKey={idleSort.sortKey}
                      direction={idleSort.direction}
                      onSort={idleSort.toggleSort}
                    />
                    <SortableTh
                      label={rt.herdColLastKindling}
                      sortKey="last"
                      activeSortKey={idleSort.sortKey}
                      direction={idleSort.direction}
                      onSort={idleSort.toggleSort}
                    />
                    <SortableTh
                      label={rt.herdColIdleDays}
                      sortKey="idleDays"
                      activeSortKey={idleSort.sortKey}
                      direction={idleSort.direction}
                      onSort={idleSort.toggleSort}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {idleSort.sorted.map((doe, i) => (
                    <TableRow key={doe.id} className="[&>td]:text-center">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <a href={`#/rabbits/${doe.id}`} className="hover:underline">
                          {doe.tagId ?? "—"}
                        </a>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{doe.breed ?? "—"}</TableCell>
                      <TableCell>
                        {doe.neverKindled ? (
                          <span className="text-muted-foreground">{rt.herdNeverKindled}</span>
                        ) : (
                          <LocalDate date={doe.lastKindlingDate} locale={locale} />
                        )}
                      </TableCell>
                      <TableCell className="font-semibold tabular-nums">
                        {doe.idleDays.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}

const HERD_TONE = {
  good: "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400",
  bad: "border-rose-500/25 bg-rose-500/8 text-rose-700 dark:text-rose-400",
} as const;

function HerdTile({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: keyof typeof HERD_TONE;
}) {
  return (
    <div className={cn("rounded-lg border border-border/60 bg-card p-3", tone && HERD_TONE[tone])}>
      <div className={cn("text-xs", tone ? "opacity-80" : "text-muted-foreground")}>{label}</div>
      <div className={cn("mt-1 font-bold tabular-nums", strong ? "text-2xl" : "text-xl")}>{value}</div>
    </div>
  );
}

/** Mirrors the web StockChartSection (src/app/reports/page.tsx). */
function StockChartSection({
  history,
  rt,
  locale,
}: {
  history: FollowUpReport["kitStockHistory"];
  rt: RT;
  locale: Locale;
}) {
  const bucketLabel = {
    day: rt.stockChartBucketDay,
    week: rt.stockChartBucketWeek,
    month: rt.stockChartBucketMonth,
  }[history.bucket];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <ChartArea className="size-5" />
            </span>
            {rt.sectionStockChart}
          </CardTitle>
          {/* The bucket is chosen for the reader, so say which one they got —
              a flat month on a monthly chart is not a flat month in reality. */}
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {bucketLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <KitStockChart
          points={history.points}
          bucket={history.bucket}
          locale={locale}
          label={rt.stockChartSeriesLabel}
          emptyText={rt.stockChartEmpty}
        />
        <p className="text-xs text-muted-foreground">{rt.stockChartNote}</p>
      </CardContent>
    </Card>
  );
}

/** Mirrors the web SalesChartSection (src/app/reports/page.tsx). */
function SalesChartSection({
  points,
  rt,
  locale,
}: {
  points: FollowUpReport["monthlySalesHistory"];
  rt: RT;
  locale: Locale;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <ChartColumn className="size-5" />
            </span>
            {rt.sectionSalesChart}
          </CardTitle>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {rt.avgAllTimeBadge}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <MonthlySalesChart
          points={points}
          locale={locale}
          label={rt.salesChartSeriesLabel}
          doesLabel={rt.salesChartDoesLabel}
          emptyText={rt.salesChartEmpty}
        />
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{rt.salesChartNote}</p>
          {/* One scale, so the short blue bar needs explaining, not warning about. */}
          <p>{rt.salesChartAxesNote}</p>
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
