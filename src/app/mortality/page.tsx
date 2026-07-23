import Link from "next/link";
import { Skull } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  NursingKitDeathButton,
  WeaningStockDeathButton,
  MarkDeceasedButton,
} from "./mortality-actions";
import { getKitStockSummary } from "../weaning-sales/stock";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { resolveNursingLitterRow, isNursingKitDeathCandidate } from "@/lib/breeding-filters";
import { isToday } from "@/lib/dates";
import { MortalityLog } from "./mortality-log";
import { CullingLog } from "./culling-log";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.mortality.title} · RabbitTrack` };
}

export default async function MortalityPage({
  hideHeader,
  todayOnly,
}: {
  hideHeader?: boolean;
  todayOnly?: boolean;
} = {}) {
  const [
    nursingDoesRaw,
    activeMothers,
    activeBucks,
    activeStock,
    deceasedMothersRaw,
    deceasedBucksRaw,
    deceasedStockRaw,
    culledRabbitsRaw,
    { availableStock },
    { locale, t },
  ] = await Promise.all([
    // Same "current litter for a doe" resolution as /does — reused here
    // rather than re-derived, then narrowed below to does actually nursing
    // live (bornAlive > 0), unweaned kits right now.
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      select: {
        id: true,
        tagId: true,
        breed: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            actualKindlingDate: true,
            litter: { select: { bornAlive: true, bornDead: true, weaningDate: true } },
          },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      select: { id: true, tagId: true, breed: true },
      orderBy: { tagId: "asc" },
    }),
    prisma.rabbit.findMany({
      where: { sex: "buck", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      select: { id: true, tagId: true, breed: true },
      orderBy: { tagId: "asc" },
    }),
    prisma.rabbit.findMany({
      where: { tagId: null, status: { notIn: ["deceased", "culled"] } },
      select: { id: true, sex: true, breed: true, cage: true },
      orderBy: { createdAt: "desc" },
    }),
    // A deceased rabbit's tagId is cleared (see setRabbitStatusOp's tag-
    // retiring logic) so the number can be reused — "was this ever a
    // tagged mother/buck" has to be checked via retiredTagId too, or every
    // rabbit that died after this feature shipped would wrongly fall into
    // the untagged "سلالات" bucket below.
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        status: "deceased",
        OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
      },
      select: { id: true, tagId: true, retiredTagId: true, breed: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.rabbit.findMany({
      where: {
        sex: "buck",
        status: "deceased",
        OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
      },
      select: { id: true, tagId: true, retiredTagId: true, breed: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.rabbit.findMany({
      where: { tagId: null, retiredTagId: null, status: "deceased" },
      select: { id: true, sex: true, breed: true, cage: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    // Culled does/bucks only reach "culled" via the availability toggle on
    // /rounds and /bucks-rounds, which only ever targets tagged rabbits — so
    // unlike the deceased log there's no untagged-strains bucket to cover.
    prisma.rabbit.findMany({
      where: {
        status: "culled",
        OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
      },
      select: { id: true, tagId: true, retiredTagId: true, breed: true, sex: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    getKitStockSummary(),
    getDictionary(),
  ]);

  const nursingDoes = nursingDoesRaw
    .map((doe) => {
      const litterRow = resolveNursingLitterRow(doe.breedingsAsDoe);
      if (!litterRow || !isNursingKitDeathCandidate(litterRow)) return null;
      return { doe, breedingId: litterRow.id, litter: litterRow.litter! };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  const deceasedMothers = todayOnly
    ? deceasedMothersRaw.filter((r) => isToday(r.updatedAt))
    : deceasedMothersRaw;
  const deceasedBucks = todayOnly
    ? deceasedBucksRaw.filter((r) => isToday(r.updatedAt))
    : deceasedBucksRaw;
  const deceasedStock = todayOnly
    ? deceasedStockRaw.filter((r) => isToday(r.updatedAt))
    : deceasedStockRaw;
  const culledRabbits = todayOnly
    ? culledRabbitsRaw.filter((r) => isToday(r.updatedAt))
    : culledRabbitsRaw;

  return (
    <div className="space-y-8">
      {!hideHeader && (
        <PageHeader title={t.mortality.title} description={t.mortality.description} />
      )}

      {/* رضيع الرضاعة */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.nursingSectionTitle}</h2>
        {nursingDoes.length === 0 ? (
          <EmptyState
            icon={Skull}
            title={t.mortality.nursingEmptyTitle}
            description={t.mortality.nursingEmptyDescription}
          />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: t.mortality.colMotherTag, type: "tag", className: "text-center" },
                { key: "breed", label: t.mortality.colBreed, type: "string", className: "text-center" },
                { key: "alive", label: t.mortality.colAlive, type: "number", className: "text-center" },
                { key: "dead", label: t.mortality.colDead, type: "number", className: "text-center" },
                { key: "action", label: t.mortality.colRecordDeath, className: "text-center", sortable: false },
              ]}
              rows={nursingDoes.map(({ doe, breedingId, litter }, i) => ({
                key: doe.id,
                sortValues: { tag: doe.tagId, breed: doe.breed, alive: litter.bornAlive, dead: litter.bornDead },
                node: (
                  <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                        {doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{doe.breed ?? "—"}</TableCell>
                    <TableCell>{litter.bornAlive}</TableCell>
                    <TableCell>{litter.bornDead}</TableCell>
                    <TableCell>
                      <NursingKitDeathButton
                        breedingId={breedingId}
                        bornAlive={litter.bornAlive}
                        locale={locale}
                      />
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* نافق الفطام: مخزون الرضع بعد الفطام وقبل البيع */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.mortality.weaningStockSectionTitle}
        </h2>
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs text-muted-foreground">
                {t.mortality.availableWeanedStockLabel}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{availableStock}</p>
            </div>
            <WeaningStockDeathButton locale={locale} availableStock={availableStock} />
          </CardContent>
        </Card>
      </div>

      {/* نافق الأمهات */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.mothersSectionTitle}</h2>
        {activeMothers.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.mothersEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: t.mortality.colMotherTag, type: "tag", className: "text-center" },
                { key: "breed", label: t.mortality.colBreed, type: "string", className: "text-center" },
                { key: "action", label: t.mortality.colRecordDeceased, className: "text-center", sortable: false },
              ]}
              rows={activeMothers.map((r, i) => ({
                key: r.id,
                sortValues: { tag: r.tagId, breed: r.breed },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        {r.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>
                      <MarkDeceasedButton
                        id={r.id}
                        confirmText={t.mortality.motherDeathConfirm(r.tagId ?? "")}
                        locale={locale}
                      />
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* نافق الذكور */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.bucksSectionTitle}</h2>
        {activeBucks.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.bucksEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
                { key: "tag", label: t.mortality.colBuckTag, type: "tag", className: "text-center" },
                { key: "breed", label: t.mortality.colBreed, type: "string", className: "text-center" },
                { key: "action", label: t.mortality.colRecordDeceased, className: "text-center", sortable: false },
              ]}
              rows={activeBucks.map((r, i) => ({
                key: r.id,
                sortValues: { tag: r.tagId, breed: r.breed },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        {r.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>
                      <MarkDeceasedButton
                        id={r.id}
                        confirmText={t.mortality.buckDeathConfirm(r.tagId ?? "")}
                        locale={locale}
                      />
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* نافق السلالات */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.strainsSectionTitle}</h2>
        {activeStock.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.strainsEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <SortableTable
              headerRowClassName="[&>th]:border-x"
              columns={[
                { key: "index", label: t.mortality.colIndex, className: "text-center", sortable: false },
                { key: "sex", label: t.mortality.colSex, type: "string", className: "text-center" },
                { key: "breed", label: t.mortality.colStrainBreed, type: "string", className: "text-center" },
                { key: "cage", label: t.mortality.colCage, type: "tag", className: "text-center" },
                { key: "action", label: t.mortality.colRecordDeceased, className: "text-center", sortable: false },
              ]}
              rows={activeStock.map((r, i) => ({
                key: r.id,
                sortValues: { sex: r.sex, breed: r.breed, cage: r.cage },
                node: (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        <StatusBadge value={r.sex} locale={locale} />
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>{r.cage ?? "—"}</TableCell>
                    <TableCell>
                      <MarkDeceasedButton
                        id={r.id}
                        confirmText={t.mortality.strainDeathConfirm}
                        locale={locale}
                      />
                    </TableCell>
                  </TableRow>
                ),
              }))}
            />
          </div>
        )}
      </div>

      {/* سجلات النافق */}
      <MortalityLog
        deceasedMothers={deceasedMothers}
        deceasedBucks={deceasedBucks}
        deceasedStock={deceasedStock}
        locale={locale}
        t={t}
        todayOnly={todayOnly}
      />

      {/* سجل الاستبعادات */}
      <CullingLog culledRabbits={culledRabbits} locale={locale} t={t} todayOnly={todayOnly} />
    </div>
  );
}
