import { describe, test, expect } from "vitest";
import {
  parseRecurringExpenses,
  dueRecurringPostings,
  recurringMonthlyTotalCents,
  postingId,
  type RecurringExpense,
} from "@/lib/recurring-expenses";

function tpl(over: Partial<RecurringExpense> = {}): RecurringExpense {
  return {
    id: "rent1",
    category: "rent",
    amountCents: 150_000,
    dayOfMonth: 1,
    startDate: "2026-01-01",
    note: null,
    ...over,
  };
}

const NONE = new Set<string>();

describe("parseRecurringExpenses", () => {
  test("reads a well-formed array", () => {
    expect(parseRecurringExpenses([tpl()])).toHaveLength(1);
  });

  test("accepts the JSON string SQLite hands back", () => {
    expect(parseRecurringExpenses(JSON.stringify([tpl()]))).toHaveLength(1);
  });

  test("returns [] for every flavour of absent or malformed value", () => {
    for (const v of [null, undefined, "", "not json", "{}", 7, { a: 1 }]) {
      expect(parseRecurringExpenses(v)).toEqual([]);
    }
  });

  test("drops only the bad rows, keeping the good ones", () => {
    const rows = parseRecurringExpenses([
      tpl(),
      { id: "x" }, // no amount, no category, no start
      tpl({ id: "b", amountCents: 0 }), // zero is not an expense
      tpl({ id: "c", amountCents: -500 }),
      tpl({ id: "d" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["rent1", "d"]);
  });

  test("clamps dayOfMonth into 1..28 so no month can be skipped", () => {
    expect(parseRecurringExpenses([tpl({ dayOfMonth: 31 })])[0].dayOfMonth).toBe(28);
    expect(parseRecurringExpenses([tpl({ dayOfMonth: 0 })])[0].dayOfMonth).toBe(1);
  });
});

describe("recurringMonthlyTotalCents", () => {
  test("sums the templates", () => {
    expect(
      recurringMonthlyTotalCents([tpl(), tpl({ id: "b", amountCents: 600_000 })])
    ).toBe(750_000);
  });

  test("is 0 with nothing set up", () => {
    expect(recurringMonthlyTotalCents([])).toBe(0);
  });
});

describe("dueRecurringPostings", () => {
  test("posts one row per month from the start date through today", () => {
    const due = dueRecurringPostings([tpl({ startDate: "2026-05-01" })], new Date(2026, 6, 15), NONE);
    expect(due.map((d) => d.id)).toEqual([
      postingId("rent1", 2026, 4),
      postingId("rent1", 2026, 5),
      postingId("rent1", 2026, 6),
    ]);
  });

  test("does not post a month whose day has not arrived yet", () => {
    // The 25th, read on the 15th: May and June are due, July is not.
    const due = dueRecurringPostings(
      [tpl({ startDate: "2026-05-01", dayOfMonth: 25 })],
      new Date(2026, 6, 15),
      NONE
    );
    expect(due).toHaveLength(2);
    expect(due.at(-1)!.date.getMonth()).toBe(5);
  });

  test("posts the current month once its day arrives", () => {
    const due = dueRecurringPostings(
      [tpl({ startDate: "2026-07-01", dayOfMonth: 25 })],
      new Date(2026, 6, 25),
      NONE
    );
    expect(due).toHaveLength(1);
  });

  test("skips the first month when the template starts after its due day", () => {
    // Starts 10 June, due on the 1st: June is already past, so it begins in July.
    const due = dueRecurringPostings(
      [tpl({ startDate: "2026-06-10", dayOfMonth: 1 })],
      new Date(2026, 6, 15),
      NONE
    );
    expect(due).toHaveLength(1);
    expect(due[0].date.getMonth()).toBe(6);
  });

  test("nothing is due before the start date", () => {
    expect(
      dueRecurringPostings([tpl({ startDate: "2027-01-01" })], new Date(2026, 6, 15), NONE)
    ).toEqual([]);
  });

  test("already-posted months are excluded — pressing the button twice is a no-op", () => {
    const templates = [tpl({ startDate: "2026-05-01" })];
    const today = new Date(2026, 6, 15);
    const first = dueRecurringPostings(templates, today, NONE);
    expect(first).toHaveLength(3);

    const posted = new Set(first.map((d) => d.id));
    expect(dueRecurringPostings(templates, today, posted)).toEqual([]);
  });

  test("a gap in the ledger is refilled without re-posting its neighbours", () => {
    const templates = [tpl({ startDate: "2026-05-01" })];
    const today = new Date(2026, 6, 15);
    const posted = new Set([postingId("rent1", 2026, 4), postingId("rent1", 2026, 6)]);
    const due = dueRecurringPostings(templates, today, posted);
    expect(due.map((d) => d.id)).toEqual([postingId("rent1", 2026, 5)]);
  });

  test("templates are independent — one due, one not", () => {
    const due = dueRecurringPostings(
      [
        tpl({ id: "rent1", dayOfMonth: 1, startDate: "2026-07-01" }),
        tpl({ id: "pay1", dayOfMonth: 25, startDate: "2026-07-01", amountCents: 600_000 }),
      ],
      new Date(2026, 6, 15),
      NONE
    );
    // This is the case a "posted through month" marker gets wrong: marking July
    // done for the rent would lose the salaries for the same month forever.
    expect(due.map((d) => d.id)).toEqual([postingId("rent1", 2026, 6)]);
  });

  test("carries the template's category, amount and note onto each posting", () => {
    const due = dueRecurringPostings(
      [tpl({ category: "salaries", amountCents: 600_000, note: "٥ عمال", startDate: "2026-07-01" })],
      new Date(2026, 6, 15),
      NONE
    );
    expect(due[0]).toMatchObject({ category: "salaries", amountCents: 600_000, notes: "٥ عمال" });
  });

  test("a very old start date is capped at the 36-month back-fill ceiling", () => {
    const due = dueRecurringPostings(
      [tpl({ startDate: "2000-01-01" })],
      new Date(2026, 6, 15),
      NONE
    );
    expect(due).toHaveLength(37); // 36 months back, plus the current one
  });

  test("crosses a year boundary", () => {
    const due = dueRecurringPostings(
      [tpl({ startDate: "2025-11-01" })],
      new Date(2026, 0, 15),
      NONE
    );
    expect(due.map((d) => d.id)).toEqual([
      postingId("rent1", 2025, 10),
      postingId("rent1", 2025, 11),
      postingId("rent1", 2026, 0),
    ]);
  });

  test("stores UTC midnight, like every hand-entered transaction", () => {
    // Local midnight would be the same calendar day but a different instant,
    // and east of Greenwich it serialises as the day before — putting a rent
    // due on the 1st into the previous month.
    const due = dueRecurringPostings(
      [tpl({ dayOfMonth: 5, startDate: "2026-07-01" })],
      new Date(2026, 6, 15),
      NONE
    );
    expect(due[0].date.toISOString()).toBe("2026-07-05T00:00:00.000Z");
  });

  test("day 28 lands in February, the reason for the cap", () => {
    const due = dueRecurringPostings(
      [tpl({ dayOfMonth: 28, startDate: "2026-02-01" })],
      new Date(2026, 1, 28),
      NONE
    );
    expect(due).toHaveLength(1);
    expect(due[0].date.getDate()).toBe(28);
  });

  test("postings come back oldest first", () => {
    const due = dueRecurringPostings(
      [
        tpl({ id: "a", dayOfMonth: 20, startDate: "2026-05-01" }),
        tpl({ id: "b", dayOfMonth: 5, startDate: "2026-05-01" }),
      ],
      new Date(2026, 6, 15),
      NONE
    );
    const times = due.map((d) => d.date.getTime());
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });

  test("an unparseable start date is skipped, not thrown on", () => {
    expect(
      dueRecurringPostings([tpl({ startDate: "not-a-date" })], new Date(2026, 6, 15), NONE)
    ).toEqual([]);
  });
});
