import Link from "next/link";
import { addDays } from "date-fns";
import { CalendarDays } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { fromDateInputValue, toDateInputValue } from "@/lib/dates";
import { getDailyLog } from "./daily-data";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.daily.title} · RabbitTrack` };
}

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const RESULT_CLS: Record<string, string> = {
  positive:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  negative:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const day = sp.date ? fromDateInputValue(sp.date) : todayUTC();
  const prevDay = addDays(day, -1);
  const nextDay = addDays(day, 1);

  const [log, { locale, t }] = await Promise.all([getDailyLog(day), getDictionary()]);
  const dt = t.daily;

  return (
    <div className="space-y-8">
      <PageHeader title={dt.title} description={dt.description} />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/daily?date=${toDateInputValue(prevDay)}`}>{dt.prevDay}</Link>
          </Button>
          <form method="get" className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{dt.dateLabel}</span>
              <Input
                key={toDateInputValue(day)}
                type="date"
                name="date"
                defaultValue={toDateInputValue(day)}
                className="w-40"
              />
            </label>
            <Button type="submit" size="sm">
              {dt.applyButton}
            </Button>
          </form>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/daily?date=${toDateInputValue(nextDay)}`}>{dt.nextDay}</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/daily">{dt.today}</Link>
          </Button>
        </CardContent>
      </Card>

      {/* تلقيح */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {dt.matingsHeading(log.matings.length)}
        </h2>
        {log.matings.length === 0 ? (
          <EmptyState icon={CalendarDays} title={dt.matingsEmpty} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: dt.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: dt.colMotherTag, type: "tag", className: "text-center" },
                { key: "breed", label: dt.colBreed, type: "string", className: "text-center" },
                { key: "buckTag", label: dt.colBuckTag, type: "tag", className: "text-center" },
              ]}
              rows={log.matings.map((r, i) => ({
                key: r.id,
                sortValues: { tag: r.doeTag, breed: r.doeBreed, buckTag: r.buckTag },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.doeId}`} className="hover:underline">
                        {r.doeTag ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.doeBreed ?? "—"}</TableCell>
                    <TableCell>{r.buckTag ?? "—"}</TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* جس */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {dt.pregnancyHeading(log.pregnancyTests.length)}
        </h2>
        {log.pregnancyTests.length === 0 ? (
          <EmptyState icon={CalendarDays} title={dt.pregnancyEmpty} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: dt.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: dt.colMotherTag, type: "tag", className: "text-center" },
                { key: "breed", label: dt.colBreed, type: "string", className: "text-center" },
                { key: "buckTag", label: dt.colBuckTag, type: "tag", className: "text-center" },
                { key: "result", label: dt.colResult, type: "string", className: "text-center" },
              ]}
              rows={log.pregnancyTests.map((r, i) => ({
                key: r.id,
                sortValues: { tag: r.doeTag, breed: r.doeBreed, buckTag: r.buckTag, result: r.result },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.doeId}`} className="hover:underline">
                        {r.doeTag ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.doeBreed ?? "—"}</TableCell>
                    <TableCell>{r.buckTag ?? "—"}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          RESULT_CLS[r.result]
                        )}
                      >
                        {r.result === "positive" ? dt.resultPositive : dt.resultNegative}
                      </span>
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* تركيب بيوت الولادة */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {dt.nestBoxHeading(log.nestBoxes.length)}
        </h2>
        {log.nestBoxes.length === 0 ? (
          <EmptyState icon={CalendarDays} title={dt.nestBoxEmpty} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: dt.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: dt.colMotherTag, type: "tag", className: "text-center" },
                { key: "breed", label: dt.colBreed, type: "string", className: "text-center" },
              ]}
              rows={log.nestBoxes.map((r, i) => ({
                key: r.id,
                sortValues: { tag: r.doeTag, breed: r.doeBreed },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.doeId}`} className="hover:underline">
                        {r.doeTag ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.doeBreed ?? "—"}</TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* ولادة */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {dt.kindlingHeading(log.kindlings.length)}
        </h2>
        {log.kindlings.length === 0 ? (
          <EmptyState icon={CalendarDays} title={dt.kindlingEmpty} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: dt.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: dt.colMotherTag, type: "tag", className: "text-center" },
                { key: "breed", label: dt.colBreed, type: "string", className: "text-center" },
                { key: "buckTag", label: dt.colBuckTag, type: "tag", className: "text-center" },
                { key: "alive", label: dt.colAlive, type: "number", className: "text-center" },
                { key: "dead", label: dt.colDead, type: "number", className: "text-center" },
              ]}
              rows={log.kindlings.map((r, i) => ({
                key: r.id,
                sortValues: {
                  tag: r.doeTag,
                  breed: r.doeBreed,
                  buckTag: r.buckTag,
                  alive: r.bornAlive,
                  dead: r.bornDead,
                },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.doeId}`} className="hover:underline">
                        {r.doeTag ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.doeBreed ?? "—"}</TableCell>
                    <TableCell>{r.buckTag ?? "—"}</TableCell>
                    <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {r.bornAlive}
                    </TableCell>
                    <TableCell className="font-semibold text-red-600 dark:text-red-400">
                      {r.bornDead}
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* فطام */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {dt.weaningHeading(log.weanings.length)}
        </h2>
        {log.weanings.length === 0 ? (
          <EmptyState icon={CalendarDays} title={dt.weaningEmpty} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: dt.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: dt.colMotherTag, type: "tag", className: "text-center" },
                { key: "breed", label: dt.colBreed, type: "string", className: "text-center" },
                { key: "weaned", label: dt.colWeaned, type: "number", className: "text-center" },
                { key: "weight", label: dt.colWeight, type: "number", className: "text-center" },
              ]}
              rows={log.weanings.map((r, i) => ({
                key: r.id,
                sortValues: {
                  tag: r.doeTag,
                  breed: r.doeBreed,
                  weaned: r.weaned,
                  weight: r.weaningWeightGrams,
                },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.doeId}`} className="hover:underline">
                        {r.doeTag ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.doeBreed ?? "—"}</TableCell>
                    <TableCell>{r.weaned ?? "—"}</TableCell>
                    <TableCell>{r.weaningWeightGrams ?? "—"}</TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* نافق واستبعاد */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {dt.mortalityHeading(log.mortality.length)}
        </h2>
        {log.mortality.length === 0 ? (
          <EmptyState icon={CalendarDays} title={dt.mortalityEmpty} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: dt.colIndex, className: "text-center", sortable: false },
                { key: "sex", label: dt.colSex, type: "string", className: "text-center" },
                { key: "tag", label: dt.colTag, type: "tag", className: "text-center" },
                { key: "breed", label: dt.colBreed, type: "string", className: "text-center" },
                { key: "status", label: dt.colStatus, type: "string", className: "text-center" },
              ]}
              rows={log.mortality.map((r, i) => ({
                key: r.id,
                sortValues: { sex: r.sex, tag: r.tag, breed: r.breed, status: r.status },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <StatusBadge value={r.sex} locale={locale} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        {r.tag ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge value={r.status} locale={locale} />
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
