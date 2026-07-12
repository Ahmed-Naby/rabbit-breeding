import Link from "next/link";
import { Stethoscope, AlertTriangle, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { daysUntil } from "@/lib/dates";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.health.title} · RabbitTrack` };
}

export default async function HealthPage() {
  const [dueRecords, recent, { locale, t }] = await Promise.all([
    prisma.healthRecord.findMany({
      where: { nextDueDate: { not: null } },
      include: { rabbit: { select: { id: true, tagId: true } } },
      orderBy: { nextDueDate: "asc" },
    }),
    prisma.healthRecord.findMany({
      include: { rabbit: { select: { id: true, tagId: true } } },
      orderBy: { date: "desc" },
      take: 15,
    }),
    getDictionary(),
  ]);

  const overdue = dueRecords.filter((r) => daysUntil(r.nextDueDate!) < 0);
  const upcoming = dueRecords.filter((r) => {
    const d = daysUntil(r.nextDueDate!);
    return d >= 0 && d <= 30;
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t.health.title} description={t.health.description} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-red-500" />
              {t.health.overdueHeading(overdue.length)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.health.overdueEmpty}</p>
            ) : (
              overdue.map((r) => (
                <Link
                  key={r.id}
                  href={`/rabbits/${r.rabbit.id}`}
                  className="flex items-center justify-between rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-sm dark:border-red-900/60 dark:bg-red-950/40"
                >
                  <span>
                    <span className="font-medium">{r.rabbit.tagId ?? t.dashboard.stockFallback}</span>{" "}
                    <StatusBadge value={r.type} locale={locale} />
                  </span>
                  <span className="text-muted-foreground">
                    {t.health.dueOn} <LocalDate date={r.nextDueDate} locale={locale} /> ·{" "}
                    {t.health.overdueDays(Math.abs(daysUntil(r.nextDueDate!)))}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-sky-500" />
              {t.health.upcomingHeading(upcoming.length)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t.health.upcomingEmpty}
              </p>
            ) : (
              upcoming.map((r) => (
                <Link
                  key={r.id}
                  href={`/rabbits/${r.rabbit.id}`}
                  className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{r.rabbit.tagId ?? t.dashboard.stockFallback}</span>{" "}
                    <StatusBadge value={r.type} locale={locale} />
                  </span>
                  <span className="text-muted-foreground">
                    {t.health.dueOn} <LocalDate date={r.nextDueDate} locale={locale} /> ·{" "}
                    {t.health.inDays(daysUntil(r.nextDueDate!))}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.health.recentEventsHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title={t.health.emptyTitle}
            />
          ) : (
            <div className="divide-y">
              {recent.map((r) => (
                <Link
                  key={r.id}
                  href={`/rabbits/${r.rabbit.id}`}
                  className="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge value={r.type} locale={locale} />
                    <span className="font-medium">{r.rabbit.tagId ?? t.dashboard.stockFallback}</span>
                    <span className="truncate text-muted-foreground">
                      {r.description}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <LocalDate date={r.date} locale={locale} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
