import { useEffect, useState, useCallback } from "react";
import { CalendarDays } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchDailyPageData, type DailyLog } from "../db/queries";
import { toDateInputValue } from "@/lib/dates";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { cn } from "@/lib/utils";

function todayIso(): string {
  return toDateInputValue(new Date());
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return toDateInputValue(d);
}

const RESULT_CLS: Record<string, string> = {
  positive:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  negative:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

function EmptyBlock({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
      <CalendarDays className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
    </div>
  );
}

export function DailyPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const dt = t.daily;

  const [dayInput, setDayInput] = useState(() => todayIso());
  const [log, setLog] = useState<DailyLog | null>(null);

  const load = useCallback(async (dayIso: string) => {
    const db = await getDb();
    const res = await fetchDailyPageData(db, dayIso);
    setLog(res);
  }, []);

  useEffect(() => {
    void load(dayInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    void load(dayInput);
  };

  const goTo = (iso: string) => {
    setDayInput(iso);
    void load(iso);
  };

  const matingsSort = useSortableRows(log?.matings ?? [], {
    tag: { type: "tag", value: (r) => r.doeTag },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTag },
  });
  const pregnancySort = useSortableRows(log?.pregnancyTests ?? [], {
    tag: { type: "tag", value: (r) => r.doeTag },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTag },
    result: { type: "string", value: (r) => r.result },
  });
  const nestBoxSort = useSortableRows(log?.nestBoxes ?? [], {
    tag: { type: "tag", value: (r) => r.doeTag },
    breed: { type: "string", value: (r) => r.doeBreed },
  });
  const kindlingSort = useSortableRows(log?.kindlings ?? [], {
    tag: { type: "tag", value: (r) => r.doeTag },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTag },
    alive: { type: "number", value: (r) => r.bornAlive },
    dead: { type: "number", value: (r) => r.bornDead },
  });
  const weaningSort = useSortableRows(log?.weanings ?? [], {
    tag: { type: "tag", value: (r) => r.doeTag },
    breed: { type: "string", value: (r) => r.doeBreed },
    weaned: { type: "number", value: (r) => r.weaned },
    weight: { type: "number", value: (r) => r.weaningWeightGrams },
  });
  const mortalitySort = useSortableRows(log?.mortality ?? [], {
    sex: { type: "string", value: (r) => r.sex },
    tag: { type: "tag", value: (r) => r.tag },
    breed: { type: "string", value: (r) => r.breed },
    status: { type: "string", value: (r) => r.status },
  });

  if (!log) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{dt.title}</h1>
        <p className="text-sm text-muted-foreground">{dt.description}</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <Button variant="outline" size="sm" onClick={() => goTo(shiftDay(dayInput, -1))}>
            {dt.prevDay}
          </Button>
          <form onSubmit={handleApply} className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{dt.dateLabel}</span>
              <Input
                type="date"
                value={dayInput}
                onChange={(e) => setDayInput(e.target.value)}
                className="h-9 w-40"
              />
            </label>
            <Button type="submit" size="sm">
              {dt.applyButton}
            </Button>
          </form>
          <Button variant="outline" size="sm" onClick={() => goTo(shiftDay(dayInput, 1))}>
            {dt.nextDay}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goTo(todayIso())}>
            {dt.today}
          </Button>
        </CardContent>
      </Card>

      {/* تلقيح */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{dt.matingsHeading(log.matings.length)}</h2>
        {log.matings.length === 0 ? (
          <EmptyBlock title={dt.matingsEmpty} />
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center">{dt.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colMotherTag}
                    sortKey="tag"
                    activeSortKey={matingsSort.sortKey}
                    direction={matingsSort.direction}
                    onSort={matingsSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colBreed}
                    sortKey="breed"
                    activeSortKey={matingsSort.sortKey}
                    direction={matingsSort.direction}
                    onSort={matingsSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colBuckTag}
                    sortKey="buckTag"
                    activeSortKey={matingsSort.sortKey}
                    direction={matingsSort.direction}
                    onSort={matingsSort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {matingsSort.sorted.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-center font-bold">{r.doeTag ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.doeBreed ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.buckTag ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* جس */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{dt.pregnancyHeading(log.pregnancyTests.length)}</h2>
        {log.pregnancyTests.length === 0 ? (
          <EmptyBlock title={dt.pregnancyEmpty} />
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center">{dt.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colMotherTag}
                    sortKey="tag"
                    activeSortKey={pregnancySort.sortKey}
                    direction={pregnancySort.direction}
                    onSort={pregnancySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colBreed}
                    sortKey="breed"
                    activeSortKey={pregnancySort.sortKey}
                    direction={pregnancySort.direction}
                    onSort={pregnancySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colBuckTag}
                    sortKey="buckTag"
                    activeSortKey={pregnancySort.sortKey}
                    direction={pregnancySort.direction}
                    onSort={pregnancySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colResult}
                    sortKey="result"
                    activeSortKey={pregnancySort.sortKey}
                    direction={pregnancySort.direction}
                    onSort={pregnancySort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {pregnancySort.sorted.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-center font-bold">{r.doeTag ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.doeBreed ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.buckTag ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          RESULT_CLS[r.result]
                        )}
                      >
                        {r.result === "positive" ? dt.resultPositive : dt.resultNegative}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* تركيب بيوت الولادة */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{dt.nestBoxHeading(log.nestBoxes.length)}</h2>
        {log.nestBoxes.length === 0 ? (
          <EmptyBlock title={dt.nestBoxEmpty} />
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center">{dt.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colMotherTag}
                    sortKey="tag"
                    activeSortKey={nestBoxSort.sortKey}
                    direction={nestBoxSort.direction}
                    onSort={nestBoxSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colBreed}
                    sortKey="breed"
                    activeSortKey={nestBoxSort.sortKey}
                    direction={nestBoxSort.direction}
                    onSort={nestBoxSort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {nestBoxSort.sorted.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-center font-bold">{r.doeTag ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.doeBreed ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ولادة */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{dt.kindlingHeading(log.kindlings.length)}</h2>
        {log.kindlings.length === 0 ? (
          <EmptyBlock title={dt.kindlingEmpty} />
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center">{dt.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colMotherTag}
                    sortKey="tag"
                    activeSortKey={kindlingSort.sortKey}
                    direction={kindlingSort.direction}
                    onSort={kindlingSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colBreed}
                    sortKey="breed"
                    activeSortKey={kindlingSort.sortKey}
                    direction={kindlingSort.direction}
                    onSort={kindlingSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colBuckTag}
                    sortKey="buckTag"
                    activeSortKey={kindlingSort.sortKey}
                    direction={kindlingSort.direction}
                    onSort={kindlingSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colAlive}
                    sortKey="alive"
                    activeSortKey={kindlingSort.sortKey}
                    direction={kindlingSort.direction}
                    onSort={kindlingSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colDead}
                    sortKey="dead"
                    activeSortKey={kindlingSort.sortKey}
                    direction={kindlingSort.direction}
                    onSort={kindlingSort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {kindlingSort.sorted.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-center font-bold">{r.doeTag ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.doeBreed ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.buckTag ?? "—"}</td>
                    <td className="px-4 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">{r.bornAlive}</td>
                    <td className="px-4 py-3 text-center font-semibold text-red-600 dark:text-red-400">{r.bornDead}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* فطام */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{dt.weaningHeading(log.weanings.length)}</h2>
        {log.weanings.length === 0 ? (
          <EmptyBlock title={dt.weaningEmpty} />
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center">{dt.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colMotherTag}
                    sortKey="tag"
                    activeSortKey={weaningSort.sortKey}
                    direction={weaningSort.direction}
                    onSort={weaningSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colBreed}
                    sortKey="breed"
                    activeSortKey={weaningSort.sortKey}
                    direction={weaningSort.direction}
                    onSort={weaningSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colWeaned}
                    sortKey="weaned"
                    activeSortKey={weaningSort.sortKey}
                    direction={weaningSort.direction}
                    onSort={weaningSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colWeight}
                    sortKey="weight"
                    activeSortKey={weaningSort.sortKey}
                    direction={weaningSort.direction}
                    onSort={weaningSort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {weaningSort.sorted.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-center font-bold">{r.doeTag ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.doeBreed ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.weaned ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.weaningWeightGrams ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نافق واستبعاد */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{dt.mortalityHeading(log.mortality.length)}</h2>
        {log.mortality.length === 0 ? (
          <EmptyBlock title={dt.mortalityEmpty} />
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center">{dt.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colSex}
                    sortKey="sex"
                    activeSortKey={mortalitySort.sortKey}
                    direction={mortalitySort.direction}
                    onSort={mortalitySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colTag}
                    sortKey="tag"
                    activeSortKey={mortalitySort.sortKey}
                    direction={mortalitySort.direction}
                    onSort={mortalitySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colBreed}
                    sortKey="breed"
                    activeSortKey={mortalitySort.sortKey}
                    direction={mortalitySort.direction}
                    onSort={mortalitySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={dt.colStatus}
                    sortKey="status"
                    activeSortKey={mortalitySort.sortKey}
                    direction={mortalitySort.direction}
                    onSort={mortalitySort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {mortalitySort.sorted.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge value={r.sex} locale={locale} />
                    </td>
                    <td className="px-4 py-3 text-center font-bold">{r.tag ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.breed ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge value={r.status} locale={locale} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
