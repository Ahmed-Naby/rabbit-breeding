import Link from "next/link";
import { addDays } from "date-fns";
import {
  FileText,
  Venus,
  Mars,
  Rabbit,
  Layers,
  TrendingUp,
  Gauge,
  ChartColumn,
} from "lucide-react";
import { KitStockChart } from "@/components/kit-stock-chart";
import { MonthlySalesChart } from "@/components/monthly-sales-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { ExportXlsxButton } from "@/components/export-xlsx-button";
import { formatMoney } from "@/lib/units";
import { fromDateInputValue, toDateInputValue } from "@/lib/dates";
import { getFollowUpReport, type FollowUpReport } from "./report-data";
import { getHerdReport, type HerdReport } from "./herd-data";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/locales";
import DoesFertilityPage from "../does-fertility/page";
import BucksFertilityPage from "../bucks-fertility/page";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.reports.title} · RabbitTrack` };
}

// Wide enough to hold any record a farm can enter — a doe bought before the
// app existed, a movement dated a month ahead — without pretending to be a
// real boundary. The mobile reports page uses the same pair.
const ALL_TIME_FROM = new Date("1970-01-01T00:00:00.000Z");
const ALL_TIME_TO = new Date("2999-12-31T00:00:00.000Z");

/**
 * `spanDays` is the inclusive window length. تقارير المتابعة is a *weekly*
 * report, so 7. إنتاجية القطيع defaults to 90 instead: its headline is cycles
 * per doe per year, and annualising a 7-day window multiplies whatever noise
 * that week held by 52 — one busy Tuesday would read as a world-class farm.
 * Ninety days spans at least one full cycle under any of the three rebreed
 * systems, so every doe has had a fair chance to appear in the numerator.
 */
function defaultRange(spanDays: number) {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = addDays(to, -(spanDays - 1));
  return { from, to };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string; all?: string }>;
}) {
  const sp = await searchParams;
  const activeTab = sp.tab || "follow-up";
  const isHerdTab = activeTab === "herd";
  const { from: defaultFrom, to: defaultTo } = defaultRange(isHerdTab ? 90 : 7);
  // «إلغاء التصفية» lands here: no window at all, every record the farm has.
  // A flag rather than empty from/to, because a missing range is what a plain
  // /reports visit looks like and that one still opens on the default week.
  const showAll = sp.all === "1";
  const from = showAll ? ALL_TIME_FROM : sp.from ? fromDateInputValue(sp.from) : defaultFrom;
  const toSelected = showAll ? ALL_TIME_TO : sp.to ? fromDateInputValue(sp.to) : defaultTo;
  const toExclusive = addDays(toSelected, 1);

  // Only the visible tab's data is fetched: the two reports have no overlap and
  // إنتاجية القطيع scans every KindlingLog row on the farm for its idle list, so
  // loading it behind تقارير المتابعة would tax the common case for nothing.
  const [report, herd, { locale, t }] = await Promise.all([
    isHerdTab ? null : getFollowUpReport(from, toExclusive),
    isHerdTab ? getHerdReport(from, toExclusive) : null,
    getDictionary(),
  ]);
  const rt = t.reports;

  const rangeQuery = showAll
    ? "&all=1"
    : `${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`;
  const followUpHref = `/reports?tab=follow-up${rangeQuery}`;
  // The range carries over to إنتاجية القطيع too — a user who just filtered
  // تقارير المتابعة to a month means the same month here.
  const herdHref = `/reports?tab=herd${rangeQuery}`;

  return (
    <div className="space-y-6">
      <PageHeader title={rt.title} description={rt.description} />

      {/* 3 Tabs Navigation Bar */}
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        <Link
          href={followUpHref}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "follow-up"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <FileText className="size-4 text-primary" />
          {rt.tabFollowUp}
        </Link>

        <Link
          href="/reports?tab=does-fertility"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "does-fertility"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Venus className="size-4 text-rose-500" />
          {rt.tabDoesFertility}
        </Link>

        <Link
          href="/reports?tab=bucks-fertility"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            activeTab === "bucks-fertility"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Mars className="size-4 text-sky-500" />
          {rt.tabBucksFertility}
        </Link>

        <Link
          href={herdHref}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            isHerdTab
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Gauge className="size-4 text-emerald-500" />
          {rt.tabHerdProductivity}
        </Link>
      </div>

      {/* TAB 1: Follow-Up Reports */}
      {report && activeTab === "follow-up" && (
        <div className="space-y-6 animate-fade-in">
          {/* القطيع + السلالات sit ABOVE the date filter on purpose: both are
              current balances, not period totals, so the range inputs below
              have no effect on them. */}
          <BalanceCards report={report} rt={rt} />

          {/* Lifetime like the two cards above, so it also belongs ahead of the
              date filter. Each group still prints its own denominator, which is
              what says how many kindlings/weanings the average stands on. */}
          <AveragesSection
            averages={report.averages}
            monthlySales={report.monthlySales}
            soldPerWeaning={report.soldPerWeaning}
            salesPerDoe={report.salesPerDoe}
            weightPerDoe={report.weightPerDoe}
            rt={rt}
          />

          {/* The month's selling and the stock it came out of, on one pair of
              axes. Lifetime, whatever the range filter below says. */}
          <SalesChartSection
            points={report.monthlySalesHistory}
            history={report.kitStockHistory}
            rt={rt}
            locale={locale}
          />

          <RangeFilter tab="follow-up" from={from} to={toSelected} showAll={showAll} rt={rt} />

          <p className="text-xs text-muted-foreground">{rt.notTrackedNote}</p>

          <ReportSections report={report} asOf={showAll ? null : toDateInputValue(toSelected)} rt={rt} />
        </div>
      )}

      {/* TAB 2: Does Fertility Record */}
      {activeTab === "does-fertility" && (
        <div className="animate-fade-in">
          <DoesFertilityPage hideHeader={true} />
        </div>
      )}

      {/* TAB 3: Farm / Bucks Fertility Record */}
      {activeTab === "bucks-fertility" && (
        <div className="animate-fade-in">
          <BucksFertilityPage hideHeader={true} />
        </div>
      )}

      {/* TAB 4: Herd Productivity — everything ÷ عدد الأمهات */}
      {herd && isHerdTab && (
        <div className="space-y-6 animate-fade-in">
          <RangeFilter tab="herd" from={from} to={toSelected} showAll={showAll} rt={rt} />
          <HerdProductivitySection herd={herd} rt={rt} locale={locale} />
        </div>
      )}
    </div>
  );
}

function RangeFilter({
  tab,
  from,
  to,
  showAll,
  rt,
}: {
  tab: string;
  from: Date;
  to: Date;
  showAll: boolean;
  rt: RT;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={tab} />
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{rt.fromLabel}</span>
            {/* Empty, not the sentinel year: على السجل كله the two boxes read as
                "no dates chosen", which is what إلغاء التصفية just did. */}
            <Input type="date" name="from" defaultValue={showAll ? "" : toDateInputValue(from)} className="w-40" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{rt.toLabel}</span>
            <Input type="date" name="to" defaultValue={showAll ? "" : toDateInputValue(to)} className="w-40" />
          </label>
          <Button type="submit" size="sm">
            {rt.applyButton}
          </Button>
          {/* A link, not a form reset: the whole-record view is a URL of its
              own (all=1), so it survives a refresh and can be shared — while
              clearing the two inputs in place would just submit an empty
              range, which the server reads as "no filter given" and answers
              with the default week. */}
          {showAll ? (
            // A real disabled <button>, not a disabled prop on the link: `disabled`
            // means nothing to an <a>, which would stay clickable.
            <Button variant="outline" size="sm" disabled>
              {rt.clearFilterButton}
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={`?tab=${tab}&all=1`}>{rt.clearFilterButton}</Link>
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

type RT = Awaited<ReturnType<typeof getDictionary>>["t"]["reports"];

const STOCK_BUCKETS = ["under1m", "m1to2", "m2to3", "over3m"] as const;

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
          {/* Split by time in السلالات, not weight — replacement stock is raised
              in group cages and never weighed individually, so the old weight
              brackets could only ever print zeros. */}
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

const TONE_TEXT = {
  rose: "text-rose-600 dark:text-rose-400",
  sky: "text-sky-600 dark:text-sky-400",
} as const;

const TONE_TILE = {
  rose: "border-rose-500/25 bg-rose-500/10",
  sky: "border-sky-500/25 bg-sky-500/10",
} as const;

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

/**
 * The five averages, split into the two groups that share a denominator.
 * Grouping is the whole point of the layout: these numbers are only comparable
 * within a group, and printing all five in one flat list invites reading
 * «متوسط الفطام ÷ عدد مرات الفطام» against «متوسط البطن الحي ÷ عدد الولادات»
 * as if one minus the other were the losses.
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
  // One decimal: these are litter-sized quantities, so 7.3 says something 7
  // doesn't, while a second decimal is false precision on a handful of does.
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
            single division — the month count here is smaller than the one
            above (a month whose predecessor weaned nothing cannot be scored,
            and the running month is excluded as incomplete). */}
        <AveragesGroup basis={rt.avgLaggedMonthsBasis(soldPerWeaning.months)}>
          <AveragesTile label={rt.avgSoldPerWeaningLabel} value={avg(soldPerWeaning.perWeaning)} />
        </AveragesGroup>

        {/* Same monthly sales, a different denominator: the working herd rather
            than last month's weanings. Its month count differs again — it can
            only score months the farm actually had does standing. */}
        <AveragesGroup basis={rt.avgSalesPerDoeBasis(salesPerDoe.months)}>
          <AveragesTile label={rt.avgSalesPerDoeLabel} value={avg(salesPerDoe.perDoe)} />
        </AveragesGroup>

        {/* Weight, not head — two farms can sell the same number of kits and
            ship very different kilos. Its own basis line because a month whose
            sales carry no recorded weight is dropped, so the month count here
            can fall short of the one above. */}
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
          {/* The herd size on a past date is reconstructed, not recorded — say
              so, or the figure reads as firmer than it is. */}
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
 * البيع الشهري and رصيد الفطام on ONE pair of axes: what left the barn each
 * month, the mothers it took, and the level that was standing when the month
 * closed. They were two cards until a farmer asked to see them together, and
 * the two-card version could not answer the question the pair exists for —
 * whether a month's dip in the balance was its selling or its weaning.
 *
 * A farm with no completed selling month has no bars to hang the line on, so it
 * falls back to the plain balance curve, which can also draw days and weeks.
 */
function SalesChartSection({
  points,
  history,
  rt,
  locale,
}: {
  points: FollowUpReport["monthlySalesHistory"];
  history: FollowUpReport["kitStockHistory"];
  rt: RT;
  locale: Locale;
}) {
  const empty = points.length === 0;
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
              <ChartColumn className="size-5" />
            </span>
            {empty ? rt.sectionStockChart : rt.sectionSalesStockChart}
          </CardTitle>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {empty ? bucketLabel : rt.avgAllTimeBadge}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {empty ? (
          <KitStockChart
            points={history.points}
            bucket={history.bucket}
            locale={locale}
            label={rt.stockChartSeriesLabel}
            emptyText={rt.stockChartEmpty}
          />
        ) : (
          <MonthlySalesChart
            points={points}
            locale={locale}
            label={rt.salesChartSeriesLabel}
            doesLabel={rt.salesChartDoesLabel}
            balanceLabel={rt.stockChartSeriesLabel}
            emptyText={rt.salesChartEmpty}
          />
        )}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{empty ? rt.stockChartNote : rt.salesChartNote}</p>
          {!empty && (
            <>
              <p>{rt.salesChartBalanceNote}</p>
              {/* One scale, so the short blue bar needs explaining, not warning about. */}
              <p>{rt.salesChartAxesNote}</p>
              <p>{rt.salesChartRatioNote}</p>
            </>
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

function ReportSections({ report, asOf, rt }: { report: FollowUpReport; asOf: string | null; rt: RT }) {
  const dash = "—";
  const n = (v: number | null) => (v == null ? dash : v.toLocaleString());

  return (
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
        <Row label={asOf ? rt.remainingStockLabel(asOf) : rt.remainingStockNowLabel} value={n(report.weaning.remainingStock)} />
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

/* ─────────────────────────  إنتاجية القطيع  ───────────────────────── */

/**
 * Everything here divides by عدد الأمهات, so every tile prints the same
 * denominator once at the top (herdBasis) rather than repeating it per number —
 * the whole section is one fraction with a shared bottom, and that is the one
 * fact a reader must not lose track of while comparing these to متوسطات الأداء
 * on the follow-up tab, which divide by events instead.
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
            tone={
              p.cycleAchievement == null
                ? undefined
                : p.cycleAchievement >= 0.8
                  ? "good"
                  : "bad"
            }
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
              p.netPerDoePerMonthCents == null
                ? undefined
                : p.netPerDoePerMonthCents >= 0
                  ? "good"
                  : "bad"
            }
          />
        </div>
        <div className="space-y-1 px-4 pb-4 text-xs text-muted-foreground">
          <p>{rt.herdMonthlyRuleNote}</p>
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
            {/* kgSold is not repeated here: it is the denominator of every tile
                below and it already has a home in حصيلة الفترة above, with the
                other absolute quantities. */}
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <HerdTile
                label={rt.herdRealizedPriceLabel}
                value={money(p.realizedPricePerKgCents)}
              />
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
                  p.marginPerKgCents == null
                    ? undefined
                    : p.marginPerKgCents >= 0
                      ? "good"
                      : "bad"
                }
              />
              <HerdTile label={rt.herdFeedKgLabel} value={num(p.feedKgConsumed, 0)} />
              <HerdTile
                label={rt.herdFeedConversionLabel}
                value={num(p.feedConversionRatio, 2)}
              />
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
                    ? rt.herdBreakEvenPositiveNote(
                        formatMoney(p.marginPerKgCents, herd.currency)
                      )
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
            <div className="overflow-hidden rounded-xl border">
              <SortableTable
                headerRowClassName="[&>th]:border-x"
                // Worst first, matching what findIdleDoes already returns: the
                // top rows are the استبعاد shortlist and should need no sorting.
                initialSortKey="idleDays"
                initialSortDirection="desc"
                columns={[
                  { key: "index", label: rt.herdColIndex, className: "text-center", sortable: false },
                  { key: "tag", label: rt.herdColTag, type: "tag", className: "text-center" },
                  { key: "breed", label: rt.herdColBreed, type: "string", className: "hidden text-center sm:table-cell" },
                  { key: "last", label: rt.herdColLastKindling, type: "date", className: "text-center" },
                  { key: "idleDays", label: rt.herdColIdleDays, type: "number", className: "text-center" },
                ]}
                rows={herd.idleDoes.map((doe, i) => ({
                  key: doe.id,
                  sortValues: {
                    tag: doe.tagId,
                    breed: doe.breed,
                    last: doe.lastKindlingDate,
                    idleDays: doe.idleDays,
                  },
                  node: (
                    <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                          {doe.tagId ?? "—"}
                        </Link>
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
                  ),
                }))}
              />
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
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-card p-3",
        tone && HERD_TONE[tone]
      )}
    >
      <div className={cn("text-xs", tone ? "opacity-80" : "text-muted-foreground")}>{label}</div>
      <div className={cn("mt-1 font-bold tabular-nums", strong ? "text-2xl" : "text-xl")}>
        {value}
      </div>
    </div>
  );
}
