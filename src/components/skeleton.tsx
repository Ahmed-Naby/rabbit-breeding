import { cn } from "@/lib/utils";

/**
 * Shimmering placeholder block. The `.skeleton` class carries the animation
 * (globals.css), which is disabled under prefers-reduced-motion.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

/**
 * The stand-in every local page shows while its SQLite query runs.
 *
 * It replaces a bare «جارِ التحميل…» line: on a phone that line sat alone at
 * the top of an otherwise blank screen, so the page appeared to jump when the
 * real content arrived. Blocking out the shape it's about to fill keeps the
 * layout still, and reads as fast rather than as broken.
 *
 * `label` stays in the tree for screen readers — the boxes themselves are
 * aria-hidden.
 */
export function PageSkeleton({
  label,
  rows = 5,
  cards = 3,
}: {
  label?: string;
  rows?: number;
  cards?: number;
}) {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      {label ? <span className="sr-only">{label}</span> : null}

      {/* Title + description */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* Stat row */}
      {cards > 0 ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <Skeleton className="h-11 rounded-none opacity-70" />
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-4 w-24 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
