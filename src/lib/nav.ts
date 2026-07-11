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
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/stock", label: "السلالات", icon: Sprout },
  { href: "/mothers", label: "الأمهات", icon: Venus },
  { href: "/bucks", label: "الذكور", icon: Mars },
  { href: "/mating", label: "عمليات التلقيح", icon: HeartHandshake },
  { href: "/pregnancy-test", label: "عمليات الجس", icon: Microscope },
  { href: "/nest-box", label: "تركيب بيوت الولادة", icon: Box },
  { href: "/kindling", label: "عمليات الولادة", icon: HeartPulse },
  { href: "/weaning", label: "عمليات الفطام", icon: Milk },
  { href: "/does", label: "عمليات المزرعة", icon: ClipboardList },
  { href: "/mortality", label: "حصر النافق", icon: Skull },
  { href: "/health", label: "الصحة", icon: Stethoscope },
  { href: "/finance", label: "المالية", icon: Wallet },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];
