import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

/**
 * The routes an owner can grant/deny per supervisor (see the account card's
 * page picker and the app shell's nav filtering). Settings is included too —
 * an owner can hide it; the app shell then exposes a standalone sign-out
 * button in the nav footer so a restricted member is never locked in. Kept
 * separate from app-shell's ROUTES to avoid an import cycle
 * (app-shell → settings-page → account-card).
 */
// Dashboard ("#/") is intentionally absent — it's the app's forced home
// page (see app-shell's DEFAULT_ROUTE handling), always visible to every
// member regardless of allowedPages, so it isn't offered as a toggle here.
export const SELECTABLE_PAGES: { hash: string; labelKey: keyof Dictionary["nav"] }[] = [
  { hash: "#/herd-and-stock", labelKey: "herdAndStock" },
  { hash: "#/daily", labelKey: "daily" },
  { hash: "#/daily-rounds", labelKey: "dailyRounds" },
  { hash: "#/operations", labelKey: "operations" },
  { hash: "#/support-operations", labelKey: "supportOps" },
  { hash: "#/does", labelKey: "does" },
  { hash: "#/health", labelKey: "health" },
  { hash: "#/reports", labelKey: "reports" },
  { hash: "#/weaning-sales", labelKey: "weaningSales" },
  { hash: "#/finance", labelKey: "finance" },
  { hash: "#/settings", labelKey: "settings" },
];

export const SETTINGS_PAGE = "#/settings";
