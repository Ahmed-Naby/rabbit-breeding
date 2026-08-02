import { Rabbit, ShoppingCart, Skull, Layers, PawPrint } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { LogStatBadge } from "@/components/log-count-badge";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { Card, CardContent } from "@/components/ui/card";
import { LocalDate } from "@/components/local-date";
import { formatMoney, formatWeight, formatWeightTotal } from "@/lib/units";
import { isWithinDateRange } from "@/lib/dates";
import { ledgerTotals } from "@/lib/kit-ledger";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { SaleForm } from "./sale-form";
import { getKitStockSummary } from "./stock";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.weaningSales.title} · RabbitTrack` };
}

export default async function WeaningSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const [{ ledger: fullLedger, availableStock }, settings, { locale, t }] = await Promise.all([
    getKitStockSummary(),
    getSettings(),
    getDictionary(),
  ]);

  // Filtered in memory, not in the query: the ledger is one page of movements
  // plus weanings grouped by day, and the same rows have to feed both the table
  // and the cards — narrowing them in one place keeps the two in step.
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const ledger =
    from || to ? fullLedger.filter((e) => isWithinDateRange(e.date, from, to)) : fullLedger;

  // The four period cards follow the filter; المخزون المتاح does not — it is a
  // running balance, and every entry on this page is gated on it. See
  // src/lib/kit-ledger.ts.
  const {
    totalWeaned,
    totalSold,
    totalDied,
    totalRetained,
    totalRevenueCents,
    totalSoldWeightGrams,
    avgSoldWeightGrams,
  } = ledgerTotals(ledger);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            {t.weaningSales.title}
            {/* The one figure every entry on this page is gated on — a sale or
                نافق is refused when it would push it below zero — so it stays
                in view instead of only in the card row below. */}
            <LogStatBadge
              label={t.weaningSales.availableStockLabel}
              value={availableStock.toLocaleString()}
              tone="primary"
            />
          </>
        }
        description={t.weaningSales.description}
      />

      {/* The form comes first: this page is opened to record a sale or a نافق,
          and the totals are what you check afterwards. المخزون المتاح — the one
          figure needed *before* typing — rides on the header badge above. */}
      <SaleForm
        currency={settings.currency}
        defaultPricePerKgCents={settings.defaultPricePerKgCents}
        tCommon={t.common}
        locale={locale}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label={t.weaningSales.totalWeanedLabel}
          value={String(totalWeaned)}
          icon={Rabbit}
          tone="neutral"
        />
        <SummaryCard
          label={t.weaningSales.availableStockLabel}
          value={String(availableStock)}
          icon={Layers}
          tone={availableStock >= 0 ? "income" : "expense"}
        />
        {/* The only card with a breakdown: a بيع carries a weight and a price
            as well as a head count, and the three together are what a sale is
            judged on. All of them follow the date filter. */}
        <SummaryCard
          label={t.weaningSales.totalSoldLabel}
          value={String(totalSold)}
          icon={ShoppingCart}
          tone="income"
          detail={
            <>
              <DetailRow
                label={t.weaningSales.soldWeightLabel}
                value={formatWeightTotal(totalSoldWeightGrams, "kg", locale)}
              />
              <DetailRow
                label={t.weaningSales.avgSoldWeightLabel}
                value={
                  avgSoldWeightGrams != null
                    ? formatWeightTotal(avgSoldWeightGrams, "kg", locale)
                    : "—"
                }
              />
              <DetailRow
                label={t.weaningSales.soldRevenueLabel}
                value={formatMoney(totalRevenueCents, settings.currency)}
                emphasis
              />
            </>
          }
        />
        {/* النافق و احتفاظ للتربية share a card: both are heads that left the
            weaning pen without being sold, and neither is big enough next to
            الفطام/المباع to earn a column of its own. Two lines side by side,
            no combined total — the sum of a death and a سلالة means nothing. */}
        <SplitCard
          rows={[
            {
              label: t.weaningSales.totalRetainedLabel,
              value: String(totalRetained),
              icon: PawPrint,
            },
            { label: t.weaningSales.totalDiedLabel, value: String(totalDied), icon: Skull },
          ]}
        />
      </div>

      {/* Sits between the cards and the table because it governs both. Same
          plain GET form as /records — no client JS, and the chosen range stays
          in the URL, so a filtered view can be reloaded or shared. */}
      <Card>
        <CardContent className="py-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t.records.fromLabel}</span>
              <Input type="date" name="from" defaultValue={from} className="w-40" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t.records.toLabel}</span>
              <Input type="date" name="to" defaultValue={to} className="w-40" />
            </label>
            <Button type="submit" size="sm">
              {t.records.applyButton}
            </Button>
            {(from || to) && (
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/weaning-sales">{t.records.clearButton}</Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Layers}
                title={t.weaningSales.emptyTitle}
                description={t.weaningSales.emptyDescription}
              />
            </div>
          ) : (
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "date", label: t.weaningSales.colDate, type: "date", className: "text-center" },
                { key: "type", label: t.weaningSales.colType, type: "string", className: "text-center" },
                { key: "count", label: t.weaningSales.colCount, type: "number", className: "text-center" },
                { key: "weight", label: t.weaningSales.colWeight, type: "number", className: "text-center" },
                {
                  key: "pricePerKg",
                  label: t.weaningSales.colPricePerKg,
                  type: "number",
                  className: "text-center",
                },
                { key: "amount", label: t.weaningSales.colAmount, type: "number", className: "text-center" },
                { key: "notes", label: t.weaningSales.colNotes, type: "string", className: "text-center" },
              ]}
              rows={ledger.map((entry) => ({
                key: entry.key,
                sortValues: {
                  date: entry.date,
                  type: entry.kind,
                  count: entry.count,
                  weight: entry.weightGrams,
                  pricePerKg: entry.pricePerKgCents,
                  amount: entry.amountCents,
                  notes: entry.notes,
                },
                node: (
                  <TableRow key={entry.key} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell>
                      <LocalDate date={entry.date} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          entry.kind === "wean" &&
                            "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                          entry.kind === "sale" &&
                            "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                          entry.kind === "death" &&
                            "bg-red-500/10 text-red-600 dark:text-red-400",
                          entry.kind === "retained" &&
                            "bg-violet-500/10 text-violet-600 dark:text-violet-400",
                          entry.kind === "adjustment" &&
                            "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                          // The mirror image of "retained", so the same violet
                          // family — teal keeps the two apart at a glance.
                          entry.kind === "returned" &&
                            "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                        )}
                      >
                        {entry.kind === "wean"
                          ? t.weaningSales.typeWean
                          : entry.kind === "sale"
                            ? t.weaningSales.typeSale
                            : entry.kind === "death"
                              ? t.weaningSales.typeDeath
                              : entry.kind === "adjustment"
                                ? t.weaningSales.typeAdjustment
                                : entry.kind === "returned"
                                  ? t.weaningSales.typeReturned
                                  : t.weaningSales.typeRetained}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-medium tabular-nums",
                        entry.count >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {entry.count >= 0 ? `+${entry.count}` : entry.count}
                    </TableCell>
                    <TableCell>
                      {entry.weightGrams != null
                        ? formatWeight(entry.weightGrams, "kg", locale)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {entry.pricePerKgCents != null
                        ? formatMoney(entry.pricePerKgCents, settings.currency)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {entry.amountCents != null
                        ? formatMoney(entry.amountCents, settings.currency)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Label at one edge, figure at the other, so three stacked rows read as a
 * column of values instead of three sentences of different lengths.
 */
function DetailRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          emphasis
            ? "text-sm font-semibold text-emerald-600 dark:text-emerald-400"
            : "text-xs font-medium text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * A summary card carrying two independent figures instead of one headline —
 * for figures that belong together but must not be added up. Each row keeps
 * its own icon, so the two read as two entries rather than one split figure.
 */
function SplitCard({
  rows,
}: {
  rows: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  return (
    <Card>
      <CardContent className="divide-y divide-border/60 py-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 py-2.5">
            <row.icon className="size-5 shrink-0 text-red-500/50" />
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">{row.label}</span>
            <span className="text-xl font-semibold tabular-nums text-red-600 dark:text-red-400">
              {row.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "income" | "expense" | "neutral";
  /** Optional breakdown under the headline figure. */
  detail?: React.ReactNode;
}) {
  return (
    <Card>
      {/* items-start, not items-center: a card carrying a detail block is
          taller than the rest, and a centred icon would float mid-card. */}
      <CardContent className="flex items-start justify-between gap-3 py-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              tone === "income" && "text-emerald-600 dark:text-emerald-400",
              tone === "expense" && "text-red-600 dark:text-red-400"
            )}
          >
            {value}
          </p>
          {detail ? (
            <div className="mt-3 space-y-1 border-t border-border/60 pt-2">{detail}</div>
          ) : null}
        </div>
        <Icon
          className={cn(
            "size-8",
            tone === "income" && "text-emerald-500/40",
            tone === "expense" && "text-red-500/40",
            tone === "neutral" && "text-muted-foreground/40"
          )}
        />
      </CardContent>
    </Card>
  );
}
