import {
  LayoutDashboard,
  ClipboardList,
  Sprout,
  Stethoscope,
  Wallet,
  Settings,
  Venus,
  Mars,
  HeartHandshake,
  Microscope,
  Box,
  HeartPulse,
  Milk,
  Skull,
  ArrowLeftRight,
  ShoppingCart,
  FileText,
  ListChecks,
  CalendarDays,
  TrendingUp,
  History,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "./i18n/dictionaries/ar";
import { cn } from "./utils";

export type NavItem = {
  href: string;
  labelKey: keyof Dictionary["nav"];
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/herd-and-stock", labelKey: "herdAndStock", icon: Sprout },
  { href: "/daily-rounds", labelKey: "dailyRounds", icon: ListChecks },
  { href: "/operations", labelKey: "operations", icon: HeartHandshake },
  { href: "/support-operations", labelKey: "supportOps", icon: Box },
  { href: "/does", labelKey: "does", icon: ClipboardList },
  { href: "/health", labelKey: "health", icon: Stethoscope },
  // اليومية sits below الصحة so the three review pages run together — see
  // isReviewNavItem below, which gives them their own tone.
  { href: "/daily", labelKey: "daily", icon: CalendarDays },
  { href: "/reports", labelKey: "reports", icon: FileText },
  { href: "/records", labelKey: "records", icon: History },
  { href: "/weaning-sales", labelKey: "weaningSales", icon: ShoppingCart },
  { href: "/finance", labelKey: "finance", icon: Wallet },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

/**
 * اليومية، التقارير، السجلات — the three pages you *read* rather than act on.
 * Everything else in the nav changes the farm's state; these three only look
 * back at it, so they carry their own tone instead of sitting in the same
 * amber list as the boards that record a mating or a weaning.
 *
 * Kept as hrefs, not a flag on NavItem, because the offline shell builds its
 * own route table (src/mobile/app-shell.tsx) off the same paths — one set here
 * means the two shells can't disagree about which rows are which.
 */
const REVIEW_HREFS = new Set(["/daily", "/reports", "/records"]);

/** Tolerates the offline shell's "#/daily" as well as the web's "/daily". */
export function isReviewNavItem(href: string): boolean {
  return REVIEW_HREFS.has(href.replace(/^#/, ""));
}

/**
 * The one row that changes how the app itself behaves rather than what the farm
 * records. Red is a caution colour, not an error one here — it marks the row you
 * don't want to hit by accident on a phone.
 */
const SETTINGS_HREF = "/settings";

/**
 * The three tones a nav row can carry, each in its active and resting form.
 * A lookup table rather than nested ternaries: three tones × two states is
 * where the conditional version stopped being readable.
 *
 * All three use fixed palette colours with no `dark:` variant, which is safe
 * unconditionally: the sidebar is dark in BOTH themes (`--sidebar` sits at
 * 0.26/0.20 lightness in globals.css), so these rows never have to survive a
 * light background.
 */
const NAV_TONES = {
  /** Boards that record something — the sidebar's own amber. */
  default: {
    active: "border-transparent bg-sidebar-primary text-sidebar-primary-foreground shadow-md",
    rest: "border-transparent text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    icon: "",
    marker: "bg-sidebar-primary-foreground/70",
  },
  /**
   * اليومية، التقارير، السجلات — outlined where the others are filled, so the
   * distinction survives both states: an active review page reads sky and
   * ringed, an active board solid amber.
   */
  review: {
    active: "border-sky-400/45 bg-sky-400/15 text-sky-50 shadow-md",
    rest: "border-dashed border-sidebar-border/70 bg-sidebar-accent/25 text-sky-200/85 hover:border-sky-400/40 hover:bg-sidebar-accent/60 hover:text-sky-100",
    icon: "text-sky-300/80",
    marker: "bg-sky-300/80",
  },
  settings: {
    active: "border-red-400/45 bg-red-500/25 text-red-50 shadow-md",
    rest: "border-transparent text-red-300/85 hover:bg-red-500/10 hover:text-red-200",
    icon: "text-red-300/80",
    marker: "bg-red-300/80",
  },
} as const;

function toneFor(href: string): keyof typeof NAV_TONES {
  const path = href.replace(/^#/, "");
  if (REVIEW_HREFS.has(path)) return "review";
  if (path === SETTINGS_HREF) return "settings";
  return "default";
}

/**
 * State classes for one sidebar row, shared by the web sidebar, the offline
 * sidebar and the offline drawer — three call sites that would otherwise drift.
 * Layout classes (padding, gap, radius) stay with each shell; only the tone
 * lives here. `border-transparent` on the untinted rows keeps every row the
 * same height.
 */
export function navRowStyles(href: string, active: boolean) {
  const tone = NAV_TONES[toneFor(href)];
  return {
    row: cn("border", active ? cn(tone.active, "font-semibold") : tone.rest),
    icon: cn(
      "size-4 shrink-0 transition-transform duration-200",
      !active && "group-hover:scale-110",
      !active && tone.icon
    ),
    /** The inline-start edge marker, rendered only while active. */
    marker: cn("absolute inset-y-1.5 start-0 w-1 rounded-full", tone.marker),
  };
}
