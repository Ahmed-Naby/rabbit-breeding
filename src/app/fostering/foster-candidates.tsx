import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SortableTable } from "@/components/ui/sortable-table";
import { TableRow, TableCell } from "@/components/ui/table";
import { LocalDate } from "@/components/local-date";
import type { FosterCandidate } from "@/lib/fostering";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

/**
 * One of the two fostering lists. Read-only on purpose — it tells the
 * supervisor which does are worth looking at; picking the pair and the count
 * stays in the foster form below.
 */
function CandidateList({
  candidates,
  title,
  description,
  emptyTitle,
  locale,
  t,
}: {
  candidates: FosterCandidate[];
  title: string;
  description: string;
  emptyTitle: string;
  locale: Locale;
  t: Dictionary["fostering"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-0">
        {candidates.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={HeartHandshake} title={emptyTitle} />
          </div>
        ) : (
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.colIndex, className: "text-center", sortable: false },
              { key: "tagId", label: t.colDoe, type: "tag", className: "text-center" },
              { key: "cage", label: t.colCage, type: "tag", className: "hidden text-center sm:table-cell" },
              { key: "kindlingDate", label: t.colKindlingDate, type: "date", className: "text-center" },
              { key: "kits", label: t.colKits, type: "number", className: "text-center" },
            ]}
            rows={candidates.map((c, i) => ({
              key: c.doeId,
              sortValues: {
                tagId: c.tagId,
                cage: c.cage,
                kindlingDate: c.kindlingDate,
                kits: c.kits,
              },
              node: (
                <TableRow key={c.doeId} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  {/* The doe number is what gets typed into the form below, so
                      it stays the loudest thing in the row — a farmer reading
                      fast must not grab the kit count by mistake. */}
                  <TableCell className="text-base font-bold">
                    <Link href={`/rabbits/${c.doeId}`} className="hover:underline">
                      {c.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{c.cage ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={c.kindlingDate} locale={locale} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{c.kits}</TableCell>
                </TableRow>
              ),
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** The pair of lists: does to move kits out of, and does to move them into. */
export function FosterCandidates({
  large,
  small,
  windowDays,
  highKits,
  lowKits,
  locale,
  t,
}: {
  large: FosterCandidate[];
  small: FosterCandidate[];
  windowDays: number;
  highKits: number;
  lowKits: number;
  locale: Locale;
  t: Dictionary["fostering"];
}) {
  const fill = (template: string, kits: number) =>
    template.replace("{days}", String(windowDays)).replace("{n}", String(kits));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CandidateList
        candidates={large}
        title={t.highTitle}
        description={fill(t.highDescription, highKits)}
        emptyTitle={t.highEmpty}
        locale={locale}
        t={t}
      />
      <CandidateList
        candidates={small}
        title={t.lowTitle}
        description={fill(t.lowDescription, lowKits)}
        emptyTitle={t.lowEmpty}
        locale={locale}
        t={t}
      />
    </div>
  );
}
