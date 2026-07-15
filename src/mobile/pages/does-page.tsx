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
    <div className="space-y-3">
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
        } = computeDoeBoardRow(doe.doeState as DoeState, doe.breedings, settings);

        return (
          <div key={doe.id} className="space-y-3 rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-base font-semibold">{doe.tagId ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{doe.breed ?? "—"}</span>
              </div>
              <DoeStateBadge current={doe.doeState} locale={locale} />
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
  );
}
