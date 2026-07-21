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

  const colorStyles =
    sex === "doe"
      ? "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30 hover:bg-pink-500 hover:text-white dark:hover:text-stone-950"
      : sex === "buck"
      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500 hover:text-white dark:hover:text-stone-950"
      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500 hover:text-stone-950 dark:hover:text-stone-950";

  const badgeClass = cn(
    "inline-flex items-center justify-center min-w-[2.25rem] px-2.5 py-0.5 rounded-lg text-xs font-bold border transition-all duration-150 shadow-2xs cursor-pointer select-none active:scale-95",
    colorStyles,
    className
  );

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

  if (onClick || rabbitId) {
    return (
      <a
        href={rabbitId ? `/rabbits/${rabbitId}` : "#"}
        onClick={handleClick}
        className={badgeClass}
      >
        {tagId}
      </a>
    );
  }

  return <span className={badgeClass}>{tagId}</span>;
}
