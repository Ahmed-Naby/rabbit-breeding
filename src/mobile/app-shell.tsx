/**
 * Root shell for the offline app: a minimal hash router (not next/navigation
 * — this bundle is a static Vite build with no Next.js runtime), a
 * persistent sync-status indicator, and an "Open full site" escape hatch for
 * every screen the plan keeps out of the offline scope (Settings, Finance,
 * /health, rabbit detail/pedigree). Only the does board exists as a route
 * today (Phase 3); Phase 4 adds siblings the same way.
 */
import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import {
  ExternalLink,
  RefreshCw,
  WifiOff,
  Menu,
  X,
  Rabbit as RabbitIcon,
  LayoutDashboard,
  ClipboardList,
  Sprout,
  Venus,
  Mars,
  HeartHandshake,
  Microscope,
  Box,
  HeartPulse,
  ArrowLeftRight,
  Milk,
  ShoppingCart,
  Skull,
  Stethoscope,
  Wallet,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import { SYNC_API_BASE_URL } from "./config";
import { getSyncStatus, subscribeSyncStatus, syncNow, type SyncState } from "./sync/sync-manager";
import { DoesPage } from "./pages/does-page";
import { DashboardPage } from "./pages/dashboard-page";
import { MatingPage } from "./pages/mating-page";
import { PregnancyTestPage } from "./pages/pregnancy-test-page";
import { NestBoxPage } from "./pages/nest-box-page";
import { KindlingPage } from "./pages/kindling-page";
import { WeaningPage } from "./pages/weaning-page";
import { RabbitsPage } from "./pages/rabbits-page";
import { MothersPage } from "./pages/mothers-page";
import { BucksPage } from "./pages/bucks-page";
import { StockPage } from "./pages/stock-page";
import { FosteringPage } from "./pages/fostering-page";
import { WeaningSalesPage } from "./pages/weaning-sales-page";
import { MortalityPage } from "./pages/mortality-page";
import { HealthPage } from "./pages/health-page";
import { FinancePage } from "./pages/finance-page";
import { SettingsPage } from "./pages/settings-page";

const ROUTES: Record<string, { path: string; labelKey: keyof Dictionary["nav"]; icon: any }> = {
  "#/": { path: "#/", labelKey: "dashboard", icon: LayoutDashboard },
  "#/stock": { path: "#/stock", labelKey: "stock", icon: Sprout },
  "#/mothers": { path: "#/mothers", labelKey: "mothers", icon: Venus },
  "#/bucks": { path: "#/bucks", labelKey: "bucks", icon: Mars },
  "#/mating": { path: "#/mating", labelKey: "mating", icon: HeartHandshake },
  "#/pregnancy-test": { path: "#/pregnancy-test", labelKey: "pregnancyTest", icon: Microscope },
  "#/nest-box": { path: "#/nest-box", labelKey: "nestBox", icon: Box },
  "#/kindling": { path: "#/kindling", labelKey: "kindling", icon: HeartPulse },
  "#/fostering": { path: "#/fostering", labelKey: "fostering", icon: ArrowLeftRight },
  "#/weaning": { path: "#/weaning", labelKey: "weaning", icon: Milk },
  "#/weaning-sales": { path: "#/weaning-sales", labelKey: "weaningSales", icon: ShoppingCart },
  "#/does": { path: "#/does", labelKey: "does", icon: ClipboardList },
  "#/mortality": { path: "#/mortality", labelKey: "mortality", icon: Skull },
  "#/health": { path: "#/health", labelKey: "health", icon: Stethoscope },
  "#/finance": { path: "#/finance", labelKey: "finance", icon: Wallet },
  "#/settings": { path: "#/settings", labelKey: "settings", icon: Settings },
};
const DEFAULT_ROUTE = "#/";

function useHashRoute(): string {
  const [hash, setHash] = useState(() => (ROUTES[window.location.hash] ? window.location.hash : DEFAULT_ROUTE));
  useEffect(() => {
    const onHashChange = () => setHash(ROUTES[window.location.hash] ? window.location.hash : DEFAULT_ROUTE);
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = DEFAULT_ROUTE;
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return hash;
}

function syncStatusLabel(state: SyncState, locale: Locale): string {
  if (state.status === "offline") return locale === "ar" ? "غير متصل" : "Offline";
  if (state.status === "syncing") return locale === "ar" ? "جارِ المزامنة…" : "Syncing…";
  if (state.status === "error") return locale === "ar" ? "تعذّرت المزامنة" : "Sync failed";
  if (state.pendingCount > 0) {
    return locale === "ar" ? `${state.pendingCount} بانتظار الإرسال` : `${state.pendingCount} pending`;
  }
  return locale === "ar" ? "متزامن" : "Synced";
}

function SyncStatusBar({ locale }: { locale: Locale }) {
  const [state, setState] = useState<SyncState>(() => getSyncStatus());
  useEffect(() => subscribeSyncStatus(setState), []);

  const label = syncStatusLabel(state, locale);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs",
        state.status === "offline" && "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
        state.status === "error" && "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
        state.status === "syncing" && "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
        state.status === "idle" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      )}
    >
      <span className="flex items-center gap-1.5">
        {state.status === "offline" ? <WifiOff className="h-3.5 w-3.5" /> : null}
        {state.status === "syncing" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
        {label}
        {state.status === "error" && state.lastError ? ` — ${state.lastError}` : ""}
      </span>
      <button
        type="button"
        onClick={() => void syncNow()}
        disabled={state.status === "syncing"}
        className="rounded px-2 py-0.5 font-medium underline-offset-2 hover:underline disabled:opacity-50"
      >
        {locale === "ar" ? "مزامنة الآن" : "Sync now"}
      </button>
    </div>
  );
}

function OnlineOnlyPage({ title, pathSuffix, locale }: { title: string; pathSuffix: string; locale: Locale }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 border rounded-xl bg-card">
      <div className="rounded-full bg-amber-50 p-4 dark:bg-amber-950/20">
        <ExternalLink className="h-10 w-10 text-amber-600 dark:text-amber-500" />
      </div>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        {locale === "ar"
          ? "هذه الصفحة غير متوفرة دون اتصال بالإنترنت. يرجى فتح الموقع الكامل للوصول إلى كافة الميزات."
          : "This page is not available offline. Please open the full site to access all features."}
      </p>
      <button
        type="button"
        onClick={() => void Browser.open({ url: SYNC_API_BASE_URL + pathSuffix })}
        className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow hover:bg-primary/95"
      >
        <ExternalLink className="h-4 w-4" />
        {locale === "ar" ? "فتح الموقع الكامل" : "Open full site"}
      </button>
    </div>
  );
}

export function AppShell() {
  const locale: Locale = DEFAULT_LOCALE;
  const t = getClientDictionary(locale);
  const route = useHashRoute();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dbVersion, setDbVersion] = useState(0);

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  useEffect(() => {
    const handleUpdate = () => {
      setDbVersion((v) => v + 1);
    };
    window.addEventListener("local-db-updated", handleUpdate);
    return () => window.removeEventListener("local-db-updated", handleUpdate);
  }, []);

  // Navigation Items
  const navItems = Object.entries(ROUTES).map(([key, value]) => ({
    href: key,
    label: t.nav[value.labelKey],
    icon: value.icon,
    onlineOnly: [] as string[],
  }));

  const brandEl = (
    <div className="flex items-center gap-2.5 px-1 py-1">
      <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
        <RabbitIcon className="size-5" />
      </span>
      <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
        RabbitTrack
      </span>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" dir={dir}>
      <SyncStatusBar locale={locale} />

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Desktop Sidebar (md+) */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-sidebar border-e border-sidebar-border px-3 py-4 text-sidebar-foreground md:flex">
          <div className="mb-6">{brandEl}</div>
          <nav className="flex flex-col gap-0.5 flex-1">
            {navItems.map((item) => {
              const active = route === item.href;
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
          <div className="mt-auto pt-4 border-t border-sidebar-border/40 text-center">
            <button
              type="button"
              onClick={() => void Browser.open({ url: SYNC_API_BASE_URL })}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-sidebar-border/60 bg-sidebar-accent/30 px-3 py-2 text-xs font-semibold hover:bg-sidebar-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {locale === "ar" ? "الموقع الكامل" : "Full site"}
            </button>
          </div>
        </aside>

        {/* Mobile Top Bar */}
        <header className="flex h-14 items-center justify-between border-b bg-sidebar px-4 text-sidebar-foreground md:hidden">
          {brandEl}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-1.5 hover:bg-sidebar-accent"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-14 z-50 flex flex-col bg-sidebar text-sidebar-foreground md:hidden border-b shadow-xl">
            <nav className="flex flex-col gap-1 overflow-y-auto px-4 py-4 flex-1">
              {navItems.map((item) => {
                const active = route === item.href;
                const Icon = item.icon;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>
            <div className="p-4 border-t border-sidebar-border">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void Browser.open({ url: SYNC_API_BASE_URL });
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-sidebar-accent"
              >
                <ExternalLink className="h-4 w-4" />
                {locale === "ar" ? "فتح الموقع الكامل" : "Open full site"}
              </button>
            </div>
          </div>
        )}

        {/* Page Content Panel */}
        <main key={dbVersion} className="flex-1 overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full">
          {route === "#/" && <DashboardPage locale={locale} />}
          {route === "#/does" && <DoesPage locale={locale} />}
          {route === "#/mating" && <MatingPage locale={locale} />}
          {route === "#/pregnancy-test" && <PregnancyTestPage locale={locale} />}
          {route === "#/nest-box" && <NestBoxPage locale={locale} />}
          {route === "#/kindling" && <KindlingPage locale={locale} />}
          {route === "#/weaning" && <WeaningPage locale={locale} />}

          {/* Roster lists */}
          {route === "#/stock" && <StockPage locale={locale} />}
          {route === "#/mothers" && <MothersPage locale={locale} />}
          {route === "#/bucks" && <BucksPage locale={locale} />}

          {/* Fostering and Weaning Sales offline pages */}
          {route === "#/fostering" && <FosteringPage locale={locale} />}
          {route === "#/weaning-sales" && <WeaningSalesPage locale={locale} />}

          {/* Offline modules */}
          {route === "#/mortality" && <MortalityPage locale={locale} />}
          {route === "#/health" && <HealthPage locale={locale} />}
          {route === "#/finance" && <FinancePage locale={locale} />}
          {route === "#/settings" && <SettingsPage locale={locale} />}
        </main>
      </div>
    </div>
  );
}
