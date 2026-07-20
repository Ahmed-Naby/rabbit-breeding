import Link from "next/link";
import { addDays } from "date-fns";
import { FileText, Venus, Mars } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { fromDateInputValue, toDateInputValue } from "@/lib/dates";
import { getFollowUpReport, type FollowUpReport } from "./report-data";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import DoesFertilityPage from "../does-fertility/page";
import BucksFertilityPage from "../bucks-fertility/page";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.reports.title} · RabbitTrack` };
}

function defaultRange() {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = addDays(to, -6);
  return { from, to };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const activeTab = sp.tab || "follow-up";
  const { from: defaultFrom, to: defaultTo } = defaultRange();
  const from = sp.from ? fromDateInputValue(sp.from) : defaultFrom;
  const toSelected = sp.to ? fromDateInputValue(sp.to) : defaultTo;
  const toExclusive = addDays(toSelected, 1);

  const [report, { t }] = await Promise.all([
    getFollowUpReport(from, toExclusive),
    getDictionary(),
  ]);
  const rt = t.reports;

  const followUpHref = `/reports?tab=follow-up${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`;

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
      </div>

      {/* TAB 1: Follow-Up Reports */}
      {activeTab === "follow-up" && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardContent className="py-4">
              <form method="get" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="tab" value="follow-up" />
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{rt.fromLabel}</span>
                  <Input
                    type="date"
                    name="from"
                    defaultValue={toDateInputValue(from)}
                    className="w-40"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{rt.toLabel}</span>
                  <Input
                    type="date"
                    name="to"
                    defaultValue={toDateInputValue(toSelected)}
                    className="w-40"
                  />
                </label>
                <Button type="submit" size="sm">
                  {rt.applyButton}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">{rt.notTrackedNote}</p>

          <ReportSections report={report} rt={rt} />
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
    </div>
  );
}

type RT = Awaited<ReturnType<typeof getDictionary>>["t"]["reports"];

function ReportSections({ report, rt }: { report: FollowUpReport; rt: RT }) {
  const dash = "—";
  const n = (v: number | null) => (v == null ? dash : v.toLocaleString());

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title={rt.sectionHerd}>
        <Row label={rt.doesLabel} value={n(report.herd.does)} />
        <Row label={rt.bucksLabel} value={n(report.herd.bucks)} />
      </Section>

      <Section title={rt.sectionStock}>
        <Row
          label={`${rt.stockMalesLabel} — ${rt.weightHeavyLabel}`}
          value={n(report.stock.males.heavy)}
        />
        <Row
          label={`${rt.stockMalesLabel} — ${rt.weightMediumLabel}`}
          value={n(report.stock.males.medium)}
        />
        <Row
          label={`${rt.stockMalesLabel} — ${rt.weightLightLabel}`}
          value={n(report.stock.males.light)}
        />
        <Row
          label={`${rt.stockFemalesLabel} — ${rt.weightHeavyLabel}`}
          value={n(report.stock.females.heavy)}
        />
        <Row
          label={`${rt.stockFemalesLabel} — ${rt.weightMediumLabel}`}
          value={n(report.stock.females.medium)}
        />
        <Row
          label={`${rt.stockFemalesLabel} — ${rt.weightLightLabel}`}
          value={n(report.stock.females.light)}
        />
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
