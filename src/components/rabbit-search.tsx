"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { searchRabbits, type RabbitSearchResult } from "@/app/rabbits/search-actions";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

type NavT = Dictionary["nav"];

/** Header search box: jump straight to a rabbit's detail page by tag/cage/breed. */
export function RabbitSearch({ t, className }: { t: NavT; className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RabbitSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      return;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
        const found = await searchRabbits(q);
        setResults(found);
        setActiveIndex(0);
        setOpen(true);
      });
    }, 200);
    return () => clearTimeout(handle);
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
    router.push(`/rabbits/${id}`);
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
          {pending ? (
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
                    <span className="font-medium">{r.tagId ?? r.retiredTagId ?? "—"}</span>
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
