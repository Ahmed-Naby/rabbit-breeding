import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { HealthRecordButton } from "@/components/health-record-form";
import { BUCK_DISEASE_TYPES } from "@/lib/health-conditions";
import { RabbitAvailabilityToggle } from "../does/doe-state-menu";
import { MarkDeceasedButton } from "../mortality/mortality-actions";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.bucksRounds.title} · RabbitTrack` };
}

export default async function BucksRoundsPage() {
  const [bucks, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "buck", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      select: { id: true, tagId: true, breed: true, status: true },
      orderBy: { tagId: "asc" },
    }),
    getDictionary(),
  ]);

  const rt = t.bucksRounds;

  return (
    <div className="space-y-6">
      <PageHeader title={rt.title} description={rt.description} />

      {bucks.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={rt.emptyTitle} description={rt.emptyDescription} />
      ) : (
        <div className="space-y-3">
          {bucks.map((buck) => (
            <div key={buck.id} className="space-y-3 rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <Link href={`/rabbits/${buck.id}`} className="text-base font-semibold hover:underline">
                    {buck.tagId ?? "—"}
                  </Link>
                  <span className="text-xs text-muted-foreground">{buck.breed ?? "—"}</span>
                </div>
                <StatusBadge value={buck.status} locale={locale} />
              </div>

              <RabbitAvailabilityToggle id={buck.id} current={buck.status} locale={locale} />

              <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
                <span className="me-1 text-[11px] font-medium text-muted-foreground">{rt.healthLabel}</span>
                <HealthRecordButton
                  rabbitId={buck.id}
                  locale={locale}
                  diseaseTypes={BUCK_DISEASE_TYPES}
                  defaultDisease="mange"
                  t={rt}
                />
                <MarkDeceasedButton
                  id={buck.id}
                  confirmText={t.mortality.buckDeathConfirm(buck.tagId ?? "")}
                  locale={locale}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
