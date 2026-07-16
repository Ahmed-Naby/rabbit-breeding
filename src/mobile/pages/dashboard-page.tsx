import { useEffect, useState } from "react";
import { LayoutDashboard, Users, Venus, Mars, HelpCircle, HeartPulse, RefreshCw } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchDashboardStats, type DashboardStats } from "../db/queries";

export function DashboardPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [stats, setStats] = useState<DashboardStats | null>(null);

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

  const items = [
    {
      label: locale === "ar" ? "إجمالي الأرانب" : "Total Rabbits",
      value: stats.totalRabbits,
      icon: Users,
      color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20",
    },
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
      label: locale === "ar" ? "إجمالي البطون (الولادات)" : "Total Litters",
      value: stats.totalLitters,
      icon: HeartPulse,
      color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20",
    },
    {
      label: locale === "ar" ? "عمليات التلقيح النشطة" : "Active Breedings",
      value: stats.activeBreedings,
      icon: RefreshCw,
      color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20",
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
        <div className="absolute inset-0 flex flex-col justify-center gap-1 px-6 sm:px-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {t.dashboard.heroTitle}
          </h1>
          <p className="max-w-md text-sm text-white/85 sm:text-base">
            {t.dashboard.heroDescription}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
              <div className={`rounded-xl p-3 ${item.color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{item.label}</p>
                <p className="text-2xl font-bold tracking-tight">{item.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
