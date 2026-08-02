import { Layers } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import type { LocalDeceasedRabbit, LocalKitDeath } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { SortableTh } from "@/components/sortable-th";
import { TablePager } from "@/components/ui/table-pager";
import { LogCountBadge } from "@/components/log-count-badge";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { EmptyState } from "@/components/page-header";
import { LogTabs } from "@/components/log-tabs";
import { toDateInputValue } from "@/lib/dates";
import { ExportXlsxButton } from "@/components/export-xlsx-button";
import { saveBinaryFile } from "../lib/save-file";
import type { LogSheetSpec } from "@/lib/sheets/log-sheets";

export function MortalityLog({
  deceasedRabbits,
  kitDeaths,
  locale,
  todayOnly,
}: {
  deceasedRabbits: LocalDeceasedRabbit[];
  kitDeaths: LocalKitDeath[];
  locale: Locale;
  todayOnly?: boolean;
}) {
  // Two tables, not one with a «المرحلة» column: نافق النتاج is a loss on a
  // named mother's litter, نافق الفطام is a deduction from the farm-wide رصيد
  // الفطام with no mother at all.
  const nursingKitDeaths = kitDeaths.filter((r) => r.stage === "nursing");
  const weanedKitDeaths = kitDeaths.filter((r) => r.stage === "weaned");
  // Rows are presses, not kits — five kits lost in one press is one row.
  const sumKits = (rows: LocalKitDeath[]) => rows.reduce((sum, r) => sum + r.count, 0);
  const kitSort = useSortableRows(nursingKitDeaths, {
    date: { type: "date", value: (r) => r.date },
    tag: { type: "tag", value: (r) => r.doeTag },
    count: { type: "number", value: (r) => r.count },
  });
  // One row per day rather than per press: رصيد الفطام is a farm-wide pool, so
  // two presses on the same day are the same day's loss with nothing to tell
  // them apart — the log read as a column of 1s instead of a daily figure.
  // Keyed by local calendar day, the same key isWithinDateRange() filters on.
  const weanedByDay = weanedKitDeaths.reduce<{ day: string; date: string; count: number }[]>(
    (days, r) => {
      const day = toDateInputValue(new Date(r.date));
      const existing = days.find((d) => d.day === day);
      if (existing) existing.count += r.count;
      else days.push({ day, date: r.date, count: r.count });
      return days;
    },
    []
  );
  const weanedKitSort = useSortableRows(weanedByDay, {
    date: { type: "date", value: (r) => r.date },
    count: { type: "number", value: (r) => r.count },
  });
  // Split the way the web log splits (see src/app/mortality/page.tsx): a
  // deceased rabbit's tagId is cleared so the number can be reused, so "was
  // this ever tagged" has to look at retiredTagId too — otherwise every doe
  // that died would fall into the untagged سلالات bucket.
  const wasTagged = (r: LocalDeceasedRabbit) => r.tagId != null || r.retiredTagId != null;
  const deceasedMothers = deceasedRabbits.filter((r) => r.sex === "doe" && wasTagged(r));
  const deceasedBucks = deceasedRabbits.filter((r) => r.sex === "buck" && wasTagged(r));
  const deceasedStock = deceasedRabbits.filter((r) => !wasTagged(r));
  const taggedSortSpec = {
    date: { type: "date" as const, value: (r: LocalDeceasedRabbit) => r.updatedAt },
    tag: { type: "tag" as const, value: (r: LocalDeceasedRabbit) => r.retiredTagId ?? r.tagId },
    breed: { type: "string" as const, value: (r: LocalDeceasedRabbit) => r.breed },
  };
  const motherSort = useSortableRows(deceasedMothers, taggedSortSpec);
  const buckSort = useSortableRows(deceasedBucks, taggedSortSpec);
  const stockSort = useSortableRows(deceasedStock, {
    date: { type: "date", value: (r) => r.updatedAt },
    breed: { type: "string", value: (r) => r.breed },
    sex: { type: "string", value: (r) => r.sex },
  });

  // saveBinaryFile: on Android a Blob download silently does nothing, so the
  // file has to go out through the share sheet.
  const exportButton = (spec: LogSheetSpec) => (
    <ExportXlsxButton className="ms-auto" locale={locale} save={saveBinaryFile} spec={spec} />
  );

  // نافق النتاج — الرضع عند الأم (kit_death_log)
  const nursingPanel = (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "نافق النتاج" : "Nursing kit deaths"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        {/* Kits, not rows — five kits lost in one press is one row. */}
        <LogCountBadge count={sumKits(nursingKitDeaths)} showZero />
        {exportButton({
          kind: "nursingKitDeaths",
          rows: nursingKitDeaths.map((r) => ({ date: r.date, doeTag: r.doeTag, count: r.count })),
        })}
      </h2>
      {nursingKitDeaths.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={locale === "ar" ? "لا يوجد نافق نتاج مسجل" : "No nursing kit deaths recorded"}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <TablePager
            page={kitSort.page}
            total={kitSort.sorted.length}
            pageSize={kitSort.pageSize}
            onPageChange={kitSort.setPage}
            locale={locale}
            placement="top"
          />
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ النفوق" : "Date of death"}
                  sortKey="date"
                  activeSortKey={kitSort.sortKey}
                  direction={kitSort.direction}
                  onSort={kitSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الأم" : "Mother"}
                  sortKey="tag"
                  activeSortKey={kitSort.sortKey}
                  direction={kitSort.direction}
                  onSort={kitSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "العدد" : "Count"}
                  sortKey="count"
                  activeSortKey={kitSort.sortKey}
                  direction={kitSort.direction}
                  onSort={kitSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {kitSort.paged.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5">
                    <LocalDate date={new Date(entry.date)} />
                  </td>
                  <td className="px-4 py-3.5 font-bold">{entry.doeTag ?? "—"}</td>
                  <td className="px-4 py-3.5 font-bold tabular-nums">{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={kitSort.page}
            total={kitSort.sorted.length}
            pageSize={kitSort.pageSize}
            onPageChange={kitSort.setPage}
            locale={locale}
          />
        </div>
      )}
    </div>
  );

  // نافق الفطام — خصم من رصيد الفطام (kit_stock_movement)
  const weanedPanel = (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "نافق الفطام" : "Weaned kit deaths"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        {/* Kits, not rows — see نافق النتاج above. */}
        <LogCountBadge count={sumKits(weanedKitDeaths)} showZero />
        {/* The by-day rollup the table shows, not the raw presses. */}
        {exportButton({
          kind: "weanedKitDeaths",
          rows: weanedByDay.map((r) => ({ date: r.date, count: r.count })),
        })}
      </h2>
      {weanedKitDeaths.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={locale === "ar" ? "لا يوجد نافق فطام مسجل" : "No weaned kit deaths recorded"}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <TablePager
            page={weanedKitSort.page}
            total={weanedKitSort.sorted.length}
            pageSize={weanedKitSort.pageSize}
            onPageChange={weanedKitSort.setPage}
            locale={locale}
            placement="top"
          />
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ النفوق" : "Date of death"}
                  sortKey="date"
                  activeSortKey={weanedKitSort.sortKey}
                  direction={weanedKitSort.direction}
                  onSort={weanedKitSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "العدد" : "Count"}
                  sortKey="count"
                  activeSortKey={weanedKitSort.sortKey}
                  direction={weanedKitSort.direction}
                  onSort={weanedKitSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {weanedKitSort.paged.map((entry) => (
                <tr key={entry.day} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5">
                    <LocalDate date={new Date(entry.date)} />
                  </td>
                  <td className="px-4 py-3.5 font-bold tabular-nums">{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={weanedKitSort.page}
            total={weanedKitSort.sorted.length}
            pageSize={weanedKitSort.pageSize}
            onPageChange={weanedKitSort.setPage}
            locale={locale}
          />
        </div>
      )}
    </div>
  );

  // The أمهات and ذكور logs are the same table down to the column widths — only
  // the heading and the tag label differ — so one renderer serves both.
  const taggedPanel = (
    heading: string,
    emptyTitle: string,
    tagLabel: string,
    sort: typeof motherSort,
    kind: "deceasedDoes" | "deceasedBucks"
  ) => (
    <div className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
        {heading}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        {/* Rows, not kits — one dead doe is one row, so the sorted length is
            the count. Reads the filtered rows so it follows the date range. */}
        <LogCountBadge count={sort.sorted.length} showZero />
        {exportButton({
          kind,
          rows: sort.sorted.map((r) => ({
            date: r.updatedAt,
            // retiredTagId first: a dead rabbit's tag is freed for reuse.
            tag: r.retiredTagId ?? r.tagId,
            breed: r.breed,
          })),
        })}
      </h2>
      {sort.sorted.length === 0 ? (
        <EmptyState icon={Layers} title={emptyTitle} />
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <TablePager
            page={sort.page}
            total={sort.sorted.length}
            pageSize={sort.pageSize}
            onPageChange={sort.setPage}
            locale={locale}
            placement="top"
          />
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "التاريخ" : "Date"}
                  sortKey="date"
                  activeSortKey={sort.sortKey}
                  direction={sort.direction}
                  onSort={sort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={tagLabel}
                  sortKey="tag"
                  activeSortKey={sort.sortKey}
                  direction={sort.direction}
                  onSort={sort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "السلالة" : "Breed"}
                  sortKey="breed"
                  activeSortKey={sort.sortKey}
                  direction={sort.direction}
                  onSort={sort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sort.paged.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5 text-center">
                    <LocalDate date={new Date(entry.updatedAt)} />
                  </td>
                  <td className="px-4 py-3.5 font-bold">{entry.retiredTagId ?? entry.tagId ?? "—"}</td>
                  <td className="px-4 py-3.5">{entry.breed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={sort.page}
            total={sort.sorted.length}
            pageSize={sort.pageSize}
            onPageChange={sort.setPage}
            locale={locale}
          />
        </div>
      )}
    </div>
  );

  // السلالات النافقة — الأرانب من غير رقم، فالجنس بيقوم مقام الرقم
  const stockPanel = (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "السلالات النافقة" : "Deceased juveniles"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        <LogCountBadge count={stockSort.sorted.length} showZero />
        {exportButton({
          kind: "deceasedStock",
          rows: stockSort.sorted.map((r) => ({ date: r.updatedAt, sex: r.sex, breed: r.breed })),
        })}
      </h2>
      {deceasedStock.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={locale === "ar" ? "لا توجد سلالات نافقة مسجلة" : "No deceased juveniles logged"}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <TablePager
            page={stockSort.page}
            total={stockSort.sorted.length}
            pageSize={stockSort.pageSize}
            onPageChange={stockSort.setPage}
            locale={locale}
            placement="top"
          />
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "التاريخ" : "Date"}
                  sortKey="date"
                  activeSortKey={stockSort.sortKey}
                  direction={stockSort.direction}
                  onSort={stockSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "الجنس" : "Sex"}
                  sortKey="sex"
                  activeSortKey={stockSort.sortKey}
                  direction={stockSort.direction}
                  onSort={stockSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "السلالة" : "Breed"}
                  sortKey="breed"
                  activeSortKey={stockSort.sortKey}
                  direction={stockSort.direction}
                  onSort={stockSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {stockSort.paged.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5 text-center">
                    <LocalDate date={new Date(entry.updatedAt)} />
                  </td>
                  <td className="px-4 py-3.5 font-bold">
                    {entry.sex === "doe" ? (locale === "ar" ? "أنثى" : "Doe") : (locale === "ar" ? "ذكر" : "Buck")}
                  </td>
                  <td className="px-4 py-3.5">{entry.breed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={stockSort.page}
            total={stockSort.sorted.length}
            pageSize={stockSort.pageSize}
            onPageChange={stockSort.setPage}
            locale={locale}
          />
        </div>
      )}
    </div>
  );

  // One tab per table instead of five stacked ones: they answer different
  // questions (a litter loss, a stock deduction, a dead adult) and nobody reads
  // them together — stacked, the last three were a scroll away from the strip.
  // Same five tabs as the web log, split on the same tagged/untagged rule — and
  // like it, the two kit tabs count kits rather than rows, since a row is one
  // press and a الفطام row is a whole day.
  return (
    <LogTabs
      tabs={[
        {
          key: "nursing",
          label: locale === "ar" ? "نافق النتاج" : "Nursing kits",
          count: sumKits(nursingKitDeaths),
          node: nursingPanel,
        },
        {
          key: "weaned",
          label: locale === "ar" ? "نافق الفطام" : "Weaned kits",
          count: sumKits(weanedKitDeaths),
          node: weanedPanel,
        },
        {
          key: "does",
          label: locale === "ar" ? "الأمهات النافقة" : "Deceased does",
          count: deceasedMothers.length,
          node: taggedPanel(
            locale === "ar" ? "الأمهات النافقة" : "Deceased does",
            locale === "ar" ? "لا توجد أمهات نافقة مسجلة" : "No deceased does logged",
            locale === "ar" ? "رقم الأم" : "Mother",
            motherSort,
            "deceasedDoes"
          ),
        },
        {
          key: "bucks",
          label: locale === "ar" ? "الذكور النافقة" : "Deceased bucks",
          count: deceasedBucks.length,
          node: taggedPanel(
            locale === "ar" ? "الذكور النافقة" : "Deceased bucks",
            locale === "ar" ? "لا توجد ذكور نافقة مسجلة" : "No deceased bucks logged",
            locale === "ar" ? "رقم الذكر" : "Buck",
            buckSort,
            "deceasedBucks"
          ),
        },
        {
          key: "strains",
          label: locale === "ar" ? "السلالات النافقة" : "Deceased juveniles",
          count: deceasedStock.length,
          node: stockPanel,
        },
      ]}
    />
  );
}
