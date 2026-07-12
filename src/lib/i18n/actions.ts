"use server";

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./locales";

/** Setting a cookie here re-renders the current page + layouts server-side. */
export async function setLocale(formData: FormData) {
  const value = formData.get("locale");
  const locale = typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
