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
import { ExternalLink, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { SYNC_API_BASE_URL } from "./config";
import { getSyncStatus, subscribeSyncStatus, syncNow, type SyncState } from "./sync/sync-manager";
import { DoesPage } from "./pages/does-page";

const ROUTES: Record<string, { path: string; labelKey: "does" }> = {
  "#/does": { path: "#/does", labelKey: "does" },
};
const DEFAULT_ROUTE = "#/does";

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

export function AppShell() {
  const locale: Locale = DEFAULT_LOCALE;
  const t = getClientDictionary(locale);
  const route = useHashRoute();
  const dir = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" dir={dir}>
      <SyncStatusBar locale={locale} />
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">{t.does.title}</h1>
        <button
          type="button"
          onClick={() => void Browser.open({ url: SYNC_API_BASE_URL })}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {locale === "ar" ? "فتح الموقع الكامل" : "Open full site"}
        </button>
      </header>
      <main className="flex-1 overflow-y-auto p-3">
        {route === "#/does" ? <DoesPage locale={locale} /> : null}
      </main>
    </div>
  );
}
