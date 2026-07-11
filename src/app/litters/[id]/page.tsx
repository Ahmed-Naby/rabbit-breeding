import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, Rabbit as RabbitIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { LocalDate } from "@/components/local-date";
import { PageHeader } from "@/components/page-header";
import { survivalRate, ageString } from "@/lib/dates";
import { compareTagId } from "@/lib/utils";

export const metadata = { title: "Litter · RabbitTrack" };

function DescItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function LitterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const litter = await prisma.litter.findUnique({
    where: { id },
    include: {
      breeding: {
        include: {
          buck: { select: { id: true, tagId: true } },
          doe: { select: { id: true, tagId: true } },
        },
      },
      kits: {
        select: {
          id: true,
          tagId: true,
          sex: true,
          status: true,
          dateOfBirth: true,
        },
      },
    },
  });
  if (!litter) notFound();
  litter.kits.sort((a, b) => compareTagId(a.tagId, b.tagId));

  const rate = survivalRate(litter.bornAlive, litter.weaned);
  const totalBorn = litter.bornAlive + litter.bornDead;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit">
        <Link href={`/breedings/${litter.breedingId}`}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> العودة إلى التلقيح
        </Link>
      </Button>

      <PageHeader
        title="الولادة"
        description={`${litter.breeding.buck?.tagId ?? "—"} × ${litter.breeding.doe.tagId ?? "—"}`}
        actions={
          <Button size="sm" asChild>
            <Link href={`/litters/${litter.id}/edit`}>تعديل الولادة</Link>
          </Button>
        }
      />

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <DescItem label="تاريخ الولادة">
              <LocalDate date={litter.kindlingDate} />
            </DescItem>
            <DescItem label="إجمالي المواليد">{totalBorn}</DescItem>
            <DescItem label="مواليد أحياء">{litter.bornAlive}</DescItem>
            <DescItem label="مواليد أموات">{litter.bornDead}</DescItem>
            <DescItem label="مفطوم">{litter.weaned ?? "—"}</DescItem>
            <DescItem label="تاريخ الفطام">
              {litter.weaningDate ? (
                <LocalDate date={litter.weaningDate} />
              ) : (
                "—"
              )}
            </DescItem>
            <DescItem label="نسبة البقاء">
              {rate != null ? (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {Math.round(rate * 100)}%
                </span>
              ) : (
                "—"
              )}
            </DescItem>
            <DescItem label="التلقيح">
              <Link
                href={`/breedings/${litter.breedingId}`}
                className="text-primary hover:underline"
              >
                عرض التلقيح
              </Link>
            </DescItem>
          </dl>
          {litter.notes ? (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">ملاحظات</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{litter.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            الخلفات الموسومة ({litter.kits.length})
          </CardTitle>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/rabbits/new?litterId=${litter.id}`}>
              <Plus className="size-4" /> وسم خلفة
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {litter.kits.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا توجد خلفات موسومة بعد. استخدم "وسم خلفة" لترقية إحداها إلى
              سجل أرنب كامل (يتم تعبئة الأبوين تلقائيًا من هذه الولادة).
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {litter.kits.map((k) => (
                <Link
                  key={k.id}
                  href={`/rabbits/${k.id}`}
                  className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:border-primary/50"
                >
                  <div className="flex items-center gap-3">
                    <RabbitIcon className="size-5 text-muted-foreground/60" />
                    <div>
                      <p className="font-medium">رقم {k.tagId ?? "—"}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {ageString(k.dateOfBirth)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={k.sex} />
                    <StatusBadge value={k.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
