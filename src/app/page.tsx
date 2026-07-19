import Link from "next/link";
import Image from "next/image";
import {
  Rabbit as RabbitIcon,
  Heart,
  AlertTriangle,
  CalendarClock,
  Stethoscope,
  Baby,
  TrendingUp,
  HeartHandshake,
  Microscope,
  HeartPulse,
  Box,
  Venus,
  Mars,
  Sprout,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { daysUntil, survivalRate, rebreedDueDate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { RABBIT_STATUSES } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import {
  isPregnancyTestCandidate,
  isNestBoxCandidate,
  isKindlingCandidate,
} from "@/lib/breeding-filters";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.dashboard.heroTitle} · RabbitTrack` };
}

export default async function DashboardPage() {
  const settings = await getSettings();
  const win = settings.gestationWindowDays;

  const [
    statusCounts,
    pending,
    dueHealth,
    recentLitters,
    activeCount,
    activeDoes,
    activeBucks,
    stockCount,
    matingCandidates,
    pregnancyTestCandidates,
    nestBoxCandidates,
    kindlingCandidates,
    { locale, t },
  ] = await Promise.all([
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
    prisma.rabbit.count({
      where: { sex: "doe", tagId: { not: null }, status: "active" },
    }),
    prisma.rabbit.count({
      where: { sex: "buck", tagId: { not: null }, status: "active" },
    }),
    prisma.rabbit.count({
      where: { tagId: null, movedToHerdPen: false, status: { notIn: ["deceased", "culled"] } },
    }),
    // Same eligibility rule as /mating (canMate): فاضية، مرضعة، أو مستبعدة.
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { notIn: ["deceased", "culled", "resting"] },
        doeState: { in: ["empty", "nursing", "excluded"] },
      },
      select: {
        id: true,
        doeState: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { actualKindlingDate: true },
        },
      },
    }),
    // Same eligibility rule as /pregnancy-test: مُلقّحة ولسه منتظرة نتيجة الجس.
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { notIn: ["deceased", "culled"] },
        doeState: { in: ["bred", "nursing_bred"] },
      },
      select: {
        id: true,
        breedingsAsDoe: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, matingDate: true } },
      },
    }),
    // Same eligibility rule as /nest-box.
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { notIn: ["deceased", "culled"] },
        doeState: { in: ["bred", "pregnant", "nursing_bred", "nursing_pregnant"] },
      },
      select: {
        id: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, matingDate: true, nestBoxDate: true },
        },
      },
    }),
    // Same eligibility rule as /kindling: "pregnant" / "nursing_pregnant".
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { notIn: ["deceased", "culled"] },
        doeState: { in: ["pregnant", "nursing_pregnant"] },
      },
      select: {
        id: true,
        breedingsAsDoe: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, matingDate: true } },
      },
    }),
    getDictionary(),
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

  // Breeding-cycle "ready now" counts — mirrors the eligibility logic each
  // dedicated board (/mating, /pregnancy-test, /nest-box, /kindling) uses,
  // so these cards' counts always match what a click-through would show.
  const readyForMatingCount = matingCandidates.filter((doe) => {
    if (doe.doeState !== "nursing") return true;
    const kindlingDate = doe.breedingsAsDoe[0]?.actualKindlingDate;
    if (!kindlingDate) return true;
    return daysUntil(rebreedDueDate(kindlingDate, settings.rebreedAfterKindlingDays)) <= 0;
  }).length;
  const readyForPregnancyTestCount = pregnancyTestCandidates.filter((doe) => {
    const b = doe.breedingsAsDoe[0];
    return !!b && isPregnancyTestCandidate({ ...b, actualKindlingDate: null }, settings.pregnancyTestDays);
  }).length;
  const readyForNestBoxCount = nestBoxCandidates.filter((doe) => {
    const b = doe.breedingsAsDoe[0];
    return !!b && isNestBoxCandidate({ ...b, actualKindlingDate: null }, settings.nestBoxDays);
  }).length;
  const readyForKindlingCount = kindlingCandidates.filter((doe) => {
    const b = doe.breedingsAsDoe[0];
    return !!b && isKindlingCandidate({ ...b, actualKindlingDate: null }, settings.gestationDays);
  }).length;

  // Herd weaning survival across recent litters.
  const alive = recentLitters.reduce((s, l) => s + l.bornAlive, 0);
  const weaned = recentLitters.reduce((s, l) => s + (l.weaned ?? 0), 0);
  const herdSurvival = alive > 0 ? Math.round((weaned / alive) * 100) : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Hero */}
      <div className="relative isolate overflow-hidden rounded-2xl shadow-md border border-white/10">
        <div className="relative h-44 w-full sm:h-52">
          <Image
            src="/images/hero-dashboard.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover transition-transform duration-10000 ease-out hover:scale-105"
          />
          <div className="absolute inset-0 bg-linear-to-l from-black/75 via-black/45 to-transparent" />
        </div>
        <div className="absolute inset-0 flex flex-col justify-center gap-2 px-6 sm:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl drop-shadow-md">
            {t.dashboard.heroTitle}
          </h1>
          <p className="max-w-md text-sm text-white/90 sm:text-base drop-shadow-sm font-medium">
            {t.dashboard.heroDescription}
          </p>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-fade-in-up">
        <StatCard
          icon={Venus}
          label={t.dashboard.activeDoes}
          value={activeDoes.toString()}
          href="/rounds"
        />
        <StatCard
          icon={Mars}
          label={t.dashboard.activeBucks}
          value={activeBucks.toString()}
          href="/bucks-rounds"
        />
        <StatCard
          icon={Sprout}
          label={t.dashboard.stockCount}
          value={stockCount.toString()}
          href="/stock"
        />
      </div>

      {/* Breeding-cycle "ready now" row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={HeartHandshake}
          label={t.dashboard.readyForMating}
          value={readyForMatingCount.toString()}
          href="/mating"
        />
        <StatCard
          icon={Microscope}
          label={t.dashboard.readyForPregnancyTest}
          value={readyForPregnancyTestCount.toString()}
          href="/pregnancy-test"
        />
        <StatCard
          icon={HeartPulse}
          label={t.dashboard.expectedKindlings}
          value={readyForKindlingCount.toString()}
          href="/kindling"
        />
        <StatCard
          icon={Box}
          label={t.dashboard.nestBoxesDue}
          value={readyForNestBoxCount.toString()}
          href="/nest-box"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Kindlings */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="size-4 text-pink-500" /> {t.dashboard.kindlingsHeading}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/kindling">{t.dashboard.viewAll}</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueKindlings.length === 0 && upcomingKindlings.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.dashboard.noPendingBreedings}
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
                        {t.dashboard.overdueDays(Math.abs(daysUntil(b.expectedKindlingDate)))}
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
                        {t.dashboard.dueOn} <LocalDate date={b.expectedKindlingDate} locale={locale} />
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
              <Stethoscope className="size-4 text-emerald-500" /> {t.dashboard.healthTasksHeading}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/health">{t.dashboard.viewAll}</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueHealth.length === 0 && upcomingHealth.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.dashboard.noUpcomingHealth}
              </p>
            ) : (
              <>
                {overdueHealth.map((r) => (
                  <Row
                    key={r.id}
                    href={`/rabbits/${r.rabbit.id}`}
                    left={
                      <span className="flex items-center gap-2">
                        {r.rabbit.tagId ?? t.dashboard.stockFallback}{" "}
                        <StatusBadge value={r.type} locale={locale} />
                      </span>
                    }
                    right={
                      <span className="text-red-600 dark:text-red-400">
                        {t.dashboard.overdueHealthDays(Math.abs(daysUntil(r.nextDueDate!)))}
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
                        {r.rabbit.tagId ?? t.dashboard.stockFallback}{" "}
                        <StatusBadge value={r.type} locale={locale} />
                      </span>
                    }
                    right={
                      <span className="text-muted-foreground">
                        {t.dashboard.dueOn} <LocalDate date={r.nextDueDate} locale={locale} />
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
              {t.dashboard.herdByStatus(totalRabbits)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {RABBIT_STATUSES.map((s) => {
              const c = countByStatus.get(s) ?? 0;
              const pct = totalRabbits ? (c / totalRabbits) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div className="w-20 shrink-0">
                    <StatusBadge value={s} locale={locale} />
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
              <Baby className="size-4" /> {t.dashboard.recentLittersHeading}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/kindling">{t.dashboard.viewAll}</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentLitters.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.dashboard.noWeanedLitters}
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
                      <LocalDate date={l.kindlingDate} locale={locale} />
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
  const warnActive = tone === "warn" && value !== "0";
  const body = (
    <Card
      className={cn(
        "transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] origin-center hover:border-primary/40 shadow-xs",
        href && "hover:shadow-lg cursor-pointer",
        warnActive
          ? "border-amber-400 bg-amber-500/10 dark:border-amber-500/25 dark:bg-amber-500/10 animate-pulse"
          : "glass-card"
      )}
    >
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-xs text-muted-foreground/80 font-medium uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        </div>
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300 shadow-xs",
            warnActive
              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 scale-105"
              : "bg-primary/10 text-primary dark:bg-primary/20"
          )}
        >
          <Icon className="size-5 transition-transform duration-300 group-hover:scale-110" />
        </span>
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
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-300",
        "hover:scale-[1.01] active:scale-[0.99] hover:shadow-xs",
        warn
          ? "border-amber-400/50 bg-amber-500/5 hover:bg-amber-500/10 dark:border-amber-500/20 dark:bg-amber-500/5 text-amber-800 dark:text-amber-200"
          : "bg-card/85 hover:bg-accent/40 border-border/60"
      )}
    >
      <span className="font-medium">{left}</span>
      {right}
    </Link>
  );
}
