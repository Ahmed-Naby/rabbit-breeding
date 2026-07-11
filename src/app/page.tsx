import Link from "next/link";
import {
  Rabbit as RabbitIcon,
  Heart,
  AlertTriangle,
  CalendarClock,
  Stethoscope,
  Baby,
  TrendingUp,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { daysUntil, survivalRate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { RABBIT_STATUSES } from "@/lib/enums";

export const metadata = { title: "Dashboard · RabbitTrack" };

export default async function DashboardPage() {
  const settings = await getSettings();
  const win = settings.gestationWindowDays;

  const [statusCounts, pending, dueHealth, recentLitters, activeCount] =
    await Promise.all([
      prisma.rabbit.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.breeding.findMany({
        where: { outcome: "pending" },
        include: { doe: { select: { id: true, tagId: true } } },
        orderBy: { expectedKindlingDate: "asc" },
      }),
      prisma.healthRecord.findMany({
        where: { nextDueDate: { not: null } },
        include: { rabbit: { select: { id: true, tagId: true } } },
        orderBy: { nextDueDate: "asc" },
      }),
      prisma.litter.findMany({
        where: { weaned: { not: null } },
        orderBy: { kindlingDate: "desc" },
        take: 6,
      }),
      prisma.rabbit.count({ where: { status: "active" } }),
    ]);

  const overdueKindlings = pending.filter(
    (b) => daysUntil(b.expectedKindlingDate) < -win
  );
  const upcomingKindlings = pending.filter((b) => {
    const d = daysUntil(b.expectedKindlingDate);
    return d >= -win && d <= 14;
  });
  const overdueHealth = dueHealth.filter((r) => daysUntil(r.nextDueDate!) < 0);
  const upcomingHealth = dueHealth.filter((r) => {
    const d = daysUntil(r.nextDueDate!);
    return d >= 0 && d <= 30;
  });

  const countByStatus = new Map(
    statusCounts.map((s) => [s.status, s._count._all])
  );
  const totalRabbits = statusCounts.reduce((s, r) => s + r._count._all, 0);

  // Herd weaning survival across recent litters.
  const alive = recentLitters.reduce((s, l) => s + l.bornAlive, 0);
  const weaned = recentLitters.reduce((s, l) => s + (l.weaned ?? 0), 0);
  const herdSurvival = alive > 0 ? Math.round((weaned / alive) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة التحكم"
        description="كل ما يحتاج انتباهك اليوم."
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={RabbitIcon}
          label="الأرانب النشطة"
          value={activeCount.toString()}
          href="/stock"
        />
        <StatCard
          icon={CalendarClock}
          label="ولادات قادمة"
          value={upcomingKindlings.length.toString()}
          href="/kindling"
        />
        <StatCard
          icon={AlertTriangle}
          label="مهام متأخرة"
          value={(overdueKindlings.length + overdueHealth.length).toString()}
          tone={
            overdueKindlings.length + overdueHealth.length > 0
              ? "warn"
              : undefined
          }
        />
        <StatCard
          icon={TrendingUp}
          label="نسبة بقاء الفطام"
          value={herdSurvival == null ? "—" : `${herdSurvival}%`}
          href="/kindling"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Kindlings */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="size-4 text-pink-500" /> الولادات
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/kindling">عرض الكل</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueKindlings.length === 0 && upcomingKindlings.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                لا توجد عمليات تلقيح قيد الانتظار.
              </p>
            ) : (
              <>
                {overdueKindlings.map((b) => (
                  <Row
                    key={b.id}
                    href={`/breedings/${b.id}`}
                    left={b.doe.tagId ?? "—"}
                    right={
                      <span className="text-red-600 dark:text-red-400">
                        متأخرة {Math.abs(daysUntil(b.expectedKindlingDate))} يوم
                      </span>
                    }
                    warn
                  />
                ))}
                {upcomingKindlings.map((b) => (
                  <Row
                    key={b.id}
                    href={`/breedings/${b.id}`}
                    left={b.doe.tagId ?? "—"}
                    right={
                      <span className="text-muted-foreground">
                        الموعد <LocalDate date={b.expectedKindlingDate} />
                      </span>
                    }
                  />
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Health */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Stethoscope className="size-4 text-emerald-500" /> مهام صحية
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/health">عرض الكل</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueHealth.length === 0 && upcomingHealth.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                لا يوجد شيء مستحق قريبًا.
              </p>
            ) : (
              <>
                {overdueHealth.map((r) => (
                  <Row
                    key={r.id}
                    href={`/rabbits/${r.rabbit.id}`}
                    left={
                      <span className="flex items-center gap-2">
                        {r.rabbit.tagId ?? "سلالة"} <StatusBadge value={r.type} />
                      </span>
                    }
                    right={
                      <span className="text-red-600 dark:text-red-400">
                        متأخر {Math.abs(daysUntil(r.nextDueDate!))} يوم
                      </span>
                    }
                    warn
                  />
                ))}
                {upcomingHealth.slice(0, 6).map((r) => (
                  <Row
                    key={r.id}
                    href={`/rabbits/${r.rabbit.id}`}
                    left={
                      <span className="flex items-center gap-2">
                        {r.rabbit.tagId ?? "سلالة"} <StatusBadge value={r.type} />
                      </span>
                    }
                    right={
                      <span className="text-muted-foreground">
                        الموعد <LocalDate date={r.nextDueDate} />
                      </span>
                    }
                  />
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Herd by status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              القطيع حسب الحالة ({totalRabbits})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {RABBIT_STATUSES.map((s) => {
              const c = countByStatus.get(s) ?? 0;
              const pct = totalRabbits ? (c / totalRabbits) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div className="w-20 shrink-0">
                    <StatusBadge value={s} />
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm tabular-nums">{c}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent litters survival trend */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Baby className="size-4" /> ولادات حديثة
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/kindling">عرض الكل</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentLitters.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                لا توجد ولادات مفطومة بعد.
              </p>
            ) : (
              recentLitters.map((l) => {
                const rate = survivalRate(l.bornAlive, l.weaned);
                const pct = rate == null ? 0 : Math.round(rate * 100);
                return (
                  <Link
                    key={l.id}
                    href={`/litters/${l.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/40"
                  >
                    <span className="w-24 shrink-0 text-muted-foreground">
                      <LocalDate date={l.kindlingDate} />
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums">{pct}%</span>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href?: string;
  tone?: "warn";
}) {
  const body = (
    <Card
      className={
        tone === "warn" && value !== "0"
          ? "border-amber-300/60 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20"
          : undefined
      }
    >
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <Icon className="size-7 text-muted-foreground/40" />
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Row({
  href,
  left,
  right,
  warn,
}: {
  href: string;
  left: React.ReactNode;
  right: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors " +
        (warn
          ? "border-amber-300/60 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
          : "bg-card hover:bg-accent/40")
      }
    >
      <span className="font-medium">{left}</span>
      {right}
    </Link>
  );
}
