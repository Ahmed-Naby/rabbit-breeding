import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { LitterCountInput } from "../does/doe-state-menu";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

/** yyyy-MM-dd key for matching by calendar day, TZ-agnostic since dates are stored at UTC midnight. */
function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export type KindlingLogRow = {
  id: string;
  matingDate: Date | null;
  kindlingDate: Date;
  doe: { id: string; tagId: string | null; breed: string | null };
  buck: { tagId: string | null } | null;
};

export type LitterForKindlingLog = {
  kindlingDate: Date;
  bornAlive: number;
  bornDead: number;
  breeding: { doeId: string };
};

export type BreedingForKindlingLog = {
  id: string;
  doeId: string;
  actualKindlingDate: Date | null;
};

/** "سجل الولادة": every recorded kindling, most recent first, with أحياء/نافق counts editable inline. */
export function KindlingLog({
  kindlingLog,
  litters,
  breedings,
  locale,
  t,
  todayOnly,
}: {
  kindlingLog: KindlingLogRow[];
  litters: LitterForKindlingLog[];
  breedings: BreedingForKindlingLog[];
  locale: Locale;
  t: Dictionary["kindling"];
  todayOnly?: boolean;
}) {
  // doeId + day -> litter counts, for enriching the kindling log below.
  const litterByDoeDay = new Map<string, { bornAlive: number; bornDead: number }>();
  for (const l of litters) {
    litterByDoeDay.set(`${l.breeding.doeId}_${dayKey(l.kindlingDate)}`, {
      bornAlive: l.bornAlive,
      bornDead: l.bornDead,
    });
  }

  // doeId + day -> breedingId, so "أحياء"/"نافق" can be edited inline.
  const breedingByDoeDay = new Map<string, string>();
  for (const b of breedings) {
    breedingByDoeDay.set(`${b.doeId}_${dayKey(b.actualKindlingDate!)}`, b.id);
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {t.logHeading}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
      </h2>
      {kindlingLog.length === 0 ? (
        <EmptyState icon={HeartPulse} title={t.logEmptyTitle} description={t.logEmptyDescription} />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.colDoeTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.colBuckTag, type: "tag", className: "hidden text-center sm:table-cell" },
              { key: "matingDate", label: t.colMatingDate, type: "date", className: "hidden text-center sm:table-cell" },
              { key: "kindlingDate", label: t.colKindlingDate, type: "date", className: "text-center" },
              { key: "bornAlive", label: t.colBornAlive, type: "number", className: "text-center" },
              { key: "bornDead", label: t.colBornDead, type: "number", className: "text-center" },
            ]}
            rows={kindlingLog.map((row, i) => {
              const day = dayKey(row.kindlingDate);
              const m = litterByDoeDay.get(`${row.doe.id}_${day}`);
              const breedingId = breedingByDoeDay.get(`${row.doe.id}_${day}`);
              return {
                key: row.id,
                sortValues: {
                  doeTag: row.doe.tagId,
                  breed: row.doe.breed,
                  buckTag: row.buck?.tagId,
                  matingDate: row.matingDate,
                  kindlingDate: row.kindlingDate,
                  bornAlive: m?.bornAlive,
                  bornDead: m?.bornDead,
                },
                node: (
                  <TableRow key={row.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${row.doe.id}`} className="hover:underline">
                        {row.doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{row.doe.breed ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{row.buck?.tagId ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <LocalDate date={row.matingDate} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <LocalDate date={row.kindlingDate} locale={locale} />
                    </TableCell>
                    <TableCell>
                      {breedingId ? (
                        <LitterCountInput
                          breedingId={breedingId}
                          field="bornAlive"
                          value={m?.bornAlive ?? null}
                          locale={locale}
                        />
                      ) : (
                        (m?.bornAlive ?? "—")
                      )}
                    </TableCell>
                    <TableCell>
                      {breedingId ? (
                        <LitterCountInput
                          breedingId={breedingId}
                          field="bornDead"
                          value={m?.bornDead ?? null}
                          locale={locale}
                        />
                      ) : (
                        (m?.bornDead ?? "—")
                      )}
                    </TableCell>
                  </TableRow>
                ),
              };
            })}
          />
        </div>
      )}
    </div>
  );
}
