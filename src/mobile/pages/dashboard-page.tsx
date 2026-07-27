import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Venus,
  Mars,
  HelpCircle,
  HeartPulse,
  HeartHandshake,
  Heart,
  Baby,
  Stethoscope,
  Microscope,
  Box,
  Sprout,
  MapPin,
  LogOut,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchDashboardStats, type DashboardStats } from "../db/queries";
import { getSession, logout, type AuthSession } from "../auth";
import { flushOutbox, hasUnsyncedOps } from "../sync/sync-manager";
import { Network } from "@capacitor/network";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { RABBIT_STATUSES } from "@/lib/enums";
import { cn } from "@/lib/utils";

export function DashboardPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [session] = useState<AuthSession | null>(() => getSession());
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    if (!window.confirm(locale === "ar" ? "سيتم تسجيل الخروج ومسح البيانات المحفوظة محلياً على هذا الجهاز. هل تريد المتابعة؟" : "Are you sure you want to log out?")) return;
    setBusy(true);

    try {
      const netStatus = await Network.getStatus();
      const synced = netStatus.connected ? await flushOutbox() : !(await hasUnsyncedOps());
      if (!synced) {
        setBusy(false);
        const force = window.confirm(
          locale === "ar"
            ? "توجد تعديلات محليّة لم تُرفع إلى الخادم بعد (1 بانتظار الإرسال).\n\nهل تريد تسجيل الخروج القسري وتجاهل هذه التعديلات؟"
            : "There are unsynced local changes.\n\nDo you want to force logout and discard these local changes?"
        );
        if (!force) return;
        setBusy(true);
      }

      await logout();
      window.location.reload();
    } catch (err) {
      toast.error(String(err));
      setBusy(false);
    }
  };

  useEffect(() => {
    async function load() {
      const db = await getDb();
      const s = await fetchDashboardStats(db);
      setStats(s);
    }
    void load();
  }, []);

  if (!stats) {
    return <PageSkeleton label={locale === "ar" ? "جارِ التحميل…" : "Loading…"} />;
  }

  const activeFarm = session?.farms.find((f) => f.farmId === session.activeFarmId);
  const greetingName = session?.userName?.trim() || session?.email.split("@")[0];
  const greeting = greetingName ? (locale === "ar" ? `مرحباً، ${greetingName} 👋` : `Hello, ${greetingName} 👋`) : null;

  const items = [
    {
      label: locale === "ar" ? "الأمهات النشطة" : "Active Does",
      value: stats.activeDoes,
      icon: Venus,
      color: "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/20",
    },
    {
      label: locale === "ar" ? "الذكور النشطة" : "Active Bucks",
      value: stats.activeBucks,
      icon: Mars,
      color: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20",
    },
    {
      label: locale === "ar" ? "السلالات" : "Juveniles (stock)",
      value: stats.stockCount,
      icon: Sprout,
      color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20",
      href: "#/stock",
    },
  ];

  const countByStatus = new Map(stats.statusCounts.map((s) => [s.status, s.count]));

  // Breeding-cycle "ready now" cards — mirrors each dedicated board's own
  // eligibility rule (fetchDashboardStats), so these counts always match
  // what tapping through to that board would show.
  const readyItems = [
    {
      label: locale === "ar" ? "أمهات جاهزة للتلقيح" : "Does ready for mating",
      value: stats.readyForMating,
      icon: HeartHandshake,
      color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20",
      href: "#/mating",
    },
    {
      label: locale === "ar" ? "جاهزة للجس" : "Ready for pregnancy test",
      value: stats.readyForPregnancyTest,
      icon: Microscope,
      color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20",
      href: "#/pregnancy-test",
    },
    {
      label: locale === "ar" ? "ولادات منتظرة" : "Expected kindlings",
      value: stats.expectedKindlings,
      icon: HeartPulse,
      color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20",
      href: "#/kindling",
    },
    {
      label: locale === "ar" ? "تركيب بيوت الولادة" : "Nest boxes due",
      value: stats.nestBoxesDue,
      icon: Box,
      color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20",
      href: "#/nest-box",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Hero */}
      <div className="hero-pattern relative isolate overflow-hidden rounded-2xl border border-white/10 shadow-lg">
        <div className="relative h-44 w-full sm:h-52">
          <img
            src="/images/hero-dashboard.jpg"
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
          {/* Matches the web dashboard: a flat wash for text contrast plus a
              brand-green tint so the photo belongs to the app. */}
          <div className="absolute inset-0 bg-linear-to-l from-black/80 via-black/50 to-black/10" />
          <div className="absolute inset-0 bg-linear-to-tr from-primary/45 via-transparent to-transparent mix-blend-multiply" />
        </div>
        <div className="absolute inset-0 flex flex-col justify-center gap-2 px-6 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              {greeting && (
                <p className="text-xs font-semibold text-white/90 sm:text-sm uppercase tracking-wider drop-shadow-xs">{greeting}</p>
              )}
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl drop-shadow-md">
                {activeFarm?.name ?? t.dashboard.heroTitle}
              </h1>
              {activeFarm?.location && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-white/80 drop-shadow-xs">
                  <MapPin className="size-3.5 shrink-0" />
                  <span>{activeFarm.location}</span>
                </div>
              )}
            </div>
            {session && (
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/40 backdrop-blur-md px-3 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-black/60 hover:border-white/40 active:scale-95 disabled:opacity-50"
              >
                <LogOut className="size-3.5" />
                <span>{locale === "ar" ? "تسجيل الخروج" : "Log out"}</span>
              </button>
            )}
          </div>
          <p className="max-w-md text-xs text-white/70 sm:text-sm drop-shadow-xs">
            {t.dashboard.heroDescription}
          </p>
        </div>
      </div>

      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const body = (
            <>
              <div className={`rounded-xl p-3 transition-transform duration-300 group-hover:scale-110 ${item.color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">{item.label}</p>
                <p className="text-2xl font-bold tracking-tight">{item.value}</p>
              </div>
            </>
          );
          return item.href ? (
            <a
              key={idx}
              href={item.href}
              className="group card-lift flex items-center gap-4 rounded-xl border glass-card p-4 shadow-xs"
            >
              {body}
            </a>
          ) : (
            <div key={idx} className="flex items-center gap-4 rounded-xl border glass-card p-4 shadow-xs">
              {body}
            </div>
          );
        })}
      </div>

      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {readyItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <a
              key={idx}
              href={item.href}
              className="group card-lift flex items-center gap-4 rounded-xl border glass-card p-4 shadow-xs"
            >
              <div className={`rounded-xl p-3 transition-transform duration-300 group-hover:scale-110 ${item.color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">{item.label}</p>
                <p className="text-2xl font-bold tracking-tight">{item.value}</p>
              </div>
            </a>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Kindlings — rows link to the doe, not the breeding: the offline app
            has no #/breedings/<id> route, and her detail page carries the cycle
            anyway. */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="size-4 text-pink-500" /> {t.dashboard.kindlingsHeading}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <a href="#/kindling">{t.dashboard.viewAll}</a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.overdueKindlings.length === 0 && stats.upcomingKindlings.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.dashboard.noPendingBreedings}
              </p>
            ) : (
              <>
                {stats.overdueKindlings.map((b) => (
                  <Row
                    key={b.breedingId}
                    href={`#/rabbits/${b.doeId}`}
                    left={b.doeTagId ?? "—"}
                    right={
                      <span className="text-red-600 dark:text-red-400">
                        {t.dashboard.overdueDays(Math.abs(b.daysLeft))}
                      </span>
                    }
                    warn
                  />
                ))}
                {stats.upcomingKindlings.map((b) => (
                  <Row
                    key={b.breedingId}
                    href={`#/rabbits/${b.doeId}`}
                    left={b.doeTagId ?? "—"}
                    right={
                      <span className="text-muted-foreground">
                        {t.dashboard.dueOn}{" "}
                        <LocalDate date={new Date(b.expectedKindlingDate)} locale={locale} />
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
              <a href="#/health">{t.dashboard.viewAll}</a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.overdueHealth.length === 0 && stats.upcomingHealth.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.dashboard.noUpcomingHealth}
              </p>
            ) : (
              <>
                {stats.overdueHealth.map((r) => (
                  <Row
                    key={r.id}
                    href={`#/rabbits/${r.rabbitId}`}
                    left={
                      <span className="flex items-center gap-2">
                        {r.rabbitTagId ?? t.dashboard.stockFallback}{" "}
                        <StatusBadge value={r.type} locale={locale} />
                      </span>
                    }
                    right={
                      <span className="text-red-600 dark:text-red-400">
                        {t.dashboard.overdueHealthDays(Math.abs(r.daysLeft))}
                      </span>
                    }
                    warn
                  />
                ))}
                {stats.upcomingHealth.slice(0, 6).map((r) => (
                  <Row
                    key={r.id}
                    href={`#/rabbits/${r.rabbitId}`}
                    left={
                      <span className="flex items-center gap-2">
                        {r.rabbitTagId ?? t.dashboard.stockFallback}{" "}
                        <StatusBadge value={r.type} locale={locale} />
                      </span>
                    }
                    right={
                      <span className="text-muted-foreground">
                        {t.dashboard.dueOn}{" "}
                        <LocalDate date={new Date(r.nextDueDate)} locale={locale} />
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
            <CardTitle className="text-base">{t.dashboard.herdByStatus(stats.totalRabbits)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {RABBIT_STATUSES.map((s) => {
              const c = countByStatus.get(s) ?? 0;
              const pct = stats.totalRabbits ? (c / stats.totalRabbits) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div className="w-20 shrink-0">
                    <StatusBadge value={s} locale={locale} />
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-sm tabular-nums">{c}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent litters survival trend. Rows aren't links: the offline app has
            no litter detail page to open. */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Baby className="size-4" /> {t.dashboard.recentLittersHeading}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <a href="#/weaning-sales">{t.dashboard.viewAll}</a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentWeanings.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t.dashboard.noWeanedLitters}
              </p>
            ) : (
              stats.recentWeanings.map((l) => {
                const pct = l.survival == null ? 0 : Math.round(l.survival * 100);
                return (
                  <div key={l.id} className="flex items-center gap-3 px-2 py-1.5 text-sm">
                    <span className="w-24 shrink-0 text-muted-foreground">
                      <LocalDate date={new Date(l.displayDate)} locale={locale} />
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {/* «—» rather than 0% for a row that predates
                        bornDeadAtKindling: its losses are unrecoverable. */}
                    <span className="w-10 text-right tabular-nums">
                      {l.survival == null ? "—" : `${pct}%`}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  href,
  left,
  right,
  warn,
}: {
  href: string;
  left: ReactNode;
  right: ReactNode;
  warn?: boolean;
}) {
  return (
    <a
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
    </a>
  );
}
