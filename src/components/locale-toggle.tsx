"use client";

import { setLocale } from "@/lib/i18n/actions";
import type { Locale } from "@/lib/i18n/locales";

/** Button shows the *other* language's own name (e.g. "English" while in Arabic). */
export function LocaleToggle({
  locale,
  label,
  className,
}: {
  locale: Locale;
  label: string;
  className?: string;
}) {
  const next: Locale = locale === "ar" ? "en" : "ar";
  return (
    <form action={setLocale}>
      <input type="hidden" name="locale" value={next} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
