import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { label } from "@/lib/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/locales";

/** yyyy-MM-dd key for matching by calendar day, TZ-agnostic since dates are stored at UTC midnight. */
function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export type BuckCycle = {
  doeId: string;
  doeTagId: string | null;
  doeBreed: string | null;
  matingDate: Date;
  testResult: string | null;
  kindlingDate: Date | null;
  bornAlive: number | null;
  bornDead: number | null;
};

/**
 * Mirror of buildDoeCycles but anchored on a buck: one row per doe he mated,
 * keyed by doeId+matingDate (a buck's cycles span many does, unlike a doe's
 * own history where matingDate alone is enough). Same reasoning as the doe
 * panel applies to why this can't just walk Breeding rows directly — see
 * breeding-history.tsx.
 */
export function buildBuckCycles({
  pregnancyTests,
  kindlings,
  litters,
  ongoing,
}: {
  pregnancyTests: {
    matingDate: Date;
    result: string;
    doe: { id: string; tagId: string | null; breed: string | null };
  }[];
  kindlings: {
    matingDate: Date | null;
    kindlingDate: Date;
    doe: { id: string; tagId: string | null; breed: string | null };
  }[];
  litters: {
    kindlingDate: Date;
    bornAlive: number;
    bornDead: number;
    breeding: { doeId: string };
  }[];
  ongoing: {
    matingDate: Date | null;
    doe: { id: string; tagId: string | null; breed: string | null };
  }[];
}): BuckCycle[] {
  const cycles = new Map<string, BuckCycle>();

  function ensure(
    doe: { id: string; tagId: string | null; breed: string | null },
    matingDate: Date
  ) {
    const key = `${doe.id}_${matingDate.toISOString()}`;
    let c = cycles.get(key);
    if (!c) {
      c = {
        doeId: doe.id,
        doeTagId: doe.tagId,
        doeBreed: doe.breed,
        matingDate,
        testResult: null,
        kindlingDate: null,
        bornAlive: null,
        bornDead: null,
      };
      cycles.set(key, c);
    }
    return c;
  }

  for (const b of ongoing) {
    if (!b.matingDate) continue;
    ensure(b.doe, b.matingDate);
  }
  for (const t of pregnancyTests) {
    const c = ensure(t.doe, t.matingDate);
    c.testResult = t.result;
  }
  for (const k of kindlings) {
    const c = k.matingDate ? ensure(k.doe, k.matingDate) : ensure(k.doe, k.kindlingDate);
    c.kindlingDate = k.kindlingDate;
  }

  // doeId + kindlingDate (day-level) -> litter counts, same best-effort join
  // used elsewhere — Litter is tied to a Breeding row that may since have
  // moved on to a newer cycle for the same doe.
  const litterByDoeDay = new Map<string, { bornAlive: number; bornDead: number }>();
  for (const l of litters) {
    litterByDoeDay.set(`${l.breeding.doeId}_${dayKey(l.kindlingDate)}`, {
      bornAlive: l.bornAlive,
      bornDead: l.bornDead,
    });
  }
  for (const c of cycles.values()) {
    if (!c.kindlingDate) continue;
    const m = litterByDoeDay.get(`${c.doeId}_${dayKey(c.kindlingDate)}`);
    if (m) {
      c.bornAlive = m.bornAlive;
      c.bornDead = m.bornDead;
    }
  }

  return Array.from(cycles.values()).sort(
    (a, b) => b.matingDate.getTime() - a.matingDate.getTime()
  );
}

export function BuckBreedingHistoryPanel({
  cycles: rows,
  t,
  locale,
}: {
  cycles: BuckCycle[];
  t: Dictionary["rabbits"];
  locale: Locale;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={t.historyEmptyTitle}
        description={t.buckHistoryEmptyDescription}
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <SortableTable
        headerRowClassName="[&>th]:border-x"
        columns={[
          { key: "index", label: t.colIndex, className: "text-center", sortable: false },
          { key: "matingDate", label: t.colMatingDate, type: "date", className: "text-center" },
          { key: "doeTag", label: t.colDoeTag, type: "tag", className: "text-center" },
          { key: "doeBreed", label: t.colDoeBreed, type: "string", className: "text-center" },
          { key: "doeState", label: t.colDoeState, type: "string", className: "text-center" },
          { key: "bornAlive", label: t.colBornCount, type: "number", className: "text-center" },
        ]}
        rows={rows.map((c, i) => ({
          key: `${c.doeId}_${c.matingDate.toISOString()}`,
          sortValues: {
            matingDate: c.matingDate,
            doeTag: c.doeTagId,
            doeBreed: c.doeBreed,
            doeState: c.testResult,
            bornAlive: c.bornAlive,
          },
          node: (
            <TableRow
              key={`${c.doeId}_${c.matingDate.toISOString()}`}
              className="[&>td]:border-x [&>td]:text-center"
            >
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell>
                <LocalDate date={c.matingDate} locale={locale} />
              </TableCell>
              <TableCell>
                <Link href={`/rabbits/${c.doeId}`} className="text-primary hover:underline">
                  {c.doeTagId ?? "—"}
                </Link>
              </TableCell>
              <TableCell>{c.doeBreed ?? "—"}</TableCell>
              <TableCell>{c.testResult ? label(c.testResult, locale) : "—"}</TableCell>
              <TableCell>
                {c.bornAlive != null
                  ? c.bornDead
                    ? t.bornWithDead(c.bornAlive, c.bornDead)
                    : c.bornAlive
                  : "—"}
              </TableCell>
            </TableRow>
          ),
        }))}
      />
    </div>
  );
}
