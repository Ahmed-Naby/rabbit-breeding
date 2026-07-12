import { History } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { LocalDate } from "@/components/local-date";
import { label } from "@/lib/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/locales";

/** yyyy-MM-dd key for matching by calendar day, TZ-agnostic since dates are stored at UTC midnight. */
function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

type Cycle = {
  matingDate: Date;
  buckTagId: string | null;
  testDate: Date | null;
  testResult: string | null;
  kindlingDate: Date | null;
  bornAlive: number | null;
  bornDead: number | null;
  weaningDate: Date | null;
  weaned: number | null;
};

/**
 * One row per breeding cycle, always anchored on matingDate — the only
 * stable identity a cycle has, since Breeding rows themselves get
 * reused/overwritten on the doe's next mating (see markMated). The
 * permanent logs (PregnancyTestLog, KindlingLog) snapshot matingDate at
 * each stage, so matching on it stitches a cycle's stages back together
 * even after the underlying Breeding row has moved on to a newer cycle.
 * A still-in-progress cycle (mated but not yet tested/kindled) has no log
 * entry yet, so it's seeded from the doe's current Breeding row instead.
 */
export function BreedingHistoryPanel({
  pregnancyTests,
  kindlings,
  litters,
  ongoing,
  t,
  locale,
}: {
  pregnancyTests: {
    matingDate: Date;
    testDate: Date;
    result: string;
    buck: { tagId: string | null } | null;
  }[];
  kindlings: {
    matingDate: Date | null;
    kindlingDate: Date;
    buck: { tagId: string | null } | null;
  }[];
  litters: {
    kindlingDate: Date;
    bornAlive: number;
    bornDead: number;
    weaningDate: Date | null;
    weaned: number | null;
  }[];
  ongoing: { matingDate: Date | null; buck: { tagId: string | null } | null }[];
  t: Dictionary["rabbits"];
  locale: Locale;
}) {
  const cycles = new Map<string, Cycle>();

  function ensure(matingDate: Date, buckTagId: string | null) {
    const key = matingDate.toISOString();
    let c = cycles.get(key);
    if (!c) {
      c = {
        matingDate,
        buckTagId,
        testDate: null,
        testResult: null,
        kindlingDate: null,
        bornAlive: null,
        bornDead: null,
        weaningDate: null,
        weaned: null,
      };
      cycles.set(key, c);
    } else if (!c.buckTagId && buckTagId) {
      c.buckTagId = buckTagId;
    }
    return c;
  }

  for (const b of ongoing) {
    if (!b.matingDate) continue;
    ensure(b.matingDate, b.buck?.tagId ?? null);
  }
  for (const t of pregnancyTests) {
    const c = ensure(t.matingDate, t.buck?.tagId ?? null);
    c.testDate = t.testDate;
    c.testResult = t.result;
  }
  for (const k of kindlings) {
    // matingDate is nullable on KindlingLog only for data predating that
    // column; fall back to grouping by kindlingDate itself so the row still
    // shows up rather than silently disappearing.
    const c = k.matingDate
      ? ensure(k.matingDate, k.buck?.tagId ?? null)
      : ensure(k.kindlingDate, k.buck?.tagId ?? null);
    c.kindlingDate = k.kindlingDate;
  }

  // kindlingDate + doe (day-level) -> litter counts, same best-effort join
  // used on /kindling — Litter isn't tied to KindlingLog directly, only to a
  // Breeding row that may since have moved on to a newer cycle.
  const litterByDay = new Map<
    string,
    { bornAlive: number; bornDead: number; weaningDate: Date | null; weaned: number | null }
  >();
  for (const l of litters) {
    litterByDay.set(dayKey(l.kindlingDate), {
      bornAlive: l.bornAlive,
      bornDead: l.bornDead,
      weaningDate: l.weaningDate,
      weaned: l.weaned,
    });
  }
  for (const c of cycles.values()) {
    if (!c.kindlingDate) continue;
    const m = litterByDay.get(dayKey(c.kindlingDate));
    if (m) {
      c.bornAlive = m.bornAlive;
      c.bornDead = m.bornDead;
      c.weaningDate = m.weaningDate;
      c.weaned = m.weaned;
    }
  }

  const rows = Array.from(cycles.values()).sort(
    (a, b) => b.matingDate.getTime() - a.matingDate.getTime()
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={t.historyEmptyTitle}
        description={t.doeHistoryEmptyDescription}
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="[&>th]:border-x">
            <TableHead className="text-center">{t.colIndex}</TableHead>
            <TableHead className="text-center">{t.colMatingDate}</TableHead>
            <TableHead className="text-center">{t.colBuckTag}</TableHead>
            <TableHead className="text-center">{t.colTestDate}</TableHead>
            <TableHead className="text-center">{t.colTestResult}</TableHead>
            <TableHead className="text-center">{t.colKindlingDate}</TableHead>
            <TableHead className="text-center">{t.colBornAlive}</TableHead>
            <TableHead className="text-center">{t.colBornDead}</TableHead>
            <TableHead className="text-center">{t.colWeaningDate}</TableHead>
            <TableHead className="text-center">{t.colWeanedCount}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c, i) => (
            <TableRow
              key={c.matingDate.toISOString()}
              className="[&>td]:border-x [&>td]:text-center"
            >
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell>
                <LocalDate date={c.matingDate} locale={locale} />
              </TableCell>
              <TableCell>{c.buckTagId ?? "—"}</TableCell>
              <TableCell>{c.testDate ? <LocalDate date={c.testDate} locale={locale} /> : "—"}</TableCell>
              <TableCell>{c.testResult ? label(c.testResult, locale) : "—"}</TableCell>
              <TableCell>
                {c.kindlingDate ? <LocalDate date={c.kindlingDate} locale={locale} /> : "—"}
              </TableCell>
              <TableCell>{c.bornAlive ?? "—"}</TableCell>
              <TableCell>{c.bornDead ?? "—"}</TableCell>
              <TableCell>
                {c.weaningDate ? <LocalDate date={c.weaningDate} locale={locale} /> : "—"}
              </TableCell>
              <TableCell>{c.weaned ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
