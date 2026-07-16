import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "emerald" | "sky" | "violet" | "fuchsia" | "amber" | "rose";

const TONE_STYLES: Record<Tone, { card: string; icon: string; glow: string }> = {
  emerald: {
    card: "border-emerald-300/50 bg-gradient-to-br from-emerald-50 via-white to-white dark:border-emerald-800/40 dark:from-emerald-950/50 dark:via-card dark:to-card",
    icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    glow: "bg-emerald-400/20",
  },
  sky: {
    card: "border-sky-300/50 bg-gradient-to-br from-sky-50 via-white to-white dark:border-sky-800/40 dark:from-sky-950/50 dark:via-card dark:to-card",
    icon: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    glow: "bg-sky-400/20",
  },
  violet: {
    card: "border-violet-300/50 bg-gradient-to-br from-violet-50 via-white to-white dark:border-violet-800/40 dark:from-violet-950/50 dark:via-card dark:to-card",
    icon: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    glow: "bg-violet-400/20",
  },
  fuchsia: {
    card: "border-fuchsia-300/50 bg-gradient-to-br from-fuchsia-50 via-white to-white dark:border-fuchsia-800/40 dark:from-fuchsia-950/50 dark:via-card dark:to-card",
    icon: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
    glow: "bg-fuchsia-400/20",
  },
  amber: {
    card: "border-amber-300/50 bg-gradient-to-br from-amber-50 via-white to-white dark:border-amber-800/40 dark:from-amber-950/50 dark:via-card dark:to-card",
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    glow: "bg-amber-400/20",
  },
  rose: {
    card: "border-rose-300/50 bg-gradient-to-br from-rose-50 via-white to-white dark:border-rose-800/40 dark:from-rose-950/50 dark:via-card dark:to-card",
    icon: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    glow: "bg-rose-400/20",
  },
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "sky",
  compact = false,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  tone?: Tone;
  compact?: boolean;
  className?: string;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        compact ? "p-3" : "p-4",
        styles.card,
        className
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 size-20 rounded-full blur-2xl transition-opacity duration-200 group-hover:opacity-80",
          styles.glow
        )}
      />
      <div className="relative flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
            compact ? "size-8" : "size-10",
            styles.icon
          )}
        >
          <Icon className={compact ? "size-4" : "size-5"} />
        </span>
      </div>
      <p
        className={cn(
          "relative font-bold tabular-nums leading-none",
          compact ? "mt-2 text-lg" : "mt-3 text-2xl"
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          "relative font-medium text-muted-foreground",
          compact ? "mt-1 text-[11px] leading-tight" : "mt-1.5 text-xs"
        )}
      >
        {label}
      </p>
    </div>
  );
}
