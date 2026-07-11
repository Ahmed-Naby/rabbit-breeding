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
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { NursingKitDeathButton, MarkDeceasedButton } from "./mortality-actions";

export const metadata = { title: "حصر النافق · RabbitTrack" };

export default async function MortalityPage() {
  const [
    nursingDoesRaw,
    activeMothers,
    activeBucks,
    activeStock,
    deceasedMothers,
    deceasedBucks,
    deceasedStock,
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
      <PageHeader
        title="حصر النافق"
        description="تسجيل الوفيات اليومية: رضيع عند الأم، أم، ذكر، أو سلالة."
      />

      {/* رضيع الرضاعة */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">نافق الرضاعة</h2>
        {nursingDoes.length === 0 ? (
          <EmptyState
            icon={Skull}
            title="لا توجد أمهات مرضعة حاليًا"
            description="الأمهات اللي عندها رضاعة أحياء هتظهر هنا عشان تسجل وفاة رضيع."
          />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">م</TableHead>
                  <TableHead className="text-center">رقم الأم</TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead className="text-center">أحياء</TableHead>
                  <TableHead className="text-center">نافق</TableHead>
                  <TableHead className="text-center">تسجيل وفاة</TableHead>
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
                      <NursingKitDeathButton breedingId={breedingId} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* نافق الأمهات */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">نافق الأمهات</h2>
        {activeMothers.length === 0 ? (
          <EmptyState icon={Skull} title="لا توجد أمهات مسجلة" />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">م</TableHead>
                  <TableHead className="text-center">رقم الأم</TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead className="text-center">تسجيل نافق</TableHead>
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
                        confirmText={`هل تريد تسجيل وفاة الأم رقم ${r.tagId ?? ""}؟ سيتم نقلها إلى جدول الأمهات النافقة.`}
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
        <h2 className="text-lg font-semibold tracking-tight">نافق الذكور</h2>
        {activeBucks.length === 0 ? (
          <EmptyState icon={Skull} title="لا يوجد ذكور مسجلون" />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">م</TableHead>
                  <TableHead className="text-center">رقم الذكر</TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead className="text-center">تسجيل نافق</TableHead>
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
                        confirmText={`هل تريد تسجيل وفاة الذكر رقم ${r.tagId ?? ""}؟ سيتم نقله إلى جدول الذكور النافقة.`}
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
        <h2 className="text-lg font-semibold tracking-tight">نافق السلالات</h2>
        {activeStock.length === 0 ? (
          <EmptyState icon={Skull} title="لا توجد سلالات مسجلة" />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">م</TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead className="text-center">السلالة</TableHead>
                  <TableHead className="text-center">رقم القفص</TableHead>
                  <TableHead className="text-center">تسجيل نافق</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeStock.map((r, i) => (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        <StatusBadge value={r.sex} />
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>{r.cage ?? "—"}</TableCell>
                    <TableCell>
                      <MarkDeceasedButton
                        id={r.id}
                        confirmText="هل تريد تسجيل وفاة هذه السلالة؟ سيتم نقلها إلى جدول السلالات النافقة."
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
          الأمهات النافقة ({deceasedMothers.length})
        </h2>
        {deceasedMothers.length === 0 ? (
          <EmptyState icon={Skull} title="لا توجد أمهات نافقة" />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">م</TableHead>
                  <TableHead className="text-center">رقم الأم</TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead className="text-center">تاريخ التسجيل</TableHead>
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
                      <LocalDate date={r.updatedAt} />
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
          الذكور النافقة ({deceasedBucks.length})
        </h2>
        {deceasedBucks.length === 0 ? (
          <EmptyState icon={Skull} title="لا يوجد ذكور نافقة" />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">م</TableHead>
                  <TableHead className="text-center">رقم الذكر</TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead className="text-center">تاريخ التسجيل</TableHead>
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
                      <LocalDate date={r.updatedAt} />
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
          السلالات النافقة ({deceasedStock.length})
        </h2>
        {deceasedStock.length === 0 ? (
          <EmptyState icon={Skull} title="لا توجد سلالات نافقة" />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="[&>th]:border-x">
                  <TableHead className="text-center">م</TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead className="text-center">السلالة</TableHead>
                  <TableHead className="text-center">تاريخ التسجيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deceasedStock.map((r, i) => (
                  <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${r.id}`} className="hover:underline">
                        <StatusBadge value={r.sex} />
                      </Link>
                    </TableCell>
                    <TableCell>{r.breed ?? "—"}</TableCell>
                    <TableCell>
                      <LocalDate date={r.updatedAt} />
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
