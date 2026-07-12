import Link from "next/link";
import { Milk } from "lucide-react";
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
import { LocalDate } from "@/components/local-date";
import { weaningDueDate, survivalRate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { DoeStateBadge, WeanButton, LitterCountInput } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.weaning.title} · RabbitTrack` };
}

export default async function WeaningPage() {
  // Only doeStates that can carry an unweaned litter (see does/page.tsx's
  // weanActive logic). "مرضعة و ملقحة/عشار" rebred while still nursing, so
  // her latest breeding row is the new cycle (no litter yet) — the ongoing,
  // not-yet-weaned litter still lives on the *previous* row, hence take: 2.
  const [candidates, settings, weanedLitters, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { not: "deceased" },
        doeState: { in: ["nursing", "nursing_bred", "nursing_pregnant"] },
      },
      select: {
        id: true,
        tagId: true,
        breed: true,
        doeState: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            actualKindlingDate: true,
            buck: { select: { tagId: true } },
            litter: { select: { weaningDate: true, bornAlive: true, bornDead: true } },
          },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    getSettings(),
    // "سجل الفطام": litters already weaned, so "عدد الفطام" can be entered
    // inline here instead of having to go back to the does board.
    prisma.litter.findMany({
      where: { weaningDate: { not: null } },
      orderBy: { weaningDate: "desc" },
      select: {
        breedingId: true,
        kindlingDate: true,
        weaningDate: true,
        bornAlive: true,
        bornDead: true,
        weaned: true,
        breeding: {
          select: {
            doe: { select: { id: true, tagId: true, breed: true } },
            buck: { select: { tagId: true } },
          },
        },
      },
    }),
    getDictionary(),
  ]);

  const today = new Date();
  const does = candidates
    .map((doe) => {
      const [b, prev] = doe.breedingsAsDoe;
      const prevOngoingLitter =
        !!prev?.actualKindlingDate && !prev?.litter?.weaningDate && !b?.actualKindlingDate;
      const litterRow = prevOngoingLitter ? prev : b;
      if (!litterRow?.actualKindlingDate || litterRow.litter?.weaningDate) return null;
      const dueDate = weaningDueDate(litterRow.actualKindlingDate, settings.weaningDays);
      if (dueDate > today) return null;
      return { doe, litterRow, dueDate };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.weaning.title}
        description={t.weaning.description(does.length, settings.weaningDays)}
      />

      {does.length === 0 ? (
        <EmptyState
          icon={Milk}
          title={t.weaning.emptyTitle}
          description={t.weaning.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x">
                <TableHead className="text-center">{t.weaning.colIndex}</TableHead>
                <TableHead className="text-center">{t.weaning.colMotherTag}</TableHead>
                <TableHead className="text-center">{t.weaning.colBreed}</TableHead>
                <TableHead className="text-center">{t.weaning.colBuckTag}</TableHead>
                <TableHead className="text-center">{t.weaning.colKindlingDate}</TableHead>
                <TableHead className="text-center">{t.weaning.colExpectedWeaningDate}</TableHead>
                <TableHead className="text-center">{t.weaning.colDoeState}</TableHead>
                <TableHead className="text-center">{t.weaning.colAlive}</TableHead>
                <TableHead className="text-center">{t.weaning.colDead}</TableHead>
                <TableHead className="text-center">{t.weaning.colWean}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {does.map(({ doe, litterRow, dueDate }, i) => (
                <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                      {doe.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{doe.breed ?? "—"}</TableCell>
                  <TableCell>{litterRow.buck?.tagId ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={litterRow.actualKindlingDate} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <LocalDate date={dueDate} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <DoeStateBadge current={doe.doeState} locale={locale} />
                  </TableCell>
                  <TableCell>{litterRow.litter?.bornAlive ?? "—"}</TableCell>
                  <TableCell>{litterRow.litter?.bornDead ?? "—"}</TableCell>
                  <TableCell>
                    <WeanButton
                      breedingId={litterRow.id}
                      doeId={doe.id}
                      text={t.weaning.weanButton}
                      active
                      weaned={false}
                      locale={locale}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.weaning.logHeading}</h2>
        {weanedLitters.length === 0 ? (
          <EmptyState
            icon={Milk}
            title={t.weaning.logEmptyTitle}
            description={t.weaning.logEmptyDescription}
          />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.weaning.colIndex}</TableHead>
                  <TableHead className="text-center">{t.weaning.colMotherTag}</TableHead>
                  <TableHead className="text-center">{t.weaning.colBreed}</TableHead>
                  <TableHead className="text-center">{t.weaning.colBuckTag}</TableHead>
                  <TableHead className="text-center">{t.weaning.colKindlingDate}</TableHead>
                  <TableHead className="text-center">{t.weaning.colWeaningDate}</TableHead>
                  <TableHead className="text-center">{t.weaning.colAlive}</TableHead>
                  <TableHead className="text-center">{t.weaning.colDead}</TableHead>
                  <TableHead className="text-center">{t.weaning.colWeanedCount}</TableHead>
                  <TableHead className="text-center">{t.weaning.colSurvivalRate}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weanedLitters.map((l, i) => {
                  const r = survivalRate(l.bornAlive, l.weaned);
                  return (
                    <TableRow key={l.breedingId} className="[&>td]:border-x [&>td]:text-center">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/rabbits/${l.breeding.doe.id}`} className="hover:underline">
                          {l.breeding.doe.tagId ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell>{l.breeding.doe.breed ?? "—"}</TableCell>
                      <TableCell>{l.breeding.buck?.tagId ?? "—"}</TableCell>
                      <TableCell>
                        <LocalDate date={l.kindlingDate} locale={locale} />
                      </TableCell>
                      <TableCell>
                        <LocalDate date={l.weaningDate} locale={locale} />
                      </TableCell>
                      <TableCell>{l.bornAlive}</TableCell>
                      <TableCell>{l.bornDead || "—"}</TableCell>
                      <TableCell>
                        <LitterCountInput
                          breedingId={l.breedingId}
                          field="weaned"
                          value={l.weaned}
                          locale={locale}
                        />
                      </TableCell>
                      <TableCell>
                        {r != null ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {Math.round(r * 100)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
