"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/** Rows per page for every paginated log. */
export const LOG_PAGE_SIZE = 50;

/** How many pages `total` rows fill — always at least one, so «1 من 1» never reads «1 من 0». */
export function pageCountOf(total: number, pageSize = LOG_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Page controls under a log table.
 *
 * Renders nothing for a single page, so short logs look exactly as they did
 * before — the pager only appears once a log outgrows one screenful.
 *
 * The chevrons point at the *reading* direction: in RTL «التالي» goes left, and
 * the `rtl:rotate-180` flip is what makes one pair of icons serve both locales.
 */
export function TablePager({
  page,
  total,
  pageSize = LOG_PAGE_SIZE,
  onPageChange,
  locale,
  className,
}: {
  /** Zero-based. */
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  locale: Locale;
  className?: string;
}) {
  const pageCount = pageCountOf(total, pageSize);
  if (pageCount <= 1) return null;

  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const ar = locale === "ar";

  const buttonClass =
    "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm",
        className
      )}
    >
      <span className="text-xs text-muted-foreground tabular-nums">
        {ar
          ? `${from.toLocaleString()}–${to.toLocaleString()} من ${total.toLocaleString()}`
          : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={buttonClass}
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronRight className="size-4 rtl:rotate-0 ltr:rotate-180" />
          {ar ? "السابق" : "Previous"}
        </button>
        <span className="px-1.5 text-xs font-semibold tabular-nums">
          {(page + 1).toLocaleString()} / {pageCount.toLocaleString()}
        </span>
        <button
          type="button"
          className={buttonClass}
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          {ar ? "التالي" : "Next"}
          <ChevronLeft className="size-4 rtl:rotate-0 ltr:rotate-180" />
        </button>
      </div>
    </div>
  );
}

/**
 * The same paging for the logs that are lists of rows rather than tables
 * (المالية, التبني). Like `SortableTable`, the rows arrive already rendered by
 * the Server Component — this only decides which slice of them to mount.
 */
export function PagedList({
  items,
  locale,
  pageSize = LOG_PAGE_SIZE,
  className,
}: {
  items: { key: string; node: React.ReactNode }[];
  locale: Locale;
  pageSize?: number;
  className?: string;
}) {
  const [page, setPage] = React.useState(0);
  // Back to page 1 when the rows themselves change (the finance range filter),
  // adjusted during render so the stale page is never painted.
  const [rendered, setRendered] = React.useState(items);
  if (rendered !== items) {
    setRendered(items);
    setPage(0);
  }

  const safePage = Math.min(page, pageCountOf(items.length, pageSize) - 1);
  const visible = items.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <>
      <div className={className}>{visible.map((i) => i.node)}</div>
      <TablePager
        page={safePage}
        total={items.length}
        pageSize={pageSize}
        onPageChange={setPage}
        locale={locale}
      />
    </>
  );
}
