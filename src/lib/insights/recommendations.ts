/**
 * The shape of an AI answer, and the gate it has to pass before a barn ever
 * reads it.
 *
 * Framework-agnostic on purpose (no server-only, no Prisma, no SDK): the route
 * validates with it and the mobile page renders with its types, so the two
 * cannot disagree about what a recommendation is.
 *
 * The whole point of this module is the citation rule. A language model asked
 * about a farm will happily produce a confident sentence containing a number
 * nobody measured, and on a page that otherwise only ever prints computed
 * figures that is the one failure mode worth engineering against. So every
 * recommendation must name the summary fields it rests on, and any that names
 * a field the summary does not contain is thrown away rather than shown.
 *
 * It is not a truth check — a model can still cite a real metric and reason
 * badly about it. It is a provenance check: whatever is printed points at a
 * number the farmer can go and look at himself.
 */

export type Priority = "high" | "medium" | "low";

export type Recommendation = {
  /** One line, the finding itself. */
  title: string;
  /** Why the numbers say so. */
  detail: string;
  /** What to actually do this week. */
  action: string;
  priority: Priority;
  /** Dotted paths into FarmSummary — validated, never rendered raw. */
  metrics: string[];
};

export type InsightsResult = {
  /** The single sentence to lead with — the state of the farm in one line. */
  headline: string;
  recommendations: Recommendation[];
  /** ISO stamp of the summary the advice was produced from. */
  generatedAt: string;
  windowDays: number;
  model: string;
  /**
   * How many recommendations were thrown away for citing a metric that does
   * not exist. Carried rather than swallowed: a non-zero number here is the
   * only visible symptom of a model drifting away from the farm's own books.
   */
  droppedCount: number;
};

export type ParseFailure =
  | "NOT_JSON"
  | "NOT_AN_OBJECT"
  | "NO_HEADLINE"
  | "NO_RECOMMENDATIONS"
  | "NO_VALID_RECOMMENDATIONS";

export type ParseOutcome =
  | { ok: true; headline: string; recommendations: Recommendation[]; droppedCount: number }
  | { ok: false; code: ParseFailure };

const PRIORITIES: Priority[] = ["high", "medium", "low"];
/** More than this stops being advice and starts being a wall of text. */
const MAX_RECOMMENDATIONS = 8;
const MAX_METRICS_PER_ITEM = 6;

/**
 * Every citable path in a summary object.
 *
 * Nested objects recurse into dotted paths ("productivity.marginPerKg"); arrays
 * stop at their own key ("weakDoes"), because a recommendation about a named
 * doe cites the list she came from, not her index in it — an index would be a
 * citation that changes meaning the next time the report is run.
 */
export function metricKeys(summary: unknown, prefix = ""): Set<string> {
  const keys = new Set<string>();
  if (summary == null || typeof summary !== "object") return keys;
  for (const [key, value] of Object.entries(summary as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    keys.add(path);
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of metricKeys(value, path)) keys.add(nested);
    }
  }
  return keys;
}

/**
 * Pulls the JSON object out of a model reply.
 *
 * Handles the two things that actually happen in practice: a fenced ```json
 * block, and a bare object with a sentence of politeness in front of it. Not a
 * parser — it finds the outermost braces and lets JSON.parse be the judge.
 */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return undefined;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Validates one item. Returns null for anything malformed OR anything citing a
 * metric outside `known` — the caller counts those, it does not repair them.
 */
function validateItem(raw: unknown, known: Set<string>): Recommendation | null {
  if (raw == null || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const title = nonEmptyString(item.title);
  const detail = nonEmptyString(item.detail);
  const action = nonEmptyString(item.action);
  if (!title || !detail || !action) return null;

  const priority = PRIORITIES.includes(item.priority as Priority)
    ? (item.priority as Priority)
    : // An unrecognised priority is not worth discarding a good finding over,
      // and "medium" is the honest default for "the model did not say".
      "medium";

  if (!Array.isArray(item.metrics) || item.metrics.length === 0) return null;
  const metrics = item.metrics.slice(0, MAX_METRICS_PER_ITEM);
  if (!metrics.every((m) => typeof m === "string" && known.has(m))) return null;

  return { title, detail, action, priority, metrics: metrics as string[] };
}

/**
 * Turns a raw model reply into recommendations the farm may read, given the
 * summary it was supposed to be reasoning about.
 */
export function parseRecommendations(raw: string, summary: unknown): ParseOutcome {
  const parsed = extractJson(raw);
  if (parsed === undefined) return { ok: false, code: "NOT_JSON" };
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, code: "NOT_AN_OBJECT" };
  }

  const obj = parsed as Record<string, unknown>;
  const headline = nonEmptyString(obj.headline);
  if (!headline) return { ok: false, code: "NO_HEADLINE" };
  if (!Array.isArray(obj.recommendations) || obj.recommendations.length === 0) {
    return { ok: false, code: "NO_RECOMMENDATIONS" };
  }

  const known = metricKeys(summary);
  const candidates = obj.recommendations.slice(0, MAX_RECOMMENDATIONS);
  const recommendations: Recommendation[] = [];
  for (const candidate of candidates) {
    const item = validateItem(candidate, known);
    if (item) recommendations.push(item);
  }
  if (recommendations.length === 0) return { ok: false, code: "NO_VALID_RECOMMENDATIONS" };

  // Highest priority first: the list is read top-down in a barn, and whatever
  // is costing money today should not be under a "consider tagging" note.
  const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => rank[a.priority] - rank[b.priority]);

  return {
    ok: true,
    headline,
    recommendations,
    droppedCount: candidates.length - recommendations.length,
  };
}
