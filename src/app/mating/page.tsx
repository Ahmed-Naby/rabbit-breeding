import Link from "next/link";
import { HeartHandshake } from "lucide-react";
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
import { DoeStateBadge, MateCell } from "../does/doe-state-menu";

export const metadata = { title: "عمليات التلقيح · RabbitTrack" };

export default async function MatingPage() {
  // Same eligibility rule as the "تلقيح" button on /does (canMate): فاضية،
  // مرضعة، أو مستبعدة. Filtering it here at the query level (instead of
  // fetching everyone and checking client-side) means this board only ever
  // shows does actually ready right now. MateCell writes through the same
  // startBreeding/markMated actions the does board uses, which already
  // revalidate both "/does" and "/mating" — so the instant a doe is mated
  // here, she's reflected as "ملقحة" on عمليات المزرعة and drops off this list.
  // "سجل التلقيح": every breeding attempt that actually has a mating date,
  // most recent first — a running log of who was mated and when, separate
  // from the "ready now" board above. Reads straight off Breeding (not
  // per-doe latest-only like the board above) so a doe rebred more than
  // once still shows each mating as its own log line.
  const [does, matingLog] = await Promise.all([
    prisma.rabbit.findMany({
      where: {
        sex: "doe",
        tagId: { not: null },
        status: { not: "deceased" },
        doeState: { in: ["empty", "nursing", "excluded"] },
      },
      select: {
        id: true,
        tagId: true,
        breed: true,
        doeState: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, buck: { select: { tagId: true } } },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    prisma.breeding.findMany({
      where: { matingDate: { not: null } },
      orderBy: { matingDate: "desc" },
      select: {
        id: true,
        matingDate: true,
        doe: { select: { id: true, tagId: true, breed: true, doeState: true } },
        buck: { select: { tagId: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="عمليات التلقيح"
        description={`${does.length} أم جاهزة للتلقيح الآن.`}
      />

      {does.length === 0 ? (
        <EmptyState
          icon={HeartHandshake}
          title="لا توجد أمهات جاهزة للتلقيح حاليًا"
          description="كل الأمهات إما ملقحة أو عشار أو مرضعة، هتظهر هنا تاني أول ما تدخل دورة جديدة."
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x">
                <TableHead className="text-center">م</TableHead>
                <TableHead className="text-center">رقم الأم</TableHead>
                <TableHead className="text-center">النوع</TableHead>
                <TableHead className="text-center">حالة الأم</TableHead>
                <TableHead className="text-center">تلقيح</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {does.map((doe, i) => {
                const b = doe.breedingsAsDoe[0];
                return (
                  <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                        {doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{doe.breed ?? "—"}</TableCell>
                    <TableCell>
                      <DoeStateBadge current={doe.doeState} />
                    </TableCell>
                    <TableCell>
                      <MateCell
                        breedingId={b?.id ?? null}
                        doeId={doe.id}
                        canMate
                        buckTagId={b?.buck?.tagId ?? null}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">سجل التلقيح</h2>
        {matingLog.length === 0 ? (
          <EmptyState
            icon={HeartHandshake}
            title="لا يوجد تلقيح مسجل بعد"
            description="أي أم يتم تلقيحها هتظهر هنا مع تاريخ التلقيح."
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
                  <TableHead className="text-center">حالة الأم</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matingLog.map((row, i) => (
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
