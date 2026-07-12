import Link from "next/link";
import { Rabbit as RabbitIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { formatWeight, gramsToKg } from "@/lib/units";
import { getSettings } from "@/lib/settings";
import { getBreedOptions } from "@/lib/breeds";
import { DoeStateBadge } from "../does/doe-state-menu";
import { AddMotherForm } from "./add-mother-form";
import { PendingMothersTable, type PendingMotherRow } from "./pending-mothers-table";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.mothers.title} · RabbitTrack` };
}

export default async function MothersPage() {
  // Every doe promoted to the herd (has a tagId) — a plain reference table,
  // not the breeding-workflow board (that's "عمليات المزرعة" at /does).
  const [does, pendingMothersRaw, settings, breedOptions, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: { not: "deceased" } },
      orderBy: { tagId: "asc" },
      include: {
        weightRecords: {
          orderBy: { date: "desc" },
          take: 1,
          select: { weightGrams: true },
        },
      },
    }),
    // Does explicitly moved from /stock's nursery pen (see promoteToHerdPen),
    // waiting for their رقم الأم here (see PendingMothersTable / finalizeMother).
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: null, movedToHerdPen: true, status: { not: "deceased" } },
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
  const pendingMothers: PendingMotherRow[] = pendingMothersRaw.map((r) => ({
    id: r.id,
    breed: r.breed,
    cage: r.cage,
    weightKg: r.weightRecords[0] ? gramsToKg(r.weightRecords[0].weightGrams) : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title={t.mothers.title} description={t.mothers.description(does.length)} />

      <AddMotherForm breedOptions={breedOptions} tCommon={t.common} locale={locale} />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.mothers.pendingHeading(pendingMothers.length)}
        </h2>
        <PendingMothersTable rows={pendingMothers} locale={locale} />
      </div>

      {does.length === 0 ? (
        <EmptyState
          icon={RabbitIcon}
          title={t.mothers.emptyTitle}
          description={t.mothers.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x">
                <TableHead className="text-center">{t.mothers.colIndex}</TableHead>
                <TableHead className="text-center">{t.mothers.colTag}</TableHead>
                <TableHead className="text-center">{t.mothers.colBreed}</TableHead>
                <TableHead className="text-center">{t.mothers.colAddedDate}</TableHead>
                <TableHead className="text-center">{t.mothers.colWeight}</TableHead>
                <TableHead className="text-center">{t.mothers.colStatus}</TableHead>
                <TableHead className="text-center">{t.mothers.colDoeState}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {does.map((doe, i) => (
                <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                      {doe.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{doe.breed ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={doe.acquiredDate} locale={locale} />
                  </TableCell>
                  <TableCell>
                    {doe.weightRecords[0]
                      ? formatWeight(
                          doe.weightRecords[0].weightGrams,
                          settings.weightUnit as "kg" | "lb_oz",
                          locale
                        )
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={doe.status} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <DoeStateBadge current={doe.doeState} locale={locale} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
