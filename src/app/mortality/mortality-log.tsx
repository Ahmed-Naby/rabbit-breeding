import Link from "next/link";
import { Skull } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { LogCountBadge, LogStatBadge } from "@/components/log-count-badge";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { KitDeathRow } from "./kit-deaths";

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
  kitDeaths,
  locale,
  t,
  todayOnly,
}: {
  deceasedMothers: DeceasedTaggedRow[];
  deceasedBucks: DeceasedTaggedRow[];
  deceasedStock: DeceasedStockRow[];
  kitDeaths: KitDeathRow[];
  locale: Locale;
  t: Dictionary;
  todayOnly?: boolean;
}) {
  const suffix = todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : "";
  // Two tables, not one with a «المرحلة» column: نافق النتاج is a loss on a
  // named mother's litter, نافق الفطام is a deduction from the farm-wide رصيد
  // الفطام with no mother at all — so half the columns were always «—» on one
  // side or the other.
  const nursingKitDeaths = kitDeaths.filter((r) => r.stage === "nursing");
  const weanedKitDeaths = kitDeaths.filter((r) => r.stage === "weaned");
  // Rows are presses, not kits — five kits lost in one press is one row, so the
  // row-count badge alone would badly understate the loss.
  const sumKits = (rows: KitDeathRow[]) => rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <>
      {/* نافق النتاج — الرضع عند الأم (KitDeathLog) */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {t.mortality.kitDeathsHeading(nursingKitDeaths.length)}
          {suffix}
          <LogCountBadge count={nursingKitDeaths.length} />
          {sumKits(nursingKitDeaths) > 0 && (
            <LogStatBadge
              label={t.mortality.kitDeathsTotalLabel}
              value={sumKits(nursingKitDeaths).toLocaleString()}
            />
          )}
        </h2>
        {nursingKitDeaths.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.kitDeathsEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
                { key: "date", label: t.mortality.colDeathDate, type: "date", className: "text-center" },
                { key: "tag", label: t.mortality.colMotherTag, type: "tag", className: "text-center" },
                { key: "kindling", label: t.mortality.colKindlingDate, type: "date", className: "text-center" },
                { key: "count", label: t.mortality.colCount, type: "number", className: "text-center" },
              ]}
              rows={nursingKitDeaths.map((r, i) => ({
                key: r.id,
                sortValues: {
                  date: r.date,
                  tag: r.doeTag,
                  kindling: r.kindlingDate,
                  count: r.count,
                },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <LocalDate date={r.date} locale={locale} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.doeId && r.doeTag ? (
                        <Link href={`/rabbits/${r.doeId}`} className="hover:underline">
                          {r.doeTag}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {r.kindlingDate ? <LocalDate date={r.kindlingDate} locale={locale} /> : "—"}
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">{r.count}</TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* نافق الفطام — خصم من رصيد الفطام (KitStockMovement) */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {t.mortality.weanedKitDeathsHeading(weanedKitDeaths.length)}
          {suffix}
          <LogCountBadge count={weanedKitDeaths.length} />
          {sumKits(weanedKitDeaths) > 0 && (
            <LogStatBadge
              label={t.mortality.kitDeathsTotalLabel}
              value={sumKits(weanedKitDeaths).toLocaleString()}
            />
          )}
        </h2>
        {weanedKitDeaths.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.weanedKitDeathsEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
                { key: "date", label: t.mortality.colDeathDate, type: "date", className: "text-center" },
                { key: "count", label: t.mortality.colCount, type: "number", className: "text-center" },
              ]}
              rows={weanedKitDeaths.map((r, i) => ({
                key: r.id,
                sortValues: { date: r.date, count: r.count },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <LocalDate date={r.date} locale={locale} />
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">{r.count}</TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

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
