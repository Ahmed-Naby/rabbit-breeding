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
    <div className="space-y-6 animate-fade-in-up">
      {/* Hero */}
      <div className="relative isolate overflow-hidden rounded-2xl shadow-md border border-white/10">
        <div className="relative h-44 w-full sm:h-52">
          <img
            src="/images/hero-dashboard.jpg"
            alt=""
            className="absolute inset-0 size-full object-cover transition-transform duration-10000 ease-out hover:scale-105"
          />
          <div className="absolute inset-0 bg-linear-to-l from-black/75 via-black/45 to-transparent" />
        </div>
        <div className="absolute inset-0 flex flex-col justify-center gap-2 px-6 sm:px-8">
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
          <p className="max-w-md text-xs text-white/70 sm:text-sm drop-shadow-xs">
            {t.dashboard.heroDescription}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              className="group flex items-center gap-4 rounded-xl border glass-card p-4 shadow-xs transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] hover:shadow-md hover:border-primary/30"
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {readyItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <a
              key={idx}
              href={item.href}
              className="group flex items-center gap-4 rounded-xl border glass-card p-4 shadow-xs transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] hover:shadow-md hover:border-primary/30"
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
    </div>
  );
}
