// Renders an <a onClick={…}> and reads window.location.hash, so it must be a
// Client Component — without this it's treated as a Server Component when a
// server page (mothers, bucks) imports it, and React throws "Event handlers
// cannot be passed to Client Component props", 500-ing the whole page.
"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface RabbitTagBadgeProps {
  tagId: string | null | undefined;
  rabbitId?: string;
  onClick?: () => void;
  sex?: "doe" | "buck" | string;
  className?: string;
}

export function RabbitTagBadge({
  tagId,
  rabbitId,
  onClick,
  sex,
  className,
}: RabbitTagBadgeProps) {
  if (!tagId) {
    return <span className="text-muted-foreground">—</span>;
  }

  // Neither prop means there's nowhere to navigate — the أمهات and ذكور
  // boards, where the تعديل column is the way in now. A pill that leads
  // nowhere is just noise, so those render the bare number and only the
  // linked tables (the fertility reports) still get the badge treatment.
  const isLink = Boolean(onClick || rabbitId);
  if (!isLink) {
    return <span className={cn("font-medium", className)}>{tagId}</span>;
  }

  // Everything from here down is the linked form, so the hover inversion and
  // the press animation are unconditional.
  const colorStyles =
    sex === "doe"
      ? "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30 hover:bg-pink-500 hover:text-white dark:hover:text-stone-950"
      : sex === "buck"
      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500 hover:text-white dark:hover:text-stone-950"
      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500 hover:text-stone-950 dark:hover:text-stone-950";

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
      return;
    }
    if (rabbitId && typeof window !== "undefined") {
      if (window.location.hash.startsWith("#/")) {
        e.preventDefault();
        window.location.hash = `#/rabbits/${rabbitId}`;
      }
    }
  };

  return (
    <a
      href={rabbitId ? `/rabbits/${rabbitId}` : "#"}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center min-w-9 px-2.5 py-0.5 rounded-lg text-xs font-bold border transition-all duration-150 shadow-2xs select-none cursor-pointer active:scale-95",
        colorStyles,
        className
      )}
    >
      {tagId}
    </a>
  );
}
