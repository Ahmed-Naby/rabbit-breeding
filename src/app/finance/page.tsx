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

export const metadata = { title: "Finance · RabbitTrack" };

type Range = "month" | "year" | "all";

function rangeStart(range: Range): Date | null {
  const now = new Date();
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

const RANGES: { key: Range; label: string }[] = [
  { key: "month", label: "هذا الشهر" },
  { key: "year", label: "هذه السنة" },
  { key: "all", label: "كل الوقت" },
];

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

  const [transactions, settings] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { rabbit: { select: { id: true, tagId: true } } },
      orderBy: { date: "desc" },
    }),
    getSettings(),
  ]);

  const rabbitList = await prisma.rabbit.findMany({
    select: { id: true, tagId: true, breed: true },
  });
  rabbitList.sort((a, b) => compareTagId(a.tagId, b.tagId));
  const rabbitOptions = rabbitList.map((r) => ({
    value: r.id,
    label: r.tagId ?? `سلالة${r.breed ? ` (${r.breed})` : ""}`,
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
      <PageHeader
        title="المالية"
        description="الإيرادات والمصروفات والربح / الخسارة."
      />

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
          label="الإيرادات"
          value={formatMoney(income, settings.currency)}
          icon={TrendingUp}
          tone="income"
        />
        <SummaryCard
          label="المصروفات"
          value={formatMoney(expense, settings.currency)}
          icon={TrendingDown}
          tone="expense"
        />
        <SummaryCard
          label="صافي الربح / الخسارة"
          value={formatMoney(net, settings.currency)}
          icon={Scale}
          tone={net >= 0 ? "income" : "expense"}
        />
      </div>

      <TransactionForm rabbitOptions={rabbitOptions} currency={settings.currency} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">المعاملات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Wallet}
                title="لا توجد معاملات في هذا النطاق"
                description="أضف إيرادات أو مصروفات باستخدام النموذج أعلاه."
              />
            </div>
          ) : (
            <div className="divide-y">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge value={t.type} />
                    <div>
                      <p className="font-medium">
                        {label(t.category)}
                        {t.notes ? (
                          <span className="ms-2 font-normal text-muted-foreground">
                            {t.notes}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <LocalDate date={t.date} />
                        {t.rabbit ? (
                          <>
                            {" · "}
                            <Link
                              href={`/rabbits/${t.rabbit.id}`}
                              className="hover:underline"
                            >
                              {t.rabbit.tagId ?? "سلالة"}
                            </Link>
                          </>
                        ) : (
                          " · على مستوى المزرعة"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        t.type === "income"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {t.type === "income" ? "+" : "−"}
                      {formatMoney(t.amountCents, settings.currency)}
                    </span>
                    <DeleteTransactionButton id={t.id} />
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
