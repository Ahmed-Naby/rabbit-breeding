import Link from "next/link";
import { Milk } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { survivalRate } from "@/lib/dates";
import { LitterCountInput, LitterWeightInput } from "../does/doe-state-menu";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export type WeaningLogRow = {
  breedingId: string;
  kindlingDate: Date | null;
  weaningDate: Date | null;
  bornAlive: number;
  bornDead: number;
  weaned: number | null;
  weaningWeightGrams: number | null;
  breeding: {
    doe: { id: string; tagId: string | null; breed: string | null };
    buck: { tagId: string | null } | null;
  };
};

/** "سجل الفطام": every litter already weaned, most recent first, with عدد الفطام/وزن الفطام editable inline. */
export function WeaningLog({
  weanedLitters,
  locale,
  t,
  todayOnly,
}: {
  weanedLitters: WeaningLogRow[];
  locale: Locale;
  t: Dictionary["weaning"];
  todayOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {t.logHeading}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
      </h2>
      {weanedLitters.length === 0 ? (
        <EmptyState icon={Milk} title={t.logEmptyTitle} description={t.logEmptyDescription} />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.colMotherTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.colBuckTag, type: "tag", className: "hidden text-center sm:table-cell" },
              { key: "kindlingDate", label: t.colKindlingDate, type: "date", className: "hidden text-center sm:table-cell" },
              { key: "weaningDate", label: t.colWeaningDate, type: "date", className: "text-center" },
              { key: "alive", label: t.colAlive, type: "number", className: "text-center" },
              { key: "dead", label: t.colDead, type: "number", className: "text-center" },
              { key: "weanedCount", label: t.colWeanedCount, type: "number", className: "text-center" },
              { key: "weaningWeight", label: t.colWeaningWeight, type: "number", className: "text-center" },
              { key: "survivalRate", label: t.colSurvivalRate, type: "number", className: "hidden text-center sm:table-cell" },
            ]}
            rows={weanedLitters.map((l, i) => {
              const r = survivalRate(l.bornAlive, l.weaned);
              return {
                key: l.breedingId,
                sortValues: {
                  doeTag: l.breeding.doe.tagId,
                  breed: l.breeding.doe.breed,
                  buckTag: l.breeding.buck?.tagId,
                  kindlingDate: l.kindlingDate,
                  weaningDate: l.weaningDate,
                  alive: l.bornAlive,
                  dead: l.bornDead,
                  weanedCount: l.weaned,
                  weaningWeight: l.weaningWeightGrams,
                  survivalRate: r,
                },
                node: (
                  <TableRow key={l.breedingId} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${l.breeding.doe.id}`} className="hover:underline">
                        {l.breeding.doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{l.breeding.doe.breed ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{l.breeding.buck?.tagId ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <LocalDate date={l.kindlingDate} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <LocalDate date={l.weaningDate} locale={locale} />
                    </TableCell>
                    <TableCell>{l.bornAlive}</TableCell>
                    <TableCell>{l.bornDead || "—"}</TableCell>
                    <TableCell>
                      <LitterCountInput
                        breedingId={l.breedingId}
                        field="weaned"
                        value={l.weaned}
                        locale={locale}
                        className="w-12"
                      />
                    </TableCell>
                    <TableCell>
                      <LitterWeightInput
                        breedingId={l.breedingId}
                        valueGrams={l.weaningWeightGrams}
                        locale={locale}
                        className="w-16"
                      />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {r != null ? (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          {Math.round(r * 100)}%
                        </span>
                      ) : (
                        "—"
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
