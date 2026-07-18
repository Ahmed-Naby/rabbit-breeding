import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

/**
 * The routes an owner can grant/deny per supervisor (see the account card's
 * page picker and the app shell's nav filtering). Settings is deliberately
 * absent — it's always visible, since it holds the member's own account
 * (sign out, farm switcher). Kept separate from app-shell's ROUTES to avoid
 * an import cycle (app-shell → settings-page → account-card).
 */
export const SELECTABLE_PAGES: { hash: string; labelKey: keyof Dictionary["nav"] }[] = [
  { hash: "#/", labelKey: "dashboard" },
  { hash: "#/daily", labelKey: "daily" },
  { hash: "#/rounds", labelKey: "rounds" },
  { hash: "#/bucks-rounds", labelKey: "bucksRounds" },
  { hash: "#/stock", labelKey: "stock" },
  { hash: "#/mothers", labelKey: "mothers" },
  { hash: "#/bucks", labelKey: "bucks" },
  { hash: "#/mating", labelKey: "mating" },
  { hash: "#/pregnancy-test", labelKey: "pregnancyTest" },
  { hash: "#/nest-box", labelKey: "nestBox" },
  { hash: "#/kindling", labelKey: "kindling" },
  { hash: "#/fostering", labelKey: "fostering" },
  { hash: "#/weaning", labelKey: "weaning" },
  { hash: "#/mortality", labelKey: "mortality" },
  { hash: "#/does", labelKey: "does" },
  { hash: "#/health", labelKey: "health" },
  { hash: "#/reports", labelKey: "reports" },
  { hash: "#/weaning-sales", labelKey: "weaningSales" },
  { hash: "#/finance", labelKey: "finance" },
];

export const ALWAYS_ALLOWED_PAGE = "#/settings";
