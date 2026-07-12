import Link from "next/link";
import { Box } from "lucide-react";
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
import { nestBoxDueDate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { DoeStateBadge, InstallNestBoxButton } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.nestBox.title} · RabbitTrack` };
}

export default async function NestBoxPage() {
  // Any doe still mid-cycle (mated, kindling not yet recorded) is a nest-box
  // candidate once the configured offset from her mating date has passed —
  // "nursing" is excluded since that means this row's kindling already
  // happened, so the box's window for this cycle is over.
  const [candidates, settings, installedLog, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { not: "deceased" },
        doeState: { in: ["bred", "pregnant", "nursing_bred", "nursing_pregnant"] },
      },
      select: {
        id: true,
        tagId: true,
        breed: true,
        doeState: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            matingDate: true,
            nestBoxDate: true,
            buck: { select: { tagId: true } },
          },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    getSettings(),
    // nestBoxDate isn't a permanent log (it lives on Breeding and gets reset
    // to null on cycle reuse, same as matingDate) — so "سجل تركيب بيوت
    // الولادة" reads straight off current Breeding rows, same reasoning as
    // "سجل التلقيح" on /mating.
    prisma.breeding.findMany({
      where: { nestBoxDate: { not: null } },
      orderBy: { nestBoxDate: "desc" },
      select: {
        id: true,
        matingDate: true,
        nestBoxDate: true,
        doe: { select: { id: true, tagId: true, breed: true, doeState: true } },
        buck: { select: { tagId: true } },
      },
    }),
    getDictionary(),
  ]);

  const today = new Date();
  const does = candidates
    .map((doe) => {
      const b = doe.breedingsAsDoe[0];
      if (!b?.matingDate || b.nestBoxDate) return null;
      const dueDate = nestBoxDueDate(b.matingDate, settings.nestBoxDays);
      if (dueDate > today) return null;
      return { doe, b, dueDate };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.nestBox.title}
        description={t.nestBox.description(does.length, settings.nestBoxDays)}
      />

      {does.length === 0 ? (
        <EmptyState
          icon={Box}
          title={t.nestBox.emptyTitle}
          description={t.nestBox.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x">
                <TableHead className="text-center">{t.nestBox.colIndex}</TableHead>
                <TableHead className="text-center">{t.nestBox.colMotherTag}</TableHead>
                <TableHead className="text-center">{t.nestBox.colBreed}</TableHead>
                <TableHead className="text-center">{t.nestBox.colBuckTag}</TableHead>
                <TableHead className="text-center">{t.nestBox.colMatingDate}</TableHead>
                <TableHead className="text-center">{t.nestBox.colExpectedInstallDate}</TableHead>
                <TableHead className="text-center">{t.nestBox.colDoeState}</TableHead>
                <TableHead className="text-center">{t.nestBox.colInstall}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {does.map(({ doe, b, dueDate }, i) => (
                <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                      {doe.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{doe.breed ?? "—"}</TableCell>
                  <TableCell>{b.buck?.tagId ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={b.matingDate} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <LocalDate date={dueDate} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <DoeStateBadge current={doe.doeState} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <InstallNestBoxButton breedingId={b.id} doeId={doe.id} locale={locale} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.nestBox.logHeading}</h2>
        {installedLog.length === 0 ? (
          <EmptyState
            icon={Box}
            title={t.nestBox.logEmptyTitle}
            description={t.nestBox.logEmptyDescription}
          />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">{t.nestBox.colIndex}</TableHead>
                  <TableHead className="text-center">{t.nestBox.colMotherTag}</TableHead>
                  <TableHead className="text-center">{t.nestBox.colBreed}</TableHead>
                  <TableHead className="text-center">{t.nestBox.colBuckTag}</TableHead>
                  <TableHead className="text-center">{t.nestBox.colMatingDate}</TableHead>
                  <TableHead className="text-center">{t.nestBox.colInstallDate}</TableHead>
                  <TableHead className="text-center">{t.nestBox.colDoeState}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installedLog.map((row, i) => (
                  <TableRow key={row.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${row.doe.id}`} className="hover:underline">
                        {row.doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{row.doe.breed ?? "—"}</TableCell>
                    <TableCell>{row.buck?.tagId ?? "—"}</TableCell>
                    <TableCell>
                      <LocalDate date={row.matingDate} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <LocalDate date={row.nestBoxDate} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <DoeStateBadge current={row.doe.doeState} locale={locale} />
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
