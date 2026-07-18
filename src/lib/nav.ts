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
  { href: "/daily", labelKey: "daily", icon: CalendarDays },
  { href: "/rounds", labelKey: "rounds", icon: ListChecks },
  { href: "/bucks-rounds", labelKey: "bucksRounds", icon: ListChecks },
  { href: "/stock", labelKey: "stock", icon: Sprout },
  { href: "/mothers", labelKey: "mothers", icon: Venus },
  { href: "/bucks", labelKey: "bucks", icon: Mars },
  { href: "/mating", labelKey: "mating", icon: HeartHandshake },
  { href: "/pregnancy-test", labelKey: "pregnancyTest", icon: Microscope },
  { href: "/nest-box", labelKey: "nestBox", icon: Box },
  { href: "/kindling", labelKey: "kindling", icon: HeartPulse },
  { href: "/fostering", labelKey: "fostering", icon: ArrowLeftRight },
  { href: "/weaning", labelKey: "weaning", icon: Milk },
  { href: "/mortality", labelKey: "mortality", icon: Skull },
  { href: "/does", labelKey: "does", icon: ClipboardList },
  { href: "/health", labelKey: "health", icon: Stethoscope },
  { href: "/reports", labelKey: "reports", icon: FileText },
  { href: "/weaning-sales", labelKey: "weaningSales", icon: ShoppingCart },
  { href: "/finance", labelKey: "finance", icon: Wallet },
  { href: "/settings", labelKey: "settings", icon: Settings },
];
