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

export const metadata = { title: "عمليات الفطام · RabbitTrack" };

export default async function WeaningPage() {
  // Only doeStates that can carry an unweaned litter (see does/page.tsx's
  // weanActive logic). "مرضعة و ملقحة/عشار" rebred while still nursing, so
  // her latest breeding row is the new cycle (no litter yet) — the ongoing,
  // not-yet-weaned litter still lives on the *previous* row, hence take: 2.
  const [candidates, settings, weanedLitters] = await Promise.all([
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
        title="عمليات الفطام"
        description={`${does.length} أم حان موعد فطامها (بعد ${settings.weaningDays} يومًا من الولادة).`}
      />

      {does.length === 0 ? (
        <EmptyState
          icon={Milk}
          title="لا توجد أمهات حان موعد فطامها حاليًا"
          description="الأمهات المرضعة هتظهر هنا أول ما تعدي مدة انتظار الفطام المسجلة بالإعدادات."
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
                <TableHead className="text-center">تاريخ الولادة</TableHead>
                <TableHead className="text-center">تاريخ الفطام المتوقع</TableHead>
                <TableHead className="text-center">حالة الأم</TableHead>
                <TableHead className="text-center">أحياء</TableHead>
                <TableHead className="text-center">نافق</TableHead>
                <TableHead className="text-center">فطام</TableHead>
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
                    <LocalDate date={litterRow.actualKindlingDate} />
                  </TableCell>
                  <TableCell>
                    <LocalDate date={dueDate} />
                  </TableCell>
                  <TableCell>
                    <DoeStateBadge current={doe.doeState} />
                  </TableCell>
                  <TableCell>{litterRow.litter?.bornAlive ?? "—"}</TableCell>
                  <TableCell>{litterRow.litter?.bornDead ?? "—"}</TableCell>
                  <TableCell>
                    <WeanButton
                      breedingId={litterRow.id}
                      doeId={doe.id}
                      text="فطام"
                      active
                      weaned={false}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">سجل الفطام</h2>
        {weanedLitters.length === 0 ? (
          <EmptyState
            icon={Milk}
            title="لا توجد فطامات مسجلة بعد"
            description="أي أم يتم تسجيل فطامها هتظهر هنا عشان تدخل عدد الفطام."
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
                  <TableHead className="text-center">تاريخ الولادة</TableHead>
                  <TableHead className="text-center">تاريخ الفطام</TableHead>
                  <TableHead className="text-center">أحياء</TableHead>
                  <TableHead className="text-center">نافق</TableHead>
                  <TableHead className="text-center">عدد الفطام</TableHead>
                  <TableHead className="text-center">نسبة البقاء</TableHead>
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
                        <LocalDate date={l.kindlingDate} />
                      </TableCell>
                      <TableCell>
                        <LocalDate date={l.weaningDate} />
                      </TableCell>
                      <TableCell>{l.bornAlive}</TableCell>
                      <TableCell>{l.bornDead || "—"}</TableCell>
                      <TableCell>
                        <LitterCountInput
                          breedingId={l.breedingId}
                          field="weaned"
                          value={l.weaned}
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
