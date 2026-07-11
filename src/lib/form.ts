import type { ZodError } from "zod";

/** Shared shape returned by server actions to drive form error UI. */
export type FormState = {
  ok: boolean;
  message?: string;
  /** field name -> first error message */
  errors?: Record<string, string>;
};

export const EMPTY_FORM_STATE: FormState = { ok: false };

/** Collapse a ZodError into a flat { field: message } map (first error per field). */
export function zodErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Turn FormData into a plain object (last value wins for repeated keys). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") obj[key] = value;
  }
  return obj;
}
