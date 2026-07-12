import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { label } from "@/lib/enums";
import type { Locale } from "@/lib/i18n/locales";

// Color mapping for the various enum-like values. Uses Tailwind color utilities
// directly (works in both light/dark) rather than relying only on badge variants.
const COLORS: Record<string, string> = {
  // rabbit status
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  sold: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  culled: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  deceased: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  reference: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  // breeding outcome
  pending: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  successful: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  not_pregnant: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  // sex
  buck: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  doe: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  unknown: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  // finance
  income: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  expense: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  // rabbit origin
  external: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  farm: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
};

export function StatusBadge({
  value,
  className,
  locale = "ar",
}: {
  value: string;
  className?: string;
  locale?: Locale;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-transparent font-medium", COLORS[value], className)}
    >
      {label(value, locale)}
    </Badge>
  );
}
