"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { HealthRecordButton } from "@/components/health-record-form";
import {
  DoeStateBadge,
  KindleButton,
  LitterCountInput,
  RabbitAvailabilityToggle,
  ConfirmPalpationButton,
  ResorptionButton,
} from "../does/doe-state-menu";
import { NursingKitDeathButton, MarkDeceasedButton } from "../mortality/mortality-actions";
import type { DoeState } from "@/lib/enums";
import { computeDoeBoardRow } from "@/lib/does-board";
import { DISEASE_TYPES } from "@/lib/health-conditions";
import { naturalCompare } from "@/lib/sortable";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";

type DoeRaw = {
  id: string;
  tagId: string | null;
  breed: string | null;
  doeState: string;
  status: string;
  breedingsAsDoe: {
    id: string;
    matingDate: Date | null;
    actualKindlingDate: Date | null;
    palpationConfirmedDate: Date | null;
    buck: { tagId: string | null } | null;
    litter: {
      bornAlive: number;
      bornDead: number;
      weaned: number | null;
      weaningDate: Date | null;
    } | null;
  }[];
};

export function RoundsList({
  doesRaw,
  settings,
  locale,
}: {
  doesRaw: DoeRaw[];
  settings: any;
  locale: Locale;
}) {
  const t = getClientDictionary(locale);
  const rt = t.rounds;
  const [search, setSearch] = useState("");

  const sortedDoes = useMemo(
    () => [...doesRaw].sort((a, b) => naturalCompare(a.tagId ?? "", b.tagId ?? "")),
    [doesRaw]
  );

  const visibleDoes = useMemo(() => {
    const q = search.trim();
    if (!q) return sortedDoes;
    return sortedDoes.filter((d) => (d.tagId ?? "").includes(q));
  }, [sortedDoes, search]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={locale === "ar" ? "ابحث برقم الأم…" : "Search by doe number…"}
          className="ps-9 w-full sm:max-w-xs"
        />
      </div>

      {visibleDoes.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">
          {locale === "ar" ? "لا توجد أم بهذا الرقم" : "No doe matches that number"}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleDoes.map((doe) => {
            const { current: b, litterRow, countsRow, kindleActive, canConfirmPalpation } = computeDoeBoardRow(
              doe.doeState as DoeState,
              doe.status,
              doe.breedingsAsDoe.map((x) => ({
                id: x.id,
                matingDate: x.matingDate,
                actualKindlingDate: x.actualKindlingDate,
                palpationConfirmedDate: x.palpationConfirmedDate,
                buckTagId: x.buck?.tagId ?? null,
                litter: x.litter,
              })),
              settings
            );
            const litter = litterRow?.litter ?? null;
            const nursingEligible = !!litter && !litter.weaningDate && litter.bornAlive > 0;

            return (
              <div key={doe.id} className="space-y-3 rounded-xl border bg-card p-3 shadow-xs hover:border-primary/20 transition-all duration-300">
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

                <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-4">
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
                      <span className="block text-xs text-muted-foreground">{rt.notKindledYetNote}</span>
                    )}
                  </div>

                  {/* Palpation confirm (resorption check) */}
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-muted-foreground">{rt.palpationLabel}</span>
                    {canConfirmPalpation || b?.palpationConfirmedDate ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ConfirmPalpationButton
                          id={doe.id}
                          breedingId={b?.id ?? ""}
                          text={t.does.confirmPregnantButton}
                          disabled={!canConfirmPalpation}
                          checked={!!b?.palpationConfirmedDate}
                          locale={locale}
                        />
                        {b && canConfirmPalpation ? (
                          <ResorptionButton
                            id={doe.id}
                            breedingId={b.id}
                            text={t.does.resorptionButton}
                            disabled={!canConfirmPalpation}
                            locale={locale}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="block text-xs text-muted-foreground">{rt.palpationNotDueNote}</span>
                    )}
                  </div>

                  {/* Nursing kit death */}
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-muted-foreground">{rt.nursingDeathLabel}</span>
                    {nursingEligible ? (
                      <NursingKitDeathButton
                        breedingId={litterRow!.id}
                        bornAlive={litter!.bornAlive}
                        locale={locale}
                      />
                    ) : (
                      <span className="block text-xs text-muted-foreground">{rt.noNursingLitterNote}</span>
                    )}
                  </div>

                  {/* Doe death + health */}
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-muted-foreground">{rt.healthLabel}</span>
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
