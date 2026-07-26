import { cn } from "@/lib/utils";

/**
 * The app's logomark: a rabbit silhouette on a gradient tile.
 *
 * Drawn rather than imported so it renders identically in the Next bundle,
 * the Capacitor bundle and the Electron window with no asset request — and
 * so it stays sharp on a phone at 3x, which a raster logo would not. The
 * gradient reads from the theme tokens, so it re-tints itself in dark mode.
 *
 * `id` has to be unique per instance: two of these on one page (sidebar +
 * drawer) would otherwise share one <linearGradient> id and the second would
 * silently reference the first.
 */
export function BrandMark({
  className,
  id = "brand",
}: {
  className?: string;
  id?: string;
}) {
  const gradientId = `${id}-grad`;
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-hidden
      className={cn("size-9 shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--sidebar-primary)" />
          <stop offset="100%" stopColor="var(--primary)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <g fill="var(--sidebar-primary-foreground)">
        {/* Ears, splayed slightly outward. */}
        <ellipse cx="12.2" cy="11" rx="2.5" ry="5.8" transform="rotate(-16 12.2 11)" />
        <ellipse cx="19.8" cy="11" rx="2.5" ry="5.8" transform="rotate(16 19.8 11)" />
        <circle cx="16" cy="21" r="6.3" />
      </g>
      {/* Eyes and nose punched back out in the tile colour. */}
      <g fill={`url(#${gradientId})`} opacity="0.85">
        <circle cx="13.7" cy="20.2" r="1" />
        <circle cx="18.3" cy="20.2" r="1" />
        <circle cx="16" cy="22.8" r="0.85" />
      </g>
    </svg>
  );
}
