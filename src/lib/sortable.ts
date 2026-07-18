export type SortType = "string" | "number" | "date" | "tag";
export type SortDirection = "asc" | "desc";
export type SortPrimitive = string | number | Date | null | undefined;

/**
 * Natural comparison for tag-like strings ("A2" < "A10"), splitting into
 * numeric/non-numeric runs so embedded numbers sort by value, not lexically.
 */
export function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const aParts = a.match(re) ?? [];
  const bParts = b.match(re) ?? [];
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const x = aParts[i] ?? "";
    const y = bParts[i] ?? "";
    if (x === y) continue;
    const xn = Number(x);
    const yn = Number(y);
    if (x !== "" && y !== "" && !Number.isNaN(xn) && !Number.isNaN(yn)) return xn - yn;
    return x.localeCompare(y, undefined, { sensitivity: "base" });
  }
  return 0;
}

function compareByType(a: SortPrimitive, b: SortPrimitive, type: SortType): number {
  switch (type) {
    case "number":
      return Number(a) - Number(b);
    case "date": {
      const at = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
      const bt = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
      return at - bt;
    }
    case "tag":
      return naturalCompare(String(a), String(b));
    default:
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }
}

/**
 * Compares two sort values honoring direction, with empty values (null,
 * undefined, "") always pushed to the end regardless of asc/desc — so
 * flipping direction never buries populated rows under blank ones.
 */
export function compareRows(
  a: SortPrimitive,
  b: SortPrimitive,
  type: SortType,
  direction: SortDirection
): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const cmp = compareByType(a, b, type);
  return direction === "asc" ? cmp : -cmp;
}
