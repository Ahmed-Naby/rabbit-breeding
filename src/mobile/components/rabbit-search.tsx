import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { searchRabbits, type LocalRabbitSearchResult } from "../db/queries";

/** Header search box (offline, hits the local SQLite mirror): jump straight to a rabbit's detail page. */
export function RabbitSearch({
  locale,
  className,
  onNavigate,
}: {
  locale: Locale;
  className?: string;
  onNavigate?: () => void;
}) {
  const t = getClientDictionary(locale).nav;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocalRabbitSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      void (async () => {
        const db = await getDb();
        const found = await searchRabbits(db, q);
        if (cancelled) return;
        setResults(found);
        setActiveIndex(0);
        setOpen(true);
        setLoading(false);
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(ev: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goTo(id: string) {
    setOpen(false);
    setQuery("");
    setResults([]);
    window.location.hash = `#/rabbits/${id}`;
    onNavigate?.();
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/50" />
        <input
          type="text"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowDown") {
              ev.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (ev.key === "ArrowUp") {
              ev.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (ev.key === "Enter") {
              if (results[activeIndex]) goTo(results[activeIndex].id);
            } else if (ev.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchAriaLabel}
          className="h-8 w-full rounded-lg border border-sidebar-border/60 bg-sidebar-accent/20 ps-8 pe-2.5 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/50 focus-visible:border-sidebar-primary"
        />
      </div>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
          {loading ? (
            <div className="flex items-center justify-center px-3 py-2">
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t.searchNoResults}</p>
          ) : (
            <ul>
              {results.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => goTo(r.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-xs",
                      i === activeIndex ? "bg-muted" : "hover:bg-muted/60"
                    )}
                  >
                    <span className="font-medium">{r.tagId ?? "—"}</span>
                    <span className="text-muted-foreground">
                      {[r.breed, r.cage].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
