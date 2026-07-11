"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Routes that need the wide, un-capped layout (e.g. does: a dense many-column
// table). Every other route keeps the standard centered max-w-6xl content box.
const WIDE_ROUTES = ["/does"];

export function PageWidth({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWide = WIDE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  return (
    <div
      className={cn(
        "w-full px-4 py-6 sm:px-6 lg:px-8",
        isWide ? "" : "mx-auto max-w-6xl"
      )}
    >
      {children}
    </div>
  );
}
