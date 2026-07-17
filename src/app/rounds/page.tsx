import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { HealthRecordButton } from "@/components/health-record-form";
import { getSettings } from "@/lib/settings";
import type { DoeState } from "@/lib/enums";
import { computeDoeBoardRow } from "@/lib/does-board";
import { DISEASE_TYPES } from "@/lib/health-conditions";
import { DoeStateBadge, KindleButton, LitterCountInput, RabbitAvailabilityToggle } from "../does/doe-state-menu";
import { NursingKitDeathButton, MarkDeceasedButton } from "../mortality/mortality-actions";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.rounds.title} · RabbitTrack` };
}

export default async function RoundsPage() {
  const [doesRaw, settings, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      select: {
        id: true,
        tagId: true,
        breed: true,
        doeState: true,
        status: true,
        breedingsAsDoe: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            matingDate: true,
            actualKindlingDate: true,
            buck: { select: { tagId: true } },
            litter: {
              select: { bornAlive: true, bornDead: true, weaned: true, weaningDate: true },
            },
          },
        },
      },
      orderBy: { tagId: "asc" },
    }),
    getSettings(),
    getDictionary(),
  ]);

  const rt = t.rounds;

  return (
    <div className="space-y-6">
      <PageHeader title={rt.title} description={rt.description} />

      {doesRaw.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={rt.emptyTitle} description={rt.emptyDescription} />
      ) : (
        <div className="space-y-3">
          {doesRaw.map((doe) => {
            const { current: b, litterRow, countsRow, kindleActive } = computeDoeBoardRow(
              doe.doeState as DoeState,
              doe.status,
              doe.breedingsAsDoe.map((x) => ({
                id: x.id,
                matingDate: x.matingDate,
                actualKindlingDate: x.actualKindlingDate,
                buckTagId: x.buck?.tagId ?? null,
                litter: x.litter,
              })),
              settings
            );
            const litter = litterRow?.litter ?? null;
            const nursingEligible = !!litter && !litter.weaningDate && litter.bornAlive > 0;

            return (
              <div key={doe.id} className="space-y-3 rounded-xl border bg-card p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <Link href={`/rabbits/${doe.id}`} className="text-base font-semibold hover:underline">
                      {doe.tagId ?? "—"}
                    </Link>
                    <span className="text-xs text-muted-foreground">{doe.breed ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge value={doe.status} locale={locale} />
                    <DoeStateBadge current={doe.doeState} locale={locale} />
                  </div>
                </div>

                <RabbitAvailabilityToggle id={doe.id} current={doe.status} locale={locale} />

                <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3">
                  {/* Kindling */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{rt.kindlingLabel}</span>
                    {kindleActive ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <KindleButton
                          breedingId={b?.id ?? ""}
                          doeId={doe.id}
                          text={t.does.kindleButton}
                          doeState={doe.doeState as DoeState}
                          locale={locale}
                        />
                        <LitterCountInput
                          breedingId={countsRow?.id ?? ""}
                          field="bornAlive"
                          value={countsRow?.litter?.bornAlive ?? null}
                          disabled={!kindleActive}
                          locale={locale}
                        />
                        <LitterCountInput
                          breedingId={countsRow?.id ?? ""}
                          field="bornDead"
                          value={countsRow?.litter?.bornDead ?? null}
                          disabled={!kindleActive}
                          locale={locale}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{rt.notKindledYetNote}</span>
                    )}
                  </div>

                  {/* Nursing kit death */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{rt.nursingDeathLabel}</span>
                    {nursingEligible ? (
                      <NursingKitDeathButton
                        breedingId={litterRow!.id}
                        bornAlive={litter!.bornAlive}
                        locale={locale}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">{rt.noNursingLitterNote}</span>
                    )}
                  </div>

                  {/* Doe death + health */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">{rt.healthLabel}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <HealthRecordButton
                        rabbitId={doe.id}
                        locale={locale}
                        diseaseTypes={DISEASE_TYPES}
                        defaultDisease="other"
                        t={rt}
                      />
                      <MarkDeceasedButton
                        id={doe.id}
                        confirmText={t.mortality.motherDeathConfirm(doe.tagId ?? "")}
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
