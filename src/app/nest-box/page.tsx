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

export const metadata = { title: "تركيب بيوت الولادة · RabbitTrack" };

export default async function NestBoxPage() {
  // Any doe still mid-cycle (mated, kindling not yet recorded) is a nest-box
  // candidate once the configured offset from her mating date has passed —
  // "nursing" is excluded since that means this row's kindling already
  // happened, so the box's window for this cycle is over.
  const [candidates, settings, installedLog] = await Promise.all([
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
        title="تركيب بيوت الولادة"
        description={`${does.length} أم حان موعد تركيب بيت الولادة لها (بعد ${settings.nestBoxDays} يومًا من التلقيح).`}
      />

      {does.length === 0 ? (
        <EmptyState
          icon={Box}
          title="لا توجد أمهات محتاجة تركيب بيت ولادة حاليًا"
          description="الأمهات العشار هتظهر هنا أول ما تعدي مدة انتظار تركيب البيت المسجلة بالإعدادات."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x">
                <TableHead className="text-center">م</TableHead>
                <TableHead className="text-center">رقم الأم</TableHead>
                <TableHead className="text-center">النوع</TableHead>
                <TableHead className="text-center">رقم الذكر</TableHead>
                <TableHead className="text-center">تاريخ التلقيح</TableHead>
                <TableHead className="text-center">تاريخ تركيب البيت المتوقع</TableHead>
                <TableHead className="text-center">حالة الأم</TableHead>
                <TableHead className="text-center">تركيب بيت الولادة</TableHead>
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
                    <LocalDate date={b.matingDate} />
                  </TableCell>
                  <TableCell>
                    <LocalDate date={dueDate} />
                  </TableCell>
                  <TableCell>
                    <DoeStateBadge current={doe.doeState} />
                  </TableCell>
                  <TableCell>
                    <InstallNestBoxButton breedingId={b.id} doeId={doe.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">سجل تركيب بيوت الولادة</h2>
        {installedLog.length === 0 ? (
          <EmptyState
            icon={Box}
            title="لا يوجد تركيب بيوت ولادة مسجل بعد"
            description="أي أم يتم تركيب بيت الولادة لها هتظهر هنا مع تاريخ التلقيح والتركيب."
          />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">م</TableHead>
                  <TableHead className="text-center">رقم الأم</TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead className="text-center">رقم الذكر</TableHead>
                  <TableHead className="text-center">تاريخ التلقيح</TableHead>
                  <TableHead className="text-center">تاريخ التركيب</TableHead>
                  <TableHead className="text-center">حالة الأم</TableHead>
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
                      <LocalDate date={row.matingDate} />
                    </TableCell>
                    <TableCell>
                      <LocalDate date={row.nestBoxDate} />
                    </TableCell>
                    <TableCell>
                      <DoeStateBadge current={row.doe.doeState} />
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
