import Link from "next/link";
import { Rabbit as RabbitIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { formatWeight, gramsToKg } from "@/lib/units";
import { getSettings } from "@/lib/settings";
import { getBreedOptions } from "@/lib/breeds";
import { AddBuckForm } from "./add-buck-form";
import { PendingBucksTable, type PendingBuckRow } from "./pending-bucks-table";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.bucks.title} · RabbitTrack` };
}

export default async function BucksPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  // Every buck promoted to the herd (has a tagId) — a plain reference table,
  // mirrors /mothers for the buck side of the herd.
  const [bucks, pendingBucksRaw, settings, breedOptions, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "buck", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      orderBy: { tagId: "asc" },
      include: {
        weightRecords: {
          orderBy: { date: "desc" },
          take: 1,
          select: { weightGrams: true },
        },
      },
    }),
    // Bucks explicitly moved from /stock's nursery pen (see promoteToHerdPen),
    // waiting for their رقم الذكر here (see PendingBucksTable / finalizeBuck).
    prisma.rabbit.findMany({
      where: { sex: "buck", tagId: null, movedToHerdPen: true, status: { notIn: ["deceased", "culled"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        breed: true,
        cage: true,
        weightRecords: {
          orderBy: { date: "desc" },
          take: 1,
          select: { weightGrams: true },
        },
      },
    }),
    getSettings(),
    getBreedOptions(),
    getDictionary(),
  ]);
  const pendingBucks: PendingBuckRow[] = pendingBucksRaw.map((r) => ({
    id: r.id,
    breed: r.breed,
    cage: r.cage,
    weightKg: r.weightRecords[0] ? gramsToKg(r.weightRecords[0].weightGrams) : null,
  }));

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <PageHeader title={t.bucks.title} description={t.bucks.description(bucks.length)} />
      )}

      <AddBuckForm breedOptions={breedOptions} tCommon={t.common} locale={locale} />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.bucks.pendingHeading(pendingBucks.length)}
        </h2>
        <PendingBucksTable rows={pendingBucks} locale={locale} />
      </div>

      {bucks.length === 0 ? (
        <EmptyState
          icon={RabbitIcon}
          title={t.bucks.emptyTitle}
          description={t.bucks.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.bucks.colIndex, className: "text-center", sortable: false },
              { key: "tag", label: t.bucks.colTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.bucks.colBreed, type: "string", className: "text-center" },
              { key: "addedDate", label: t.bucks.colAddedDate, type: "date", className: "text-center" },
              { key: "weight", label: t.bucks.colWeight, type: "number", className: "text-center" },
              { key: "status", label: t.bucks.colStatus, type: "string", className: "text-center" },
            ]}
            rows={bucks.map((buck, i) => ({
              key: buck.id,
              sortValues: {
                tag: buck.tagId,
                breed: buck.breed,
                addedDate: buck.acquiredDate,
                weight: buck.weightRecords[0]?.weightGrams,
                status: buck.status,
              },
              node: (
                <TableRow key={buck.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${buck.id}`} className="hover:underline">
                      {buck.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{buck.breed ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={buck.acquiredDate} locale={locale} />
                  </TableCell>
                  <TableCell>
                    {buck.weightRecords[0]
                      ? formatWeight(
                          buck.weightRecords[0].weightGrams,
                          settings.weightUnit as "kg" | "lb_oz",
                          locale
                        )
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={buck.status} locale={locale} />
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
