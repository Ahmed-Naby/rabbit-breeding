"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTheme, setTheme, type Theme, listenToSystemThemeChanges } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setLocalTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocalTheme(getTheme());
    setMounted(true);

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<Theme>;
      setLocalTheme(customEvent.detail);
    };

    window.addEventListener("theme-changed", handleThemeChange);
    const cleanupSystemListener = listenToSystemThemeChanges(() => {
      // Force re-render on system theme shift
      setLocalTheme(getTheme());
    });

    return () => {
      window.removeEventListener("theme-changed", handleThemeChange);
      cleanupSystemListener();
    };
  }, []);

  if (!mounted) {
    return (
      <div className={cn("flex h-8 w-24 items-center justify-between rounded-lg bg-muted/50 p-1 opacity-50", className)}>
        <div className="size-6 rounded-md bg-transparent" />
        <div className="size-6 rounded-md bg-transparent" />
        <div className="size-6 rounded-md bg-transparent" />
      </div>
    );
  }

  const options = [
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "system" as const, icon: Laptop, label: "System" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
  ];

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg bg-muted/60 p-1 border border-border/40 shadow-xs relative transition-all duration-300",
        className
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={cn(
              "relative z-10 flex size-7 items-center justify-center rounded-md transition-all duration-300",
              "hover:text-foreground/90 focus-visible:outline-hidden",
              active
                ? "bg-background text-foreground shadow-xs scale-105"
                : "text-muted-foreground hover:bg-muted/40"
            )}
            title={opt.label}
          >
            <Icon className="size-4 shrink-0 transition-transform duration-300 hover:rotate-12" />
          </button>
        );
      })}
    </div>
  );
}
