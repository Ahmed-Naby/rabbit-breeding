"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Rabbit as RabbitIcon } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { LocaleToggle } from "@/components/locale-toggle";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

type NavT = Dictionary["nav"];

function NavLinks({ t, onNavigate }: { t: NavT; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {t[item.labelKey]}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1 py-1">
      <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
        <RabbitIcon className="size-5" />
      </span>
      <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
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
        <Brand />
      </div>
      <NavLinks t={t} />
      <div className="mt-auto space-y-2">
        <LocaleToggle
          locale={locale}
          label={t.toggleLabel}
          className="w-full rounded-lg border border-sidebar-border/60 px-3 py-1.5 text-xs font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        />
        <div className="overflow-hidden rounded-xl border border-sidebar-border/60">
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
      <div className="flex h-14 items-center justify-between gap-2 bg-sidebar px-4 text-sidebar-foreground">
        <Brand />
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
      {open ? (
        <div className="bg-sidebar px-3 py-3 text-sidebar-foreground">
          <NavLinks t={t} onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
