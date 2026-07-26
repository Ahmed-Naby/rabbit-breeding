import { cn } from "@/lib/utils";

/**
 * Line art for empty states — an empty nest box.
 *
 * Everything is drawn in `currentColor` at graded opacities, so a caller sets
 * one text colour and the whole scene tints with it (and with the theme).
 * Stroke-only and unfilled on purpose: a solid illustration at this size
 * competes with the real content sitting under it.
 */
export function EmptyNestArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      role="img"
      aria-hidden
      className={cn("h-28 w-40 text-muted-foreground", className)}
    >
      {/* Ground shadow */}
      <ellipse cx="80" cy="103" rx="46" ry="6" fill="currentColor" opacity="0.1" />

      {/* Nest bowl */}
      <path
        d="M34 66c0 20 20 34 46 34s46-14 46-34"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M30 66h100"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* Straw */}
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3">
        <path d="M44 66c6-6 14-9 22-9" />
        <path d="M62 66c8-5 18-6 26-3" />
        <path d="M92 66c6-6 14-8 22-7" />
        <path d="M50 78c10 4 22 5 32 3" />
        <path d="M84 84c8-1 16-4 22-9" />
      </g>

      {/* Two sprigs rising out of it */}
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45">
        <path d="M56 66c-2-10 2-18 9-23" />
        <path d="M104 66c3-9 1-17-5-22" />
      </g>

      {/* Drifting motes, so the frame doesn't read as clipped */}
      <g fill="currentColor" opacity="0.25">
        <circle cx="34" cy="34" r="3" />
        <circle cx="126" cy="26" r="2.5" />
        <circle cx="118" cy="48" r="1.8" />
        <circle cx="44" cy="18" r="1.8" />
      </g>
    </svg>
  );
}
