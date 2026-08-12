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
  TriangleAlert,
  Trophy,
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
import { fromDateInputValue, presetRange, toDateInputValue, type RangePreset } from "@/lib/dates";
import { getFollowUpReport, type FollowUpReport } from "./report-data";
import {
  getHerdReport,
  getIdleDoesReport,
  getWeakDoesReport,
  getTopDoesReport,
  type HerdReport,
  type IdleDoesReport,
  type WeakDoesReport,
  type TopDoesReport,
} from "./herd-data";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/locales";
import DoesFertilityPage from "../does-fertility/page";
import BucksFertilityPage from "../bucks-fertility/page";
import { cn } from "@/lib/utils";
import {
  CULL_FERTILITY_THRESHOLD_PCT,
  CULL_MIN_MATINGS,
} from "@/lib/cull-candidates";
import { WEAK_DOE_RELATIVE_PCT, type WeakDoeReason } from "@/lib/weak-does";
import { doeScoreToneClass } from "@/lib/doe-score";
import { TOP_DOE_SHARE_PCT } from "@/lib/top-does";

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
 * The window a plain /reports visit opens on, expressed as one of the preset
 * buttons so the matching button is already lit when the page loads — the two
 * used to be defined apart and disagreed by a day, leaving every button grey on
 * a range that was in fact a week.
 *
 * تقارير المتابعة is a *weekly* report, so «أسبوع». إنتاجية القطيع opens on
 * «٣ شهور» instead: its headline is cycles per doe per year, and annualising a
 * seven-day window multiplies whatever noise that week held by 52 — one busy
 * Tuesday would read as a world-class farm. A quarter spans at least one full
 * cycle under any of the three rebreed systems, so every doe has had a fair
 * chance to appear in the numerator.
 */
function defaultRange(preset: RangePreset) {
  const { from, to } = presetRange(preset);
  return { from: fromDateInputValue(from), to: fromDateInputValue(to) };
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
  const isWeakTab = activeTab === "weak-does";
  const isTopTab = activeTab === "top-does";
  const { from: defaultFrom, to: defaultTo } = defaultRange(isHerdTab ? "quarter" : "week");
  // «إلغاء التصفية» lands here: no window at all, every record the farm has.
  // A flag rather than empty from/to, because a missing range is what a plain
  // /reports visit looks like and that one still opens on the default week.
  const showAll = sp.all === "1";
  const from = showAll ? ALL_TIME_FROM : sp.from ? fromDateInputValue(sp.from) : defaultFrom;
  const toSelected = showAll ? ALL_TIME_TO : sp.to ? fromDateInputValue(sp.to) : defaultTo;
  const toExclusive = addDays(toSelected, 1);

  // Only the visible tab's data is fetched: the reports have no overlap and
  // الأمهات الخاملة, أمهات ضعيفة الأداء and أفضل الأمهات each scan every log row
  // on the farm, so loading them behind تقارير المتابعة would tax the common
  // case for nothing.
  const [report, herd, idle, weak, top, { locale, t }] = await Promise.all([
    isHerdTab || isIdleTab || isWeakTab || isTopTab
      ? null
      : getFollowUpReport(from, toExclusive),
    isHerdTab ? getHerdReport(from, toExclusive) : null,
    isIdleTab ? getIdleDoesReport() : null,
    isWeakTab ? getWeakDoesReport() : null,
    isTopTab ? getTopDoesReport() : null,
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

        {/* No range either: this one judges a doe's whole life, so a window
            would only invite culling on a quarter. */}
        <Link
          href="/reports?tab=weak-does"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            isWeakTab
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <TriangleAlert className="size-4 text-amber-500" />
          {rt.tabWeakDoes}
        </Link>

        {/* The other end of the same ranking, and rangeless for the same
            reason: a doe earns her place over a lifetime, not over a quarter. */}
        <Link
          href="/reports?tab=top-does"
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap",
            isTopTab
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/40"
          )}
        >
          <Trophy className="size-4 text-emerald-500" />
          {rt.tabTopDoes}
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

          <CullCards report={report} rt={rt} />

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

      {/* TAB 6: Underperforming does — the names behind the cull count on
          تقارير المتابعة. No RangeFilter for the same reason as TAB 5, only
          more so: culling is a lifetime judgement on an animal. */}
      {weak && isWeakTab && (
        <div className="animate-fade-in">
          <WeakDoesSection weak={weak} rt={rt} locale={locale} />
        </div>
      )}

      {/* TAB 7: The best does — where the replacements come from, read off the
          same ranking TAB 6 reads from the bottom. */}
      {top && isTopTab && (
        <div className="animate-fade-in">
          <TopDoesSection top={top} rt={rt} locale={locale} />
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
  const fromValue = showAll ? "" : toDateInputValue(from);
  const toValue = showAll ? "" : toDateInputValue(to);

  // One press each: a link carries the dates AND re-renders the report, so
  // there is nothing to press afterwards. «من بداية التشغيل» is the same all=1
  // view «إلغاء التصفية» used to reach, now named for what it shows.
  const presets: { key: RangePreset; label: string }[] = [
    // Follow-up only, by request. القطيع opens on 90 days and its rates need a
    // few cycles under them to mean anything, so a week there would print a
    // «إنتاجية القطيع» figure off almost no litters.
    ...(tab === "follow-up" ? [{ key: "week" as const, label: rt.rangeWeekButton }] : []),
    { key: "month", label: rt.rangeMonthButton },
    { key: "quarter", label: rt.rangeQuarterButton },
    { key: "year", label: rt.rangeYearButton },
    { key: "all", label: rt.rangeAllButton },
  ];

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap gap-2">
          {presets.map(({ key, label }) => {
            const range = presetRange(key);
            const active = key === "all" ? showAll : !showAll && fromValue === range.from && toValue === range.to;
            const href =
              key === "all"
                ? `?tab=${tab}&all=1`
                : `?tab=${tab}&from=${range.from}&to=${range.to}`;
            return (
              <Button
                key={key}
                asChild={!active}
                // The one already on screen is a disabled button, not a link:
                // `disabled` means nothing to an <a>, which would stay clickable.
                disabled={active}
                variant={active ? "default" : "outline"}
                size="sm"
              >
                {active ? <span>{label}</span> : <Link href={href}>{label}</Link>}
              </Button>
            );
          })}
        </div>

        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={tab} />
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{rt.fromLabel}</span>
            {/* Empty, not the sentinel year: على السجل كله the two boxes read as
                "no dates chosen", which is what من بداية التشغيل just did. */}
            <Input type="date" name="from" defaultValue={fromValue} className="w-40" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{rt.toLabel}</span>
            <Input type="date" name="to" defaultValue={toValue} className="w-40" />
          </label>
          <Button type="submit" size="sm">
            {rt.applyButton}
          </Button>
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

/**
 * «أمهات/ذكور يجب استبعادها» — placed under متوسطات الأداء by request. Both
 * still carry the «الرصيد الحالي» badge: each is a lifetime judgement on the
 * animals standing in the barn today, so the date filter further down the page
 * does not reach them either.
 */
function CullCards({ report, rt }: { report: FollowUpReport; rt: RT }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <BalanceCard
        icon={<TriangleAlert className="size-5" />}
        title={rt.sectionCull}
        badge={rt.allTimeBadge}
      >
        <StatTile
          icon={<Venus className="size-4" />}
          label={rt.cullLabel}
          value={report.cullCandidates}
          tone="amber"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {rt.cullNote(CULL_FERTILITY_THRESHOLD_PCT, CULL_MIN_MATINGS)}
        </p>
      </BalanceCard>

      {/* Its own card rather than a second tile beside the does: the two counts
          are not the same measurement — his is confirmed pregnancies, hers is
          kindlings — so they get their own notes. */}
      <BalanceCard
        icon={<TriangleAlert className="size-5" />}
        title={rt.sectionCullBucks}
        badge={rt.allTimeBadge}
      >
        <StatTile
          icon={<Mars className="size-4" />}
          label={rt.cullBucksLabel}
          value={report.cullBucks}
          tone="amber"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {rt.cullBucksNote(CULL_FERTILITY_THRESHOLD_PCT, CULL_MIN_MATINGS)}
        </p>
      </BalanceCard>
    </div>
  );
}

const TONE_TEXT = {
  rose: "text-rose-600 dark:text-rose-400",
  sky: "text-sky-600 dark:text-sky-400",
  // Green, to match the رصيد الفطام line on the chart further down the page.
  emerald: "text-emerald-600 dark:text-emerald-400",
  // Amber, not rose: these does are a decision waiting to be made, not a loss
  // already taken — rose on this page means dead or negative.
  amber: "text-amber-600 dark:text-amber-400",
} as const;

const TONE_TILE = {
  rose: "border-rose-500/25 bg-rose-500/10",
  sky: "border-sky-500/25 bg-sky-500/10",
  emerald: "border-emerald-500/25 bg-emerald-500/10",
  amber: "border-amber-500/25 bg-amber-500/10",
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
            basis={rt.avgLittersPerDoeYearBasis(littersPerDoeYear.litters)}
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
        {/* The sales chart's four paragraphs are gone: the legend now names
            every mark on it, including the figure over each bar. The stock
            chart has no legend of its own, so its one line stays. */}
        {empty && <p className="text-xs text-muted-foreground">{rt.stockChartNote}</p>}
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
        {/* الاستبعادات first: نافق استبعادات is a subset of it, so the total
            has to be on screen before the slice taken out of it. */}
        <Row label={rt.cullsLabel} value={n(report.culls)} />
        <Row label={rt.culledExcludedDeathsLabel} value={n(report.deaths.culledExcluded)} />
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
 * Everything here divides by عدد الأمهات — the whole section is one fraction
 * with a shared bottom, and that is the one fact a reader must not lose track
 * of while comparing these to متوسطات الأداء on the follow-up tab, which divide
 * by events instead. The header card that said so was removed by request; the
 * tiles whose denominator is not obvious still carry their own basis line.
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
          <HerdTile label={rt.herdSoldPerMonthLabel} value={num(p.soldPerDoePerMonth)} />
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
        {/* The two grey paragraphs are gone by request. What stays is the one
            line that reads the farm's own result back — a verdict, not prose. */}
        <div className="space-y-1 px-4 pb-4 text-xs">
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
        {/* Same as above: the grey paragraph goes, the coloured verdict stays. */}
        <div className="space-y-1 px-4 pb-4 text-xs">
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
            {/* Same as above: the grey paragraphs go, the coloured verdict stays. */}
            <div className="space-y-1 px-4 pb-4 text-xs">
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

/**
 * «أمهات ضعيفة الأداء» — the names behind the cull count on تقارير المتابعة,
 * judged on the three things a breeder actually culls on rather than on
 * fertility alone. See src/lib/weak-does.ts for the rules.
 *
 * The three rates are printed as their own columns and never merged into a
 * score: the owner is being asked to sell an animal, so he gets the evidence,
 * not a verdict. «سبب الترشيح» names which tests she failed, and the two farm
 * averages are on screen above the table because two of the three bars are set
 * from them — a bar the farm can see is a bar the farm can argue with.
 */
function WeakDoesSection({
  weak,
  rt,
  locale,
}: {
  weak: WeakDoesReport;
  rt: RT;
  locale: Locale;
}) {
  const share = weak.doeCount > 0 ? weak.weakDoes.length / weak.doeCount : null;
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const ratePct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
  const dec = (v: number | null) => (v == null ? "—" : v.toFixed(1));

  const reasonLabels: Record<WeakDoeReason, string> = {
    fertility: rt.weakReasonFertility,
    litterSize: rt.weakReasonLitterSize,
  };
  const reasonText = (reasons: WeakDoeReason[]) =>
    reasons.map((r) => reasonLabels[r]).join("، ");

  return (
    <div className="space-y-6">
      <Section title={rt.weakSectionTitle}>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <HerdTile
              label={rt.weakCountLabel}
              value={weak.weakDoes.length.toLocaleString()}
              strong
              tone={weak.weakDoes.length > 0 ? "bad" : "good"}
            />
            <HerdTile label={rt.weakShareLabel} value={pct(share)} />
            {/* The relative bar itself, so the list can be read against it. */}
            <HerdTile label={rt.weakHerdLitterLabel} value={dec(weak.herdAvgLitterSize)} />
          </div>

          <p className="text-xs text-muted-foreground">
            {rt.weakNote(CULL_FERTILITY_THRESHOLD_PCT, WEAK_DOE_RELATIVE_PCT, CULL_MIN_MATINGS)}
          </p>
          <p className="text-xs text-muted-foreground">{rt.weakLifetimeNote}</p>
          <p className="text-xs text-muted-foreground">{rt.doeScoreNote}</p>

          {weak.weakDoes.length === 0 ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{rt.weakEmpty}</p>
          ) : (
            <>
            <div className="flex justify-end">
              <ExportXlsxButton
                locale={locale}
                spec={{
                  kind: "weakDoes",
                  rows: weak.weakDoes.map((doe) => ({
                    tagId: doe.tagId,
                    breed: doe.breed,
                    matings: doe.matings,
                    kindlings: doe.kindlings,
                    score: doe.score,
                    fertilityRatePct: doe.fertilityRatePct,
                    avgLitterSize: doe.avgLitterSize,
                    reasons: reasonText(doe.reasons),
                  })),
                }}
              />
            </div>
            <div className="overflow-hidden rounded-xl border">
              <SortableTable
                headerRowClassName="[&>th]:border-x"
                // Worst first, matching what findWeakDoes already returns: the
                // does failing both tests are the ones the page exists for.
                initialSortKey="reasons"
                initialSortDirection="desc"
                columns={[
                  { key: "index", label: rt.herdColIndex, className: "text-center", sortable: false },
                  { key: "tag", label: rt.herdColTag, type: "tag", className: "text-center" },
                  { key: "score", label: rt.weakColScore, type: "number", className: "text-center" },
                  { key: "breed", label: rt.herdColBreed, type: "string", className: "hidden text-center sm:table-cell" },
                  { key: "matings", label: rt.weakColMatings, type: "number", className: "hidden text-center sm:table-cell" },
                  { key: "kindlings", label: rt.weakColKindlings, type: "number", className: "hidden text-center sm:table-cell" },
                  { key: "fertility", label: rt.weakColFertility, type: "number", className: "text-center" },
                  { key: "litterSize", label: rt.weakColLitterSize, type: "number", className: "text-center" },
                  { key: "reasons", label: rt.weakColReasons, type: "number", className: "text-center" },
                ]}
                rows={weak.weakDoes.map((doe, i) => ({
                  key: doe.id,
                  sortValues: {
                    tag: doe.tagId,
                    score: doe.score,
                    breed: doe.breed,
                    matings: doe.matings,
                    kindlings: doe.kindlings,
                    fertility: doe.fertilityRatePct,
                    litterSize: doe.avgLitterSize,
                    // Sorted by how many tests she failed, which is what the
                    // column shows once you stop reading the words.
                    reasons: doe.reasons.length,
                  },
                  node: (
                    <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                          {doe.tagId ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className={cn("font-bold tabular-nums", doeScoreToneClass(doe.score))}>
                        {doe.score ?? "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{doe.breed ?? "—"}</TableCell>
                      <TableCell className="hidden tabular-nums sm:table-cell">{doe.matings}</TableCell>
                      <TableCell className="hidden tabular-nums sm:table-cell">{doe.kindlings}</TableCell>
                      {/* Only the cells that actually failed are coloured, so a
                          glance down a column finds the reason without reading
                          the last one. */}
                      <TableCell
                        className={cn(
                          "tabular-nums",
                          doe.reasons.includes("fertility") && "font-semibold text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {ratePct(doe.fertilityRatePct)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "tabular-nums",
                          doe.reasons.includes("litterSize") && "font-semibold text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {dec(doe.avgLitterSize)}
                      </TableCell>
                      <TableCell className="text-xs">{reasonText(doe.reasons)}</TableCell>
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

/**
 * «أفضل الأمهات» — the shortlist a breeder picks his replacements from.
 *
 * The mirror image of WeakDoesSection: one ranking, read from the top instead
 * of the bottom. Here a single figure IS the point, unlike the culling tab —
 * nobody needs evidence to keep a doe, so «الدرجة» leads and the rates that
 * built it follow behind it as the workings.
 */
function TopDoesSection({
  top,
  rt,
  locale,
}: {
  top: TopDoesReport;
  rt: RT;
  locale: Locale;
}) {
  const ratePct = (v: number) => `${Math.round(v)}%`;
  const dec = (v: number | null) => (v == null ? "—" : v.toFixed(1));
  const bestScore = top.topDoes.length > 0 ? top.topDoes[0].score : null;

  return (
    <div className="space-y-6">
      <Section title={rt.topSectionTitle}>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HerdTile
              label={rt.topBestScoreLabel}
              value={bestScore == null ? "—" : bestScore.toLocaleString()}
              strong
              tone={bestScore == null ? undefined : "good"}
            />
            <HerdTile label={rt.topAvgScoreLabel} value={dec(top.herdAvgScore)} />
            <HerdTile label={rt.topCountLabel} value={top.topDoes.length.toLocaleString()} />
            <HerdTile label={rt.weakHerdLitterLabel} value={dec(top.herdAvgLitterSize)} />
          </div>

          <p className="text-xs text-muted-foreground">{rt.topNote(TOP_DOE_SHARE_PCT)}</p>
          <p className="text-xs text-muted-foreground">{rt.doeScoreNote}</p>
          <p className="text-xs text-muted-foreground">{rt.weakLifetimeNote}</p>

          {top.topDoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{rt.topEmpty}</p>
          ) : (
            <>
              <div className="flex justify-end">
                <ExportXlsxButton
                  locale={locale}
                  spec={{
                    kind: "topDoes",
                    rows: top.topDoes.map((doe, i) => ({
                      rank: i + 1,
                      tagId: doe.tagId,
                      breed: doe.breed,
                      score: doe.score,
                      matings: doe.matings,
                      kindlings: doe.kindlings,
                      fertilityRatePct: doe.fertilityRatePct,
                      avgLitterSize: doe.avgLitterSize,
                    })),
                  }}
                />
              </div>
              <div className="overflow-hidden rounded-xl border">
                <SortableTable
                  headerRowClassName="[&>th]:border-x"
                  // Best first, which is the order findTopDoes already returns.
                  initialSortKey="score"
                  initialSortDirection="desc"
                  columns={[
                    { key: "index", label: rt.topColRank, className: "text-center", sortable: false },
                    { key: "tag", label: rt.herdColTag, type: "tag", className: "text-center" },
                    { key: "score", label: rt.weakColScore, type: "number", className: "text-center" },
                    { key: "breed", label: rt.herdColBreed, type: "string", className: "hidden text-center sm:table-cell" },
                    { key: "matings", label: rt.weakColMatings, type: "number", className: "hidden text-center sm:table-cell" },
                    { key: "kindlings", label: rt.weakColKindlings, type: "number", className: "text-center" },
                    { key: "fertility", label: rt.weakColFertility, type: "number", className: "text-center" },
                    { key: "litterSize", label: rt.weakColLitterSize, type: "number", className: "text-center" },
                  ]}
                  rows={top.topDoes.map((doe, i) => ({
                    key: doe.id,
                    sortValues: {
                      tag: doe.tagId,
                      score: doe.score,
                      breed: doe.breed,
                      matings: doe.matings,
                      kindlings: doe.kindlings,
                      fertility: doe.fertilityRatePct,
                      litterSize: doe.avgLitterSize,
                    },
                    node: (
                      <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                            {doe.tagId ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell className={cn("font-bold tabular-nums", doeScoreToneClass(doe.score))}>
                          {doe.score}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{doe.breed ?? "—"}</TableCell>
                        <TableCell className="hidden tabular-nums sm:table-cell">{doe.matings}</TableCell>
                        <TableCell className="tabular-nums">{doe.kindlings}</TableCell>
                        <TableCell className="tabular-nums">{ratePct(doe.fertilityRatePct)}</TableCell>
                        <TableCell className="tabular-nums">{doe.avgLitterSize.toFixed(1)}</TableCell>
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
