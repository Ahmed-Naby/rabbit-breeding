import { Layers } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import type { LocalDeceasedRabbit } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { SortableTh } from "@/components/sortable-th";
import { TablePager } from "@/components/ui/table-pager";
import { LogCountBadge } from "@/components/log-count-badge";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { EmptyState } from "@/components/page-header";

export function CullingLog({
  culledRabbits,
  locale,
  todayOnly,
}: {
  culledRabbits: LocalDeceasedRabbit[];
  locale: Locale;
  todayOnly?: boolean;
}) {
  const culledSort = useSortableRows(culledRabbits, {
    date: { type: "date", value: (r) => r.updatedAt },
    tag: { type: "tag", value: (r) => r.retiredTagId ?? r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    sex: { type: "string", value: (r) => r.sex },
  });

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "سجل الاستبعادات" : "Culling Record"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        <LogCountBadge count={culledRabbits.length} />
      </h2>
      {culledRabbits.length === 0 ? (
        <EmptyState icon={Layers} title={locale === "ar" ? "لا يوجد حيوانات مستبعدة" : "No culled rabbits"} />
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "التاريخ" : "Date"}
                  sortKey="date"
                  activeSortKey={culledSort.sortKey}
                  direction={culledSort.direction}
                  onSort={culledSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الأرنب" : "Rabbit Tag ID"}
                  sortKey="tag"
                  activeSortKey={culledSort.sortKey}
                  direction={culledSort.direction}
                  onSort={culledSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "السلالة" : "Breed"}
                  sortKey="breed"
                  activeSortKey={culledSort.sortKey}
                  direction={culledSort.direction}
                  onSort={culledSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "الجنس" : "Sex"}
                  sortKey="sex"
                  activeSortKey={culledSort.sortKey}
                  direction={culledSort.direction}
                  onSort={culledSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {culledSort.paged.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5 text-center">
                    <LocalDate date={new Date(entry.updatedAt)} />
                  </td>
                  <td className="px-4 py-3.5 font-bold">{entry.retiredTagId ?? entry.tagId ?? "—"}</td>
                  <td className="px-4 py-3.5">{entry.breed ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    {entry.sex === "doe" ? (locale === "ar" ? "أنثى" : "Doe") : (locale === "ar" ? "ذكر" : "Buck")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={culledSort.page}
            total={culledSort.sorted.length}
            pageSize={culledSort.pageSize}
            onPageChange={culledSort.setPage}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
