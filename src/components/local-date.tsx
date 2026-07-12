"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";

type Props = {
  /** ISO string or Date; rendered in the viewer's local timezone. */
  date: string | Date | null | undefined;
  /** Intl options; defaults to medium date. */
  options?: Intl.DateTimeFormatOptions;
  /** Fallback text when date is null/undefined. */
  fallback?: string;
  className?: string;
  locale?: Locale;
};

const DEFAULT_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

/**
 * Renders a UTC-stored date in the viewer's local timezone without hydration
 * mismatch: the server renders a stable ISO date, then the client swaps in the
 * localized string after mount.
 */
export function LocalDate({ date, options, fallback = "—", className, locale = "ar" }: Props) {
  const iso = date ? new Date(date).toISOString() : null;
  const [text, setText] = useState<string>(iso ? iso.slice(0, 10) : fallback);

  useEffect(() => {
    if (!iso) {
      setText(fallback);
      return;
    }
    setText(
      new Date(iso).toLocaleDateString(locale, options ?? DEFAULT_OPTS)
    );
  }, [iso, options, fallback, locale]);

  return (
    <time dateTime={iso ?? undefined} className={className}>
      {text}
    </time>
  );
}
