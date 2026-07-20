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
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "./i18n/dictionaries/ar";

export type NavItem = {
  href: string;
  labelKey: keyof Dictionary["nav"];
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/herd-and-stock", labelKey: "herdAndStock", icon: Sprout },
  { href: "/daily", labelKey: "daily", icon: CalendarDays },
  { href: "/daily-rounds", labelKey: "dailyRounds", icon: ListChecks },
  { href: "/operations", labelKey: "operations", icon: HeartHandshake },
  { href: "/support-operations", labelKey: "supportOps", icon: Box },
  { href: "/does", labelKey: "does", icon: ClipboardList },
  { href: "/health", labelKey: "health", icon: Stethoscope },
  { href: "/reports", labelKey: "reports", icon: FileText },
  { href: "/weaning-sales", labelKey: "weaningSales", icon: ShoppingCart },
  { href: "/finance", labelKey: "finance", icon: Wallet },
  { href: "/settings", labelKey: "settings", icon: Settings },
];
