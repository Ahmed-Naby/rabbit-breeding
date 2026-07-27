"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS, navRowStyles } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { LocaleToggle } from "@/components/locale-toggle";
import { RabbitSearch } from "@/components/rabbit-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

type NavT = Dictionary["nav"];

function NavLinks({ t, onNavigate }: { t: NavT; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        const styles = navRowStyles(item.href, active);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              // No scale on the row itself: `translate-x-1` on the active item
              // shifted it left even in RTL, and scaling text at this size
              // makes it shimmer as the browser re-hints the glyphs.
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200",
              styles.row
            )}
          >
            {/* Marker on the inline-start edge, so the active row is findable
                at a glance down a long list. */}
            {active ? <span className={styles.marker} /> : null}
            <Icon className={styles.icon} />
            {t[item.labelKey]}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ id }: { id: string }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5 px-1 py-1">
      <BrandMark
        id={id}
        className="size-9 shadow-sm transition-transform duration-300 group-hover:scale-105"
      />
      <span className="text-base font-bold tracking-tight text-sidebar-foreground">
        RabbitTrack
      </span>
    </Link>
  );
}

/** Desktop sidebar (md+). */
export function Sidebar({ locale, t }: { locale: Locale; t: NavT }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-sidebar px-3 py-4 text-sidebar-foreground md:flex">
      <div className="mb-6">
        <Brand id="sidebar" />
      </div>
      <RabbitSearch t={t} className="mb-4" />
      <NavLinks t={t} />
      <div className="mt-auto space-y-2.5">
        <ThemeToggle className="w-full" />
        <LocaleToggle
          locale={locale}
          label={t.toggleLabel}
          className="w-full rounded-lg border border-sidebar-border/60 bg-sidebar-accent/10 px-3 py-1.5 text-xs font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        />
        <div className="overflow-hidden rounded-xl border border-sidebar-border/60 shadow-xs hover:border-sidebar-border/80 transition-all duration-300">
          <div className="relative h-24 w-full">
            <Image
              src="/images/nest-box.jpg"
              alt=""
              fill
              sizes="240px"
              className="object-cover opacity-90"
            />
          </div>
          <div className="bg-sidebar-accent/60 px-3 py-2 text-xs text-sidebar-foreground/70">
            {t.tagline}
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Mobile top bar with a collapsible menu (below md). */
export function MobileNav({ locale, t }: { locale: Locale; t: NavT }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-sidebar-border/60 bg-sidebar/95 px-4 text-sidebar-foreground shadow-sm backdrop-blur-md">
        <Brand id="topbar" />
        <div className="flex items-center gap-2">
          <LocaleToggle
            locale={locale}
            label={t.toggleLabel}
            className="rounded-lg border border-sidebar-border/60 px-2.5 py-1.5 text-xs font-medium hover:bg-sidebar-accent"
          />
          <button
            type="button"
            aria-label={open ? t.closeMenu : t.openMenu}
            onClick={() => setOpen((o) => !o)}
            className="flex size-9 items-center justify-center rounded-lg border border-sidebar-border/60 hover:bg-sidebar-accent"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {/* A side drawer rather than a full-width panel pushed under the bar: it
          opens from the same edge as the hamburger (`end` — the left in RTL)
          over a backdrop that dismisses it, matching the offline app's shell. */}
      {open ? (
        <>
          <div
            className="animate-fade-in fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="animate-drawer-in fixed inset-y-0 end-0 z-50 flex w-72 max-w-[80vw] flex-col overflow-y-auto border-s border-sidebar-border bg-sidebar px-3 py-3 text-sidebar-foreground shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <Brand id="drawer" />
              <button
                type="button"
                aria-label={t.closeMenu}
                onClick={() => setOpen(false)}
                className="flex size-9 items-center justify-center rounded-lg border border-sidebar-border/60 hover:bg-sidebar-accent"
              >
                <X className="size-5" />
              </button>
            </div>
            <RabbitSearch t={t} className="mb-3" />
            <NavLinks t={t} onNavigate={() => setOpen(false)} />
            <div className="mt-4 pt-3 border-t border-sidebar-border/50">
              <ThemeToggle className="w-full" />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
