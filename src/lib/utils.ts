import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Natural sort for tagIds ("2" < "10", "5A" sorts near "5") — tagIds may mix digits and letters. */
export function compareTagId(a: string | null, b: string | null) {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
