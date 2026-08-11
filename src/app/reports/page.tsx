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
  Hourglass,
  PackageOpen,
  ShoppingCart,
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
import { revenuePerDoeCents } from "@/lib/breeding-averages";
import { fromDateInputValue, toDateInputValue } from "@/lib/dates";
import { getFollowUpReport, type FollowUpReport } from "./report-data";
import {
  getHerdReport,
  getIdleDoesReport,
  type HerdReport,
  type IdleDoesReport,
} from "./herd-data";
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
  const isIdleTab = activeTab === "idle-does";
  const { from: defaultFrom, to: defaultTo } = defaultRange(isHerdTab ? 90 : 7);
  // «إلغاء التصفية» lands here: no window at all, every record the farm has.
  // A flag rather than empty from/to, because a missing range is what a plain
  // /reports visit looks like and that one still opens on the default week.
  const showAll = sp.all === "1";
  const from = showAll ? ALL_TIME_FROM : sp.from ? fromDateInputValue(sp.from) : defaultFrom;
  const toSelected = showAll ? ALL_TIME_TO : sp.to ? fromDateInputValue(sp.to) : defaultTo;
  const toExclusive = addDays(toSelected, 1);

  // Only the visible tab's data is fetched: the three reports have no overlap
  // and الأمهات الخاملة scans every KindlingLog row on the farm, so loading it
  // behind تقارير المتابعة would tax the common case for nothing.
  const [report, herd, idle, { locale, t }] = await Promise.all([
    isHerdTab || isIdleTab ? null : getFollowUpReport(from, toExclusive),
    isHerdTab ? getHerdReport(from, toExclusive) : null,
    isIdleTab ? getIdleDoesReport() : null,
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

      {/* 5 Tabs Navigation Bar */}
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

        {/* No range in the href: this one is a snapshot of today and has no
            filter to carry a window into. */}
        <Link
          href="/reports?tab=idle-does"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            isIdleTab
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Hourglass className="size-4 text-amber-500" />
          {rt.tabIdleDoes}
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
            littersPerDoeYear={report.littersPerDoeYear}
            monthlySales={report.monthlySales}
            soldPerWeaning={report.soldPerWeaning}
            salesPerDoe={report.salesPerDoe}
            weightPerDoe={report.weightPerDoe}
            pricing={report.pricing}
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
          <HerdProductivitySection herd={herd} rt={rt} />
        </div>
      )}

      {/* TAB 5: Idle does — the names behind the gap between the two sets of
          averages. No RangeFilter above it: idleness is measured from today,
          so there is no window to choose. */}
      {idle && isIdleTab && (
        <div className="animate-fade-in">
          <IdleDoesSection idle={idle} rt={rt} locale={locale} />
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
        {/* Two short cards against one tall one: السلالات carries eight age rows,
            so stacking القطيع and رصيد الفطام fills the column instead of
            leaving the herd card floating over empty space. */}
        <div className="space-y-4">
          <BalanceCard icon={<Rabbit className="size-5" />} title={rt.sectionHerd} badge={rt.allTimeBadge}>
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={<Venus className="size-4" />} label={rt.doesLabel} value={report.herd.does} tone="rose" />
              <StatTile icon={<Mars className="size-4" />} label={rt.bucksLabel} value={report.herd.bucks} tone="sky" />
            </div>
          </BalanceCard>

          <BalanceCard
            icon={<PackageOpen className="size-5" />}
            title={rt.sectionWeanedBalance}
            badge={rt.allTimeBadge}
          >
            <StatTile
              icon={<ShoppingCart className="size-4" />}
              label={rt.weanedBalanceLabel}
              value={report.weaning.currentStock}
              tone="emerald"
            />
            <p className="mt-2 text-xs text-muted-foreground">{rt.weanedBalanceNote}</p>
          </BalanceCard>
        </div>

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
  // Green, to match the رصيد الفطام line on the chart further down the page.
  emerald: "text-emerald-600 dark:text-emerald-400",
} as const;

const TONE_TILE = {
  rose: "border-rose-500/25 bg-rose-500/10",
  sky: "border-sky-500/25 bg-sky-500/10",
  emerald: "border-emerald-500/25 bg-emerald-500/10",
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
  littersPerDoeYear,
  monthlySales,
  soldPerWeaning,
  salesPerDoe,
  weightPerDoe,
  pricing,
  rt,
}: {
  averages: FollowUpReport["averages"];
  littersPerDoeYear: FollowUpReport["littersPerDoeYear"];
  monthlySales: FollowUpReport["monthlySales"];
  soldPerWeaning: FollowUpReport["soldPerWeaning"];
  salesPerDoe: FollowUpReport["salesPerDoe"];
  weightPerDoe: FollowUpReport["weightPerDoe"];
  pricing: FollowUpReport["pricing"];
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
  // The farm's own currency, from الإعدادات — the same source as the price
  // being multiplied, so the tile can never label EGP figures as dollars.
  const money = (cents: number | null) =>
    cents == null ? "—" : formatMoney(cents, pricing.currency);

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
        {/* The funnel, side by side: how often a doe kindles, what was born,
            what survived to weaning, what was sold — the figures a farmer
            actually reads against each other. They sat in separate groups
            before, which is why it took a question to notice 5.9 − 0.4 ≠ 5.1.

            Litters/year leads because it is the multiplier the rest hang off:
            times البطن الحي it gives kits born per doe per year. It is also the
            only tile here that is not a per-litter quantity.

            Each keeps its own basis line UNDER its own number rather than one
            over the row: the denominators genuinely differ (doe-months,
            kindlings, weanings, a mean of monthly ratios) and pretending
            otherwise is the exact subtraction the note below has to walk
            back. */}
        <AveragesGroup basis={rt.avgFunnelBasis} abreast>
          <AveragesTile
            label={rt.avgLittersPerDoeYearLabel}
            value={avg(littersPerDoeYear.perYear)}
            basis={rt.avgLittersPerDoeYearBasis(
              littersPerDoeYear.litters,
              avg(littersPerDoeYear.doeYears)
            )}
          />
          <AveragesTile
            label={rt.avgBornAliveLabel}
            value={avg(averages.bornAlive)}
            basis={rt.avgKindlingBasis(averages.kindlings)}
          />
          <AveragesTile
            label={rt.avgWeanedLabel}
            value={avg(averages.weaned)}
            basis={rt.avgWeaningBasis(averages.weanings)}
          />
          <AveragesTile
            label={rt.avgSoldPerWeaningLabel}
            value={avg(soldPerWeaning.perWeaning)}
            basis={rt.avgLaggedMonthsBasis(soldPerWeaning.months)}
          />
        </AveragesGroup>

        {/* The selling row: the same monthly sales read three ways — the whole
            farm's month, one doe's month, and that doe's month in kilos rather
            than head (two farms can ship the same count at very different
            weights). Abreast for the same reason as the funnel above, and with
            per-tile basis lines for the same reason too: the first divides by
            months, the other two are means of monthly ratios, and even their
            month counts differ — the herd figure can only score months with
            does standing, and the weight figure drops any month whose sales
            carry no recorded weight. */}
        <AveragesGroup basis={rt.avgSellingBasis} abreast>
          <AveragesTile
            label={rt.avgMonthlySalesLabel}
            value={whole(monthlySales.perMonth)}
            basis={rt.avgMonthsBasis(monthlySales.months)}
          />
          <AveragesTile
            label={rt.avgSalesPerDoeLabel}
            value={avg(salesPerDoe.perDoe)}
            basis={rt.avgSalesPerDoeBasis(salesPerDoe.months)}
          />
          <AveragesTile
            label={rt.avgWeightPerDoeLabel}
            value={kg(weightPerDoe.perDoeGrams)}
            basis={rt.avgWeightPerDoeBasis(weightPerDoe.months)}
          />
          {/* The kilos above, priced. Its basis line names the multiplier
              rather than a denominator, because it adds no new division —
              and when the price is still unset it says where to set it, so
              the «—» reads as a missing setting and not as a farm that
              sells nothing. */}
          <AveragesTile
            label={rt.avgRevenuePerDoeLabel}
            value={money(revenuePerDoeCents(weightPerDoe.perDoeGrams, pricing.pricePerKgCents))}
            basis={
              pricing.pricePerKgCents > 0
                ? rt.avgRevenuePerDoeBasis(formatMoney(pricing.pricePerKgCents, pricing.currency))
                : rt.avgRevenuePerDoeNoPriceBasis
            }
          />
        </AveragesGroup>

        {/* The explanatory paragraphs are gone; each tile's own basis line
            carries its denominator. What stays is the one line that appears
            only when the data is actually incomplete — a warning, not prose. */}
        {weightPerDoe.unknownWeightMonths > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {rt.avgUnknownWeightMonthsNote(weightPerDoe.unknownWeightMonths)}
          </p>
        )}
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
            ratioLabel={rt.salesChartRatioLabel}
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

function AveragesGroup({
  basis,
  children,
  /** Rows whose tiles must stay on one line even on a phone, because they are
      read as a sequence — litters/year, born, weaned, sold. */
  abreast,
}: {
  basis: string;
  children: React.ReactNode;
  abreast?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="mb-2 border-b border-border/50 pb-2 text-xs font-semibold text-muted-foreground">
        {basis}
      </div>
      <div
        className={
          // grid-flow-col + auto-cols-fr rather than a fixed column count: the
          // funnel row is four tiles and the selling row is three, and both are
          // meant to stay on one line whatever they hold.
          abreast
            ? "grid auto-cols-fr grid-flow-col gap-2"
            : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {children}
      </div>
    </div>
  );
}

/**
 * `basis` is per-tile, for the funnel row: those three figures each have a
 * different denominator, so a single line over the group would misdescribe two
 * of them. Everywhere else the group's own basis line covers all its tiles and
 * this stays off — which is why it doubles as the "three across a narrow
 * screen" signal that tightens the padding and drops a size.
 */
function AveragesTile({ label, value, basis }: { label: string; value: string; basis?: string }) {
  return (
    <div className={`rounded-lg border border-border/60 bg-card ${basis ? "p-2 sm:p-3" : "p-3"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-bold tabular-nums ${basis ? "text-xl sm:text-2xl" : "text-2xl"}`}>
        {value}
      </div>
      {basis && <div className="mt-1 text-[11px] leading-snug text-muted-foreground/80">{basis}</div>}
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
function HerdProductivitySection({ herd, rt }: { herd: HerdReport; rt: RT }) {
  const p = herd.productivity;
  // One decimal, same as the event-based averages — a second decimal is false
  // precision on a herd of a few dozen does.
  const num = (v: number | null, digits = 1) =>
    v == null
      ? "—"
      : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const money = (v: number | null) => (v == null ? "—" : formatMoney(Math.round(v), herd.currency));
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

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
          <HerdTile
            label={rt.herdCyclesActualLabel}
            value={num(p.cyclesPerDoePerYear)}
            // Spelled out because the denominator is the whole point of this
            // number and is not the «÷ N أم في العنبر» printed atop the board.
            basis={
              p.doeYears == null
                ? undefined
                : rt.herdCyclesActualBasis(num(p.doeYears), p.cyclesExcludeRunningMonth)
            }
            strong
          />
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

    </div>
  );
}

/**
 * «الأمهات الخاملة» — its own tab since a farmer asked for one, and the only
 * report on this page with no date filter above it. It used to sit at the
 * bottom of إنتاجية القطيع, which is where its meaning still comes from: these
 * are the does the rates on that tab divide by but that produced nothing, so
 * this list IS the gap between those averages and the per-event ones.
 */
function IdleDoesSection({
  idle,
  rt,
  locale,
}: {
  idle: IdleDoesReport;
  rt: RT;
  locale: Locale;
}) {
  const idleShare = idle.doeCount > 0 ? idle.idleDoes.length / idle.doeCount : null;
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/70 bg-linear-to-br from-amber-500/8 via-card to-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
              <Hourglass className="size-5" />
            </span>
            {rt.herdSectionIdle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          <p>{rt.herdIdleDescription(idle.cycleDays)}</p>
          <p>{rt.herdIdleAsOfNote}</p>
        </CardContent>
      </Card>

      <Section title={rt.herdSectionIdle}>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <HerdTile
              label={rt.herdIdleCountLabel}
              value={idle.idleDoes.length.toLocaleString()}
              strong
              tone={idle.idleDoes.length > 0 ? "bad" : "good"}
            />
            <HerdTile label={rt.herdIdleShareLabel} value={pct(idleShare)} />
          </div>

          {idle.idleDoes.length === 0 ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{rt.herdIdleEmpty}</p>
          ) : (
            <>
            <div className="flex justify-end">
              <ExportXlsxButton
                locale={locale}
                spec={{
                  kind: "idleDoes",
                  rows: idle.idleDoes.map((doe) => ({
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
                rows={idle.idleDoes.map((doe, i) => ({
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
  basis,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: keyof typeof HERD_TONE;
  basis?: string;
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
      {basis && (
        <div className={cn("mt-1 text-[11px] leading-snug", tone ? "opacity-70" : "text-muted-foreground/80")}>
          {basis}
        </div>
      )}
    </div>
  );
}
