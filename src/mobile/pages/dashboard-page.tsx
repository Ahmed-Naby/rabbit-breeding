import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Venus,
  Mars,
  HelpCircle,
  HeartPulse,
  HeartHandshake,
  Microscope,
  Box,
  Sprout,
  MapPin,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchDashboardStats, type DashboardStats } from "../db/queries";
import { getSession, type AuthSession } from "../auth";

export function DashboardPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [session] = useState<AuthSession | null>(() => getSession());

  useEffect(() => {
    async function load() {
      const db = await getDb();
      const s = await fetchDashboardStats(db);
      setStats(s);
    }
    void load();
  }, []);

  if (!stats) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
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
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative isolate overflow-hidden rounded-2xl">
        <div className="relative h-44 w-full sm:h-52">
          <img
            src="/images/hero-dashboard.jpg"
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-l from-black/65 via-black/35 to-black/10" />
        </div>
        <div className="absolute inset-0 flex flex-col justify-center gap-1.5 px-6 sm:px-8">
          {greeting && (
            <p className="text-sm font-medium text-white/80 sm:text-base">{greeting}</p>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {activeFarm?.name ?? t.dashboard.heroTitle}
          </h1>
          {activeFarm?.location && (
            <div className="flex items-center gap-1.5 text-sm text-white/80">
              <MapPin className="size-4 shrink-0" />
              <span>{activeFarm.location}</span>
            </div>
          )}
          <p className="max-w-md text-sm text-white/70 sm:text-base">
            {t.dashboard.heroDescription}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const body = (
            <>
              <div className={`rounded-xl p-3 ${item.color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</p>
                <p className="text-2xl font-bold tracking-tight">{item.value}</p>
              </div>
            </>
          );
          return item.href ? (
            <a
              key={idx}
              href={item.href}
              className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent/40"
            >
              {body}
            </a>
          ) : (
            <div key={idx} className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {readyItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <a
              key={idx}
              href={item.href}
              className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent/40"
            >
              <div className={`rounded-xl p-3 ${item.color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</p>
                <p className="text-2xl font-bold tracking-tight">{item.value}</p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
