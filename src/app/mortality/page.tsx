import Link from "next/link";
import { Skull } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import {
  NursingKitDeathButton,
  WeaningStockDeathButton,
  MarkDeceasedButton,
} from "./mortality-actions";
import { getKitStockSummary } from "../weaning-sales/stock";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.mortality.title} · RabbitTrack` };
}

export default async function MortalityPage() {
  const [
    nursingDoesRaw,
    activeMothers,
    activeBucks,
    activeStock,
    deceasedMothers,
    deceasedBucks,
    deceasedStock,
    { availableStock },
    { locale, t },
  ] = await Promise.all([
    // Same "current litter for a doe" resolution as /does — reused here
    // rather than re-derived, then narrowed below to does actually nursing
    // live (bornAlive > 0), unweaned kits right now.
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: { not: "deceased" } },
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
      where: { sex: "doe", tagId: { not: null }, status: { not: "deceased" } },
      select: { id: true, tagId: true, breed: true },
      orderBy: { tagId: "asc" },
    }),
    prisma.rabbit.findMany({
      where: { sex: "buck", tagId: { not: null }, status: { not: "deceased" } },
      select: { id: true, tagId: true, breed: true },
      orderBy: { tagId: "asc" },
    }),
    prisma.rabbit.findMany({
      where: { tagId: null, status: { not: "deceased" } },
      select: { id: true, sex: true, breed: true, cage: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: "deceased" },
      select: { id: true, tagId: true, breed: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.rabbit.findMany({
      where: { sex: "buck", tagId: { not: null }, status: "deceased" },
      select: { id: true, tagId: true, breed: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.rabbit.findMany({
      where: { tagId: null, status: "deceased" },
      select: { id: true, sex: true, breed: true, cage: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    getKitStockSummary(),
    getDictionary(),
  ]);

  const nursingDoes = nursingDoesRaw
    .map((doe) => {
      const [b, prev] = doe.breedingsAsDoe;
      const prevOngoingLitter =
        !!prev?.actualKindlingDate && !prev?.litter?.weaningDate && !b?.actualKindlingDate;
      const litterRow = prevOngoingLitter ? prev : b;
      const litter = litterRow?.litter;
      if (!litter || litter.weaningDate || litter.bornAlive <= 0) return null;
      return { doe, breedingId: litterRow!.id, litter };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return (
    <div className="space-y-8">
      <PageHeader title={t.mortality.title} description={t.mortality.description} />

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
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.mortality.colIndex}</TableHead>
                  <TableHead className="text-center">{t.mortality.colMotherTag}</TableHead>
                  <TableHead className="text-center">{t.mortality.colBreed}</TableHead>
                  <TableHead className="text-center">{t.mortality.colAlive}</TableHead>
                  <TableHead className="text-center">{t.mortality.colDead}</TableHead>
                  <TableHead className="text-center">{t.mortality.colRecordDeath}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nursingDoes.map(({ doe, breedingId, litter }, i) => (
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
                      <NursingKitDeathButton breedingId={breedingId} locale={locale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.mortality.colIndex}</TableHead>
                  <TableHead className="text-center">{t.mortality.colMotherTag}</TableHead>
                  <TableHead className="text-center">{t.mortality.colBreed}</TableHead>
                  <TableHead className="text-center">{t.mortality.colRecordDeceased}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeMothers.map((r, i) => (
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
                ))}
              </TableBody>
            </Table>
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
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.mortality.colIndex}</TableHead>
                  <TableHead className="text-center">{t.mortality.colBuckTag}</TableHead>
                  <TableHead className="text-center">{t.mortality.colBreed}</TableHead>
                  <TableHead className="text-center">{t.mortality.colRecordDeceased}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeBucks.map((r, i) => (
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
                ))}
              </TableBody>
            </Table>
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
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.mortality.colIndex}</TableHead>
                  <TableHead className="text-center">{t.mortality.colSex}</TableHead>
                  <TableHead className="text-center">{t.mortality.colStrainBreed}</TableHead>
                  <TableHead className="text-center">{t.mortality.colCage}</TableHead>
                  <TableHead className="text-center">{t.mortality.colRecordDeceased}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeStock.map((r, i) => (
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* سجلات النافق */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.mortality.deceasedMothersHeading(deceasedMothers.length)}
        </h2>
        {deceasedMothers.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.deceasedMothersEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.mortality.colIndex}</TableHead>
                  <TableHead className="text-center">{t.mortality.colMotherTag}</TableHead>
                  <TableHead className="text-center">{t.mortality.colBreed}</TableHead>
                  <TableHead className="text-center">{t.mortality.colRegisteredDate}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deceasedMothers.map((r, i) => (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        {r.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>
                      <LocalDate date={r.updatedAt} locale={locale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.mortality.deceasedBucksHeading(deceasedBucks.length)}
        </h2>
        {deceasedBucks.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.deceasedBucksEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.mortality.colIndex}</TableHead>
                  <TableHead className="text-center">{t.mortality.colBuckTag}</TableHead>
                  <TableHead className="text-center">{t.mortality.colBreed}</TableHead>
                  <TableHead className="text-center">{t.mortality.colRegisteredDate}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deceasedBucks.map((r, i) => (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        {r.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>
                      <LocalDate date={r.updatedAt} locale={locale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.mortality.deceasedStrainsHeading(deceasedStock.length)}
        </h2>
        {deceasedStock.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.deceasedStrainsEmptyTitle} />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.mortality.colIndex}</TableHead>
                  <TableHead className="text-center">{t.mortality.colSex}</TableHead>
                  <TableHead className="text-center">{t.mortality.colStrainBreed}</TableHead>
                  <TableHead className="text-center">{t.mortality.colRegisteredDate}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deceasedStock.map((r, i) => (
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
