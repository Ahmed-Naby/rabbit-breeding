import Link from "next/link";
import { Wallet, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { formatMoney } from "@/lib/units";
import { label } from "@/lib/enums";
import { getSettings } from "@/lib/settings";
import { cn, compareTagId } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { TransactionForm } from "./transaction-form";
import { DeleteTransactionButton } from "./delete-button";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.finance.title} · RabbitTrack` };
}

type Range = "month" | "year" | "all";

function rangeStart(range: Range): Date | null {
  const now = new Date();
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range: Range =
    sp.range === "month" || sp.range === "year" ? sp.range : "all";
  const start = rangeStart(range);

  const where: Prisma.TransactionWhereInput = start
    ? { date: { gte: start } }
    : {};

  const [transactions, settings, { locale, t }] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { rabbit: { select: { id: true, tagId: true } } },
      orderBy: { date: "desc" },
    }),
    getSettings(),
    getDictionary(),
  ]);

  const RANGES: { key: Range; label: string }[] = [
    { key: "month", label: t.finance.rangeMonth },
    { key: "year", label: t.finance.rangeYear },
    { key: "all", label: t.finance.rangeAll },
  ];

  const rabbitList = await prisma.rabbit.findMany({
    select: { id: true, tagId: true, breed: true },
  });
  rabbitList.sort((a, b) => compareTagId(a.tagId, b.tagId));
  const rabbitOptions = rabbitList.map((r) => ({
    value: r.id,
    label: r.tagId ?? `${t.dashboard.stockFallback}${r.breed ? ` (${r.breed})` : ""}`,
  }));

  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amountCents, 0);
  const expense = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amountCents, 0);
  const net = income - expense;

  return (
    <div className="space-y-6">
      <PageHeader title={t.finance.title} description={t.finance.description} />

      <div className="flex gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/finance?range=${r.key}`}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              range === r.key
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label={t.finance.incomeLabel}
          value={formatMoney(income, settings.currency)}
          icon={TrendingUp}
          tone="income"
        />
        <SummaryCard
          label={t.finance.expenseLabel}
          value={formatMoney(expense, settings.currency)}
          icon={TrendingDown}
          tone="expense"
        />
        <SummaryCard
          label={t.finance.netLabel}
          value={formatMoney(net, settings.currency)}
          icon={Scale}
          tone={net >= 0 ? "income" : "expense"}
        />
      </div>

      <TransactionForm
        rabbitOptions={rabbitOptions}
        currency={settings.currency}
        tCommon={t.common}
        locale={locale}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.finance.transactionsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Wallet}
                title={t.finance.emptyTitle}
                description={t.finance.emptyDescription}
              />
            </div>
          ) : (
            <div className="divide-y">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge value={tx.type} locale={locale} />
                    <div>
                      <p className="font-medium">
                        {label(tx.category, locale)}
                        {tx.notes ? (
                          <span className="ms-2 font-normal text-muted-foreground">
                            {tx.notes}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <LocalDate date={tx.date} locale={locale} />
                        {tx.rabbit ? (
                          <>
                            {" · "}
                            <Link
                              href={`/rabbits/${tx.rabbit.id}`}
                              className="hover:underline"
                            >
                              {tx.rabbit.tagId ?? t.dashboard.stockFallback}
                            </Link>
                          </>
                        ) : (
                          t.finance.farmWideSuffix
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        tx.type === "income"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {tx.type === "income" ? "+" : "−"}
                      {formatMoney(tx.amountCents, settings.currency)}
                    </span>
                    <DeleteTransactionButton id={tx.id} locale={locale} />
                  </div>
                </div>
              ))}
            </div>
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
  tone: "income" | "expense";
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-5">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              tone === "income"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {value}
          </p>
        </div>
        <Icon
          className={cn(
            "size-8",
            tone === "income" ? "text-emerald-500/40" : "text-red-500/40"
          )}
        />
      </CardContent>
    </Card>
  );
}
