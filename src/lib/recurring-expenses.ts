/**
 * المصروفات الثابتة الشهرية — rent, salaries, electricity and water: the costs
 * that arrive whether the herd produced anything or not.
 *
 * They matter more than their size suggests. Feed and vet bills scale with the
 * farm, so a bad month costs less to feed; fixed costs do not move at all, and
 * that is exactly what makes a half-empty barn bleed. On the demo farm they are
 * roughly a sixth of total expenses and they move سعر التعادل by about 13
 * EGP/kg — a farm that never enters them is reading a break-even price that is
 * wrong by more than its entire margin.
 *
 * ── Why these are stored on Settings as JSON, not as their own model ─────────
 *
 * A template is farm configuration, not a farm event: a handful of rows, edited
 * rarely, meaningful only as a set. Settings is already carried whole by every
 * layer — pull sends it in full on every sync, import/wipe/backup list it,
 * mobile mirrors it in settings_cache — so this costs one column instead of a
 * table, an entry in the positional pull tuple (which has a documented history
 * of silent model-shifting bugs), a tombstone model, and CRUD ops on both
 * platforms. Last-write-wins is also the right conflict rule for them, which is
 * what Settings already does; per-row merge would be worse, not better.
 *
 * ── Why there is no "posted through" marker ──────────────────────────────────
 *
 * Because a marker cannot be right. Post month M when the rent template (day 1)
 * is due but the salary template (day 25) is not, mark M as done, and the
 * salaries for that month never post at all. Per-template markers fix that and
 * bring their own drift.
 *
 * Instead a posting's id is DERIVED from its template and its month, so the
 * same month of the same template can only ever exist once. Idempotency becomes
 * a property of the data rather than of a counter that has to be maintained
 * correctly by every caller on two platforms — which also makes two devices
 * posting the same month offline a no-op rather than a duplicate.
 *
 * Framework-agnostic (no Prisma, no server-only) for the same reason as
 * feed-plan.ts: web reads Prisma rows and mobile reads SQLite, and the two must
 * never disagree about what is due.
 */

/** A template. Stored as an element of the Settings.recurringExpenses array. */
export type RecurringExpense = {
  id: string;
  /** A Transaction category — "rent" | "salaries" | "utilities" | "other" etc. */
  category: string;
  amountCents: number;
  /**
   * 1–28. Capped at 28 deliberately: "the 31st" does not exist in February, and
   * a farm that picks it would silently skip a month every year. 28 is the last
   * day that exists in every month, so the schedule can never have a hole.
   */
  dayOfMonth: number;
  /** ISO date (YYYY-MM-DD). Nothing is posted before this — see below. */
  startDate: string;
  note: string | null;
};

/** One month's occurrence of one template, ready to become a Transaction. */
export type RecurringPosting = {
  /** `rec-<templateId>-<YYYY-MM>` — see the header. */
  id: string;
  /**
   * UTC midnight of the due day, matching fromDateInputValue — which is how
   * every hand-entered Transaction in the app is stored. Local midnight would
   * be the same calendar day but a different instant, and east of Greenwich it
   * lands in the previous UTC day, so a rent due on the 1st would be bucketed
   * into the month before by anything that groups in UTC.
   */
  date: Date;
  category: string;
  amountCents: number;
  notes: string | null;
};

/**
 * How far back a newly-added template may reach. A template carries a
 * startDate so a farm CAN deliberately book the rent it has been paying since
 * January, but 36 months is the ceiling: past that, a mistyped year would post
 * a decade of invented salaries into the ledger in one click.
 */
const MAX_BACKFILL_MONTHS = 36;

export const RECURRING_ID_PREFIX = "rec-";

/**
 * A startDate is a calendar day the farm picked, not an instant, so it must be
 * read as one. `new Date("2026-05-01")` is UTC midnight, while the month walk
 * below builds LOCAL midnights — in Egypt (UTC+2) that makes the start day two
 * hours later than the 1st of its own month, and the very first month silently
 * never posts. Building it from parts keeps both sides on the same clock.
 */
function parseCalendarDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Read the JSON column into templates, dropping anything malformed rather than
 * throwing. This value has been through a JSON column, a SQLite TEXT column and
 * two sync layers, and one bad row must not take the finance page down with it.
 */
export function parseRecurringExpenses(value: unknown): RecurringExpense[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const out: RecurringExpense[] = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = typeof row.id === "string" ? row.id : null;
    const category = typeof row.category === "string" ? row.category : null;
    const amountCents = typeof row.amountCents === "number" ? Math.round(row.amountCents) : null;
    const startDate = typeof row.startDate === "string" ? row.startDate : null;
    if (!id || !category || amountCents == null || amountCents <= 0 || !startDate) continue;
    const day = typeof row.dayOfMonth === "number" ? Math.round(row.dayOfMonth) : 1;
    out.push({
      id,
      category,
      amountCents,
      dayOfMonth: Math.min(28, Math.max(1, day)),
      startDate,
      note: typeof row.note === "string" && row.note.trim() ? row.note : null,
    });
  }
  return out;
}

/** What the farm is committed to every month regardless of what it produces. */
export function recurringMonthlyTotalCents(templates: RecurringExpense[]): number {
  return templates.reduce((s, t) => s + t.amountCents, 0);
}

/** `rec-<templateId>-<YYYY-MM>`, the whole idempotency mechanism. */
export function postingId(templateId: string, year: number, month: number): string {
  return `${RECURRING_ID_PREFIX}${templateId}-${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Every occurrence that is due and not already in the ledger.
 *
 * "Due" means the day has arrived: a template set to the 25th posts nothing on
 * the 24th, so a farm looking at this month's expenses sees what it has
 * actually reached, not what it will owe. That is also why the current month is
 * included at all rather than only completed months — rent due on the 1st is a
 * real cost on the 2nd, and holding it back until the month closed would make
 * every mid-month break-even price look better than it is.
 *
 * @param existingIds ids already in the ledger, so an occurrence posts once and
 *   only once. The caller reads these from its own store — Prisma on the web,
 *   SQLite on mobile — which is why this function is pure.
 */
export function dueRecurringPostings(
  templates: RecurringExpense[],
  today: Date,
  existingIds: ReadonlySet<string>
): RecurringPosting[] {
  const out: RecurringPosting[] = [];

  for (const tpl of templates) {
    const start = parseCalendarDay(tpl.startDate);
    if (!start) continue;

    // Walk months from the later of the template's start and the back-fill
    // ceiling, so an old startDate is honoured up to the cap and no further.
    const floor = new Date(today.getFullYear(), today.getMonth() - MAX_BACKFILL_MONTHS, 1);
    const first = start > floor ? start : floor;

    let year = first.getFullYear();
    let month = first.getMonth();

    while (year < today.getFullYear() || (year === today.getFullYear() && month <= today.getMonth())) {
      // Local for the comparison — "has the 25th arrived" is a question about
      // the farm's own calendar, not Greenwich's — but UTC for what gets
      // stored, so the row matches every hand-entered transaction. See the
      // note on RecurringPosting.date.
      const dueLocally = new Date(year, month, tpl.dayOfMonth);
      // Not yet reached, either because the day hasn't come round this month or
      // because the template starts mid-month.
      if (dueLocally <= today && dueLocally >= start) {
        const id = postingId(tpl.id, year, month);
        if (!existingIds.has(id)) {
          out.push({
            id,
            date: new Date(Date.UTC(year, month, tpl.dayOfMonth)),
            category: tpl.category,
            amountCents: tpl.amountCents,
            notes: tpl.note,
          });
        }
      }
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  }

  // Oldest first, so a back-fill reads like a ledger rather than a shuffle.
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
