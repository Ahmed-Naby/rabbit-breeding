"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type LogTab = {
  key: string;
  label: string;
  /** Row count, shown on the tab so a log can be judged without opening it. */
  count?: number;
  node: ReactNode;
};

/**
 * A strip of tabs over sibling log tables, styled like the page-level strips on
 * /operations and /records.
 *
 * The panels are server-rendered and handed over as `node`s, so switching tabs
 * is local state with nothing to fetch — and, unlike the page-level strips, no
 * ?tab= of its own, which would collide with theirs.
 */
export function LogTabs({ tabs }: { tabs: LogTab[] }) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];
  if (!active) return null;

  return (
    <div className="space-y-6">
      <div className="flex border border-border/80 bg-muted/30 p-1.5 rounded-xl gap-1.5 overflow-x-auto shadow-xs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveKey(tab.key)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer",
              tab.key === active.key
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40",
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                  tab.key === active.key
                    ? "bg-primary/10 text-primary"
                    : "bg-muted-foreground/10",
                )}
              >
                {tab.count.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>
      {active.node}
    </div>
  );
}
