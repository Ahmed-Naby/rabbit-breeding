import Link from "next/link";
import { Skull } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export type DeceasedTaggedRow = {
  id: string;
  tagId: string | null;
  retiredTagId: string | null;
  breed: string | null;
  updatedAt: Date;
};

export type DeceasedStockRow = {
  id: string;
  sex: string;
  breed: string | null;
  updatedAt: Date;
};

/** سجلات النافق: three species-split deceased history tables (mothers/bucks/strains). */
export function MortalityLog({
  deceasedMothers,
  deceasedBucks,
  deceasedStock,
  locale,
  t,
  todayOnly,
}: {
  deceasedMothers: DeceasedTaggedRow[];
  deceasedBucks: DeceasedTaggedRow[];
  deceasedStock: DeceasedStockRow[];
  locale: Locale;
  t: Dictionary;
  todayOnly?: boolean;
}) {
  const suffix = todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : "";

  return (
    <>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.mortality.deceasedMothersHeading(deceasedMothers.length)}
          {suffix}
        </h2>
        {deceasedMothers.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.deceasedMothersEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: t.mortality.colMotherTag, type: "tag", className: "text-center" },
                { key: "breed", label: t.mortality.colBreed, type: "string", className: "text-center" },
                { key: "date", label: t.mortality.colRegisteredDate, type: "date", className: "text-center" },
              ]}
              rows={deceasedMothers.map((r, i) => ({
                key: r.id,
                sortValues: { tag: r.retiredTagId ?? r.tagId, breed: r.breed, date: r.updatedAt },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        {r.retiredTagId ?? r.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>
                      <LocalDate date={r.updatedAt} locale={locale} />
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.mortality.deceasedBucksHeading(deceasedBucks.length)}
          {suffix}
        </h2>
        {deceasedBucks.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.deceasedBucksEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: t.mortality.colBuckTag, type: "tag", className: "text-center" },
                { key: "breed", label: t.mortality.colBreed, type: "string", className: "text-center" },
                { key: "date", label: t.mortality.colRegisteredDate, type: "date", className: "text-center" },
              ]}
              rows={deceasedBucks.map((r, i) => ({
                key: r.id,
                sortValues: { tag: r.retiredTagId ?? r.tagId, breed: r.breed, date: r.updatedAt },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        {r.retiredTagId ?? r.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>
                      <LocalDate date={r.updatedAt} locale={locale} />
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.mortality.deceasedStrainsHeading(deceasedStock.length)}
          {suffix}
        </h2>
        {deceasedStock.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.deceasedStrainsEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
                { key: "sex", label: t.mortality.colSex, type: "string", className: "text-center" },
                { key: "breed", label: t.mortality.colStrainBreed, type: "string", className: "text-center" },
                { key: "date", label: t.mortality.colRegisteredDate, type: "date", className: "text-center" },
              ]}
              rows={deceasedStock.map((r, i) => ({
                key: r.id,
                sortValues: { sex: r.sex, breed: r.breed, date: r.updatedAt },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        <StatusBadge value={r.sex} locale={locale} />
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>
                      <LocalDate date={r.updatedAt} locale={locale} />
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>
    </>
  );
}
