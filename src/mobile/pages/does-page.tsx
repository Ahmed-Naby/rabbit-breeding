/**
 * Offline does board — touch-friendly cards instead of does/page.tsx's dense
 * 15-column table (a sanctioned redesign, not a literal port; see the sync
 * plan's Phase 3 section). Shares its row-derivation logic with the web
 * board via computeDoeBoardRow so the two can never drift in behavior.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Rabbit as RabbitIcon } from "lucide-react";
import { computeDoeBoardRow } from "@/lib/does-board";
import type { DoeState } from "@/lib/enums";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { LocalDate } from "@/components/local-date";
import { getDb } from "../db/client";
import { fetchDoesBoard, type DoeRow } from "../db/queries";
import type { LocalSettings } from "../db/types";
import { StatusBadge } from "@/components/status-badge";
import {
  DoeStateBadge,
  DoeActionButton,
  MateCell,
  MatingFailedButton,
  MatingDateInput,
  KindleButton,
  WeanButton,
  LitterCountInput,
  ClearDoeButton,
} from "../components/doe-state-menu";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function DoesPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [does, setDoes] = useState<DoeRow[] | null>(null);
  const [settings, setSettings] = useState<LocalSettings | null>(null);

  const refresh = useCallback(async () => {
    const db = await getDb();
    const data = await fetchDoesBoard(db);
    setDoes(data.does);
    setSettings(data.settings);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (does === null || settings === null) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  if (does.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
        <RabbitIcon className="h-8 w-8" />
        <p className="font-medium">{t.does.emptyTitle}</p>
        <p className="text-sm">{t.does.emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.does.title}</h1>
        <p className="text-sm text-muted-foreground">{t.does.description}</p>
      </div>

      {/* Desktop Table View */}
      <div className="hidden xl:block rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm text-left rtl:text-right border-collapse">
          <thead className="bg-muted text-muted-foreground text-xs uppercase">
            <tr className="[&>th]:border-x border-b">
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colIndex}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colMotherTag}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colBreed}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colDoeState}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colMate}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colMatingDate}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colTestDate}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colTestResult}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colKindlingDate}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colKindle}</th>
              <th className="px-3 py-2 text-center border-b" colSpan={2}>{t.does.colBornCount}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colWean}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colWeanedCount}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colWeaningDate}</th>
              <th className="px-3 py-2 text-center" rowSpan={2}>{t.does.colClear}</th>
            </tr>
            <tr className="[&>th]:border-x">
              <th className="px-3 py-2 text-center border-t">{t.does.colBornAlive}</th>
              <th className="px-3 py-2 text-center border-t">{t.does.colBornDead}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {does.map((doe, i) => {
              const {
                current: b,
                countsRow,
                litterRow,
                isWeaned,
                canMate,
                canTestPregnancy,
                kindleActive,
                weanActive,
                testDate,
                kindlingDate,
              } = computeDoeBoardRow(doe.doeState as DoeState, doe.status, doe.breedings, settings);

              return (
                <tr key={doe.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2.5 font-semibold">{doe.tagId ?? "—"}</td>
                  <td className="px-3 py-2.5">{doe.breed ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <StatusBadge value={doe.status} locale={locale} />
                      <DoeStateBadge current={doe.doeState} locale={locale} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <MateCell
                      breedingId={b?.id ?? null}
                      doeId={doe.id}
                      canMate={canMate}
                      buckTagId={b?.buckTagId ?? null}
                      locale={locale}
                      onDone={refresh}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {b ? (
                      <MatingDateInput breedingId={b.id} date={b.matingDate} locale={locale} onDone={refresh} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <LocalDate date={testDate} locale={locale} className="text-xs" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap justify-center gap-1">
                      <DoeActionButton
                        id={doe.id}
                        breedingId={b?.id ?? ""}
                        text={t.does.pregnantButton}
                        target={doe.doeState === "nursing_bred" ? "nursing_pregnant" : "pregnant"}
                        disabled={!canTestPregnancy}
                        checked={doe.doeState === "pregnant" || doe.doeState === "nursing_pregnant"}
                        className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                        locale={locale}
                        onDone={refresh}
                      />
                      {b ? (
                        <MatingFailedButton
                          breedingId={b.id}
                          doeId={doe.id}
                          text={t.does.negativeButton}
                          disabled={!canTestPregnancy}
                          className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                          locale={locale}
                          onDone={refresh}
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <LocalDate date={kindlingDate} locale={locale} className="text-xs" />
                  </td>
                  <td className="px-3 py-2.5">
                    <KindleButton
                      breedingId={b?.id ?? ""}
                      doeId={doe.id}
                      text={t.does.kindleButton}
                      doeState={doe.doeState as DoeState}
                      locale={locale}
                      onDone={refresh}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <LitterCountInput
                      breedingId={countsRow?.id ?? ""}
                      field="bornAlive"
                      value={countsRow?.litter?.bornAlive ?? null}
                      disabled={!kindleActive}
                      locale={locale}
                      onDone={refresh}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <LitterCountInput
                      breedingId={countsRow?.id ?? ""}
                      field="bornDead"
                      value={countsRow?.litter?.bornDead ?? null}
                      disabled={!kindleActive}
                      locale={locale}
                      onDone={refresh}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <WeanButton
                      breedingId={litterRow?.id ?? ""}
                      doeId={doe.id}
                      text={t.does.weanButton}
                      active={weanActive}
                      weaned={isWeaned}
                      locale={locale}
                      onDone={refresh}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <LitterCountInput
                      breedingId={countsRow?.id ?? ""}
                      field="weaned"
                      value={countsRow?.litter?.weaned ?? null}
                      disabled={!isWeaned}
                      locale={locale}
                      onDone={refresh}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {countsRow?.litter?.weaningDate ? (
                      <LocalDate date={countsRow.litter.weaningDate} locale={locale} className="text-xs" />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {b ? (
                      <ClearDoeButton breedingId={b.id} doeId={doe.id} text={t.does.clearButton} locale={locale} onDone={refresh} />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="xl:hidden space-y-3">
        {does.map((doe) => {
          const {
            current: b,
            countsRow,
            litterRow,
            isWeaned,
            canMate,
            canTestPregnancy,
            kindleActive,
            weanActive,
            testDate,
            kindlingDate,
          } = computeDoeBoardRow(doe.doeState as DoeState, doe.status, doe.breedings, settings);

          return (
            <div key={doe.id} className="space-y-3 rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-semibold">{doe.tagId ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{doe.breed ?? "—"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge value={doe.status} locale={locale} />
                  <DoeStateBadge current={doe.doeState} locale={locale} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <Field label={t.does.colMate}>
                  <MateCell
                    breedingId={b?.id ?? null}
                    doeId={doe.id}
                    canMate={canMate}
                    buckTagId={b?.buckTagId ?? null}
                    locale={locale}
                    onDone={refresh}
                  />
                </Field>

                <Field label={t.does.colMatingDate}>
                  {b ? (
                    <MatingDateInput breedingId={b.id} date={b.matingDate} locale={locale} onDone={refresh} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Field>

                <Field label={t.does.colTestDate}>
                  <LocalDate date={testDate} locale={locale} className="text-xs" />
                </Field>

                <Field label={t.does.colTestResult}>
                  <div className="flex flex-wrap gap-1.5">
                    <DoeActionButton
                      id={doe.id}
                      breedingId={b?.id ?? ""}
                      text={t.does.pregnantButton}
                      target={doe.doeState === "nursing_bred" ? "nursing_pregnant" : "pregnant"}
                      disabled={!canTestPregnancy}
                      checked={doe.doeState === "pregnant" || doe.doeState === "nursing_pregnant"}
                      className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                      locale={locale}
                      onDone={refresh}
                    />
                    {b ? (
                      <MatingFailedButton
                        breedingId={b.id}
                        doeId={doe.id}
                        text={t.does.negativeButton}
                        disabled={!canTestPregnancy}
                        className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                        locale={locale}
                        onDone={refresh}
                      />
                    ) : null}
                  </div>
                </Field>

                <Field label={t.does.colKindlingDate}>
                  <LocalDate date={kindlingDate} locale={locale} className="text-xs" />
                </Field>

                <Field label={t.does.colKindle}>
                  <KindleButton
                    breedingId={b?.id ?? ""}
                    doeId={doe.id}
                    text={t.does.kindleButton}
                    doeState={doe.doeState as DoeState}
                    locale={locale}
                    onDone={refresh}
                  />
                </Field>

                <Field label={t.does.colBornAlive}>
                  <LitterCountInput
                    breedingId={countsRow?.id ?? ""}
                    field="bornAlive"
                    value={countsRow?.litter?.bornAlive ?? null}
                    disabled={!kindleActive}
                    locale={locale}
                    onDone={refresh}
                  />
                </Field>

                <Field label={t.does.colBornDead}>
                  <LitterCountInput
                    breedingId={countsRow?.id ?? ""}
                    field="bornDead"
                    value={countsRow?.litter?.bornDead ?? null}
                    disabled={!kindleActive}
                    locale={locale}
                    onDone={refresh}
                  />
                </Field>

                <Field label={t.does.colWean}>
                  <WeanButton
                    breedingId={litterRow?.id ?? ""}
                    doeId={doe.id}
                    text={t.does.weanButton}
                    active={weanActive}
                    weaned={isWeaned}
                    locale={locale}
                    onDone={refresh}
                  />
                </Field>

                <Field label={t.does.colWeanedCount}>
                  <LitterCountInput
                    breedingId={countsRow?.id ?? ""}
                    field="weaned"
                    value={countsRow?.litter?.weaned ?? null}
                    disabled={!isWeaned}
                    locale={locale}
                    onDone={refresh}
                  />
                </Field>

                <Field label={t.does.colWeaningDate}>
                  {countsRow?.litter?.weaningDate ? (
                    <LocalDate date={countsRow.litter.weaningDate} locale={locale} className="text-xs" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Field>
              </div>

              {b ? (
                <div className="flex justify-end border-t pt-2">
                  <ClearDoeButton breedingId={b.id} doeId={doe.id} text={t.does.clearButton} locale={locale} onDone={refresh} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
