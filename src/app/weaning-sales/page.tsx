import { Rabbit, ShoppingCart, Skull, Layers, PawPrint } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { LocalDate } from "@/components/local-date";
import { formatMoney, formatWeight } from "@/lib/units";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { SaleForm } from "./sale-form";
import { DeleteMovementButton } from "./delete-button";
import { getKitStockSummary } from "./stock";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.weaningSales.title} · RabbitTrack` };
}

export default async function WeaningSalesPage() {
  const [
    { ledger, totalWeaned, totalSold, totalDied, totalRetained, totalRevenueCents, availableStock },
    settings,
    { locale, t },
  ] = await Promise.all([getKitStockSummary(), getSettings(), getDictionary()]);

  return (
    <div className="space-y-6">
      <PageHeader title={t.weaningSales.title} description={t.weaningSales.description} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <SummaryCard
          label={t.weaningSales.totalSoldLabel}
          value={`${totalSold} · ${formatMoney(totalRevenueCents, settings.currency)}`}
          icon={ShoppingCart}
          tone="income"
        />
        <SummaryCard
          label={t.weaningSales.totalDiedLabel}
          value={String(totalDied)}
          icon={Skull}
          tone="expense"
        />
        <SummaryCard
          label={t.weaningSales.totalRetainedLabel}
          value={String(totalRetained)}
          icon={PawPrint}
          tone="expense"
        />
      </div>

      <SaleForm currency={settings.currency} tCommon={t.common} locale={locale} />

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
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.weaningSales.colDate}</TableHead>
                  <TableHead className="text-center">{t.weaningSales.colType}</TableHead>
                  <TableHead className="text-center">{t.weaningSales.colCount}</TableHead>
                  <TableHead className="text-center">{t.weaningSales.colWeight}</TableHead>
                  <TableHead className="text-center">{t.weaningSales.colPricePerKg}</TableHead>
                  <TableHead className="text-center">{t.weaningSales.colAmount}</TableHead>
                  <TableHead className="text-center">{t.weaningSales.colNotes}</TableHead>
                  <TableHead className="text-center" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((entry) => (
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
                            "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                        )}
                      >
                        {entry.kind === "wean"
                          ? t.weaningSales.typeWean
                          : entry.kind === "sale"
                            ? t.weaningSales.typeSale
                            : entry.kind === "death"
                              ? t.weaningSales.typeDeath
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
                    <TableCell>
                      {entry.id ? <DeleteMovementButton id={entry.id} locale={locale} /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "income" | "expense" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-5">
        <div>
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
