import Link from "next/link";
import { Stethoscope, AlertTriangle, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { daysUntil } from "@/lib/dates";

export const metadata = { title: "Health · RabbitTrack" };

export default async function HealthPage() {
  const [dueRecords, recent] = await Promise.all([
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
  ]);

  const overdue = dueRecords.filter((r) => daysUntil(r.nextDueDate!) < 0);
  const upcoming = dueRecords.filter((r) => {
    const d = daysUntil(r.nextDueDate!);
    return d >= 0 && d <= 30;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="الصحة"
        description="المواعيد المتكررة والأحداث الصحية الأخيرة عبر القطيع."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-red-500" />
              متأخرة ({overdue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد شيء متأخر. 🎉</p>
            ) : (
              overdue.map((r) => (
                <Link
                  key={r.id}
                  href={`/rabbits/${r.rabbit.id}`}
                  className="flex items-center justify-between rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-sm dark:border-red-900/60 dark:bg-red-950/40"
                >
                  <span>
                    <span className="font-medium">{r.rabbit.tagId ?? "سلالة"}</span>{" "}
                    <StatusBadge value={r.type} />
                  </span>
                  <span className="text-muted-foreground">
                    الموعد <LocalDate date={r.nextDueDate} /> ·{" "}
                    متأخرة {Math.abs(daysUntil(r.nextDueDate!))} يوم
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
              قادمة (30 يومًا) ({upcoming.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا شيء مستحق خلال الـ 30 يومًا القادمة.
              </p>
            ) : (
              upcoming.map((r) => (
                <Link
                  key={r.id}
                  href={`/rabbits/${r.rabbit.id}`}
                  className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{r.rabbit.tagId ?? "سلالة"}</span>{" "}
                    <StatusBadge value={r.type} />
                  </span>
                  <span className="text-muted-foreground">
                    الموعد <LocalDate date={r.nextDueDate} /> · خلال{" "}
                    {daysUntil(r.nextDueDate!)} يوم
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">أحداث حديثة</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title="لا توجد سجلات صحية بعد"
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
                    <StatusBadge value={r.type} />
                    <span className="font-medium">{r.rabbit.tagId ?? "سلالة"}</span>
                    <span className="truncate text-muted-foreground">
                      {r.description}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <LocalDate date={r.date} />
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
