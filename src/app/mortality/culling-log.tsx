import Link from "next/link";
import { Skull } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export type CulledRow = {
  id: string;
  sex: string;
  tagId: string | null;
  retiredTagId: string | null;
  breed: string | null;
  updatedAt: Date;
};

/** سجل الاستبعادات: every rabbit toggled to "culled" status, most recently updated first. */
export function CullingLog({
  culledRabbits,
  locale,
  t,
  todayOnly,
}: {
  culledRabbits: CulledRow[];
  locale: Locale;
  t: Dictionary;
  todayOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {t.mortality.culledHeading(culledRabbits.length)}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
      </h2>
      {culledRabbits.length === 0 ? (
        <EmptyState icon={Skull} title={t.mortality.culledEmptyTitle} />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
              { key: "sex", label: t.mortality.colSex, type: "string", className: "text-center" },
              { key: "tag", label: t.mortality.colTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.mortality.colBreed, type: "string", className: "text-center" },
              { key: "date", label: t.mortality.colRegisteredDate, type: "date", className: "text-center" },
            ]}
            rows={culledRabbits.map((r, i) => ({
              key: r.id,
              sortValues: { sex: r.sex, tag: r.retiredTagId ?? r.tagId, breed: r.breed, date: r.updatedAt },
              node: (
                <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <StatusBadge value={r.sex} locale={locale} />
                  </TableCell>
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
  );
}
