import { useEffect, useState, useCallback } from "react";
import { Skull, X } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { isToday } from "@/lib/dates";
import { getDb } from "../db/client";
import { useDbRefresh } from "../lib/use-db-refresh";
import { todayIso } from "../db/helpers";
import { fetchMortalityPageData, type LocalDeceasedRabbit, type LocalKitDeath } from "../db/queries";
import { enqueue } from "../sync/outbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LocalRabbit } from "../db/types";
import { MortalityLog } from "./mortality-log";
import { CullingLog } from "./culling-log";
import { PageSkeleton } from "@/components/skeleton";
import { EmptyState, PageHeader } from "@/components/page-header";

export function MortalityPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
  const t = getClientDictionary(locale);
  const [data, setData] = useState<{
    activeMothers: LocalRabbit[];
    activeBucks: LocalRabbit[];
    activeStock: LocalRabbit[];
    deceasedRabbits: LocalDeceasedRabbit[];
    culledRabbits: LocalDeceasedRabbit[];
    kitDeaths: LocalKitDeath[];
    nursingDoes: { doe: { id: string; tagId: string; breed: string }; breedingId: string; litter: { bornAlive: number; bornDead: number } }[];
    availableWeanedStock: number;
  } | null>(null);

  const [nursingCounts, setNursingCounts] = useState<Record<string, number>>({});
  const [weanedCount, setWeanedCount] = useState(1);
  const [nursingTag, setNursingTag] = useState("");
  // Which nursing does the farmer has pulled up this session, in the order he
  // typed them. Breeding ids, not doe ids: the litter is what a death is
  // recorded against, and it is what the counts below are keyed by.
  const [shownBreedingIds, setShownBreedingIds] = useState<string[]>([]);
  const [motherTag, setMotherTag] = useState("");
  const [buckTag, setBuckTag] = useState("");
  const [stockCage, setStockCage] = useState("");

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchMortalityPageData(db);
    setData(res);

    // Reset nursing kit counts inputs
    const initialCounts: Record<string, number> = {};
    for (const row of res.nursingDoes) {
      initialCounts[row.breedingId] = 1;
    }
    setNursingCounts(initialCounts);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  const handleNursingDeath = async (breedingId: string, available: number) => {
    const count = nursingCounts[breedingId] || 1;
    if (count < 1 || count > available) {
      toast.error(locale === "ar" ? "العدد غير صحيح" : "Invalid count");
      return;
    }

    const confirmed = window.confirm(t.mortality.nursingKitDeathConfirm(count));
    if (!confirmed) return;

    try {
      await enqueue("recordNursingKitDeath", { breedingId, count });
      toast.success(t.mortality.kitDeathToast(count));
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  const handleWeanedDeath = async () => {
    if (!data || data.availableWeanedStock <= 0) return;
    if (weanedCount < 1 || weanedCount > data.availableWeanedStock) {
      toast.error(locale === "ar" ? "العدد غير صحيح" : "Invalid count");
      return;
    }

    const confirmed = window.confirm(t.mortality.weaningStockDeathConfirm(weanedCount));
    if (!confirmed) return;

    try {
      // The date is sent explicitly: the server used to fall back to
      // `new Date(undefined)` on this payload and reject the whole op.
      await enqueue("recordWeanedKitDeath", { count: weanedCount, date: todayIso() });
      toast.success(t.mortality.weaningStockDeathToast(weanedCount));
      setWeanedCount(1);
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  const activeMothers = data?.activeMothers ?? [];
  const activeBucks = data?.activeBucks ?? [];
  const activeStock = data?.activeStock ?? [];
  const deceasedRabbits = (data?.deceasedRabbits ?? []).filter((r) => isToday(r.updatedAt));
  const kitDeaths = (data?.kitDeaths ?? []).filter((r) => isToday(r.date));
  const culledRabbits = (data?.culledRabbits ?? []).filter((r) => isToday(r.updatedAt));
  const nursingDoes = data?.nursingDoes ?? [];
  const availableWeanedStock = data?.availableWeanedStock ?? 0;

  // نافق الرضاعة is looked up the same way: the doe is typed in and «اعرض»
  // pulls her row into a short working table, instead of listing every nursing
  // doe on the farm. Rows are re-read from `nursingDoes` on each render so the
  // counts stay fresh after a death is recorded — and a doe whose last live kit
  // is gone leaves that list, so her row correctly disappears with nothing left
  // to record.
  const nursingQuery = nursingTag.trim();
  const nursingMatch = nursingQuery
    ? (nursingDoes.find((r) => (r.doe.tagId ?? "").trim() === nursingQuery) ?? null)
    : null;
  const shownNursing = shownBreedingIds
    .map((id) => nursingDoes.find((r) => r.breedingId === id))
    .filter((r): r is (typeof nursingDoes)[number] => r != null);

  // نافق الأمهات/الذكور are entered by tag number rather than picked out of a
  // table of the whole herd, so the match resolves locally off the already-
  // loaded list — no query, and the feedback lands as the farmer types.
  const motherQuery = motherTag.trim();
  const motherMatch = motherQuery
    ? (activeMothers.find((d) => (d.tagId ?? "").trim() === motherQuery) ?? null)
    : null;
  const buckQuery = buckTag.trim();
  const buckMatch = buckQuery
    ? (activeBucks.find((b) => (b.tagId ?? "").trim() === buckQuery) ?? null)
    : null;

  const recordTaggedDeath = async (
    match: LocalRabbit | null,
    confirmText: string,
    clear: () => void,
  ) => {
    if (!match) return;
    if (!window.confirm(confirmText)) return;
    try {
      await enqueue("setRabbitStatus", { id: match.id, status: "deceased" });
      toast.success(t.mortality.deceasedToast);
      clear();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  // Untagged stock has no number of its own, so the cage is the handle — and a
  // cage routinely holds several rabbits, so this filters to a list rather than
  // resolving to one match like the doe/buck forms above.
  const stockQuery = stockCage.trim();
  const stockMatches = stockQuery
    ? activeStock.filter((r) => (r.cage ?? "").trim() === stockQuery)
    : [];

  if (!data) {
    return <PageSkeleton label={locale === "ar" ? "جارِ التحميل…" : "Loading…"} />;
  }

  return (
    <div className="space-y-8">
      {!hideHeader && (
        <PageHeader
          title={t.mortality.title}
          description={t.mortality.description}
        />
      )}

      {/* 1. رضيع الرضاعة (Nursing Kit Mortality) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.nursingSectionTitle}</h2>
        {nursingDoes.length === 0 ? (
          <EmptyState
            icon={Skull}
            title={t.mortality.nursingEmptyTitle}
            description={t.mortality.nursingEmptyDescription}
          />
        ) : (
          <div className="space-y-3">
            <Card>
              <CardContent className="space-y-3 py-5">
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!nursingMatch) return;
                    setShownBreedingIds((prev) =>
                      prev.includes(nursingMatch.breedingId)
                        ? prev
                        : [...prev, nursingMatch.breedingId],
                    );
                    setNursingTag("");
                  }}
                >
                  <div className="flex-1 space-y-1.5">
                    <label className="text-sm font-semibold" htmlFor="nursing-death-tag">
                      {t.mortality.colMotherTag}
                    </label>
                    <Input
                      id="nursing-death-tag"
                      inputMode="numeric"
                      autoComplete="off"
                      value={nursingTag}
                      placeholder={t.mortality.motherTagPlaceholder}
                      onChange={(e) => setNursingTag(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="text-sm font-semibold" htmlFor="nursing-death-breed">
                      {t.mortality.colBreed}
                    </label>
                    <Input
                      id="nursing-death-breed"
                      readOnly
                      tabIndex={-1}
                      value={nursingMatch ? (nursingMatch.doe.breed ?? "—") : ""}
                      className="bg-muted/50 font-medium"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!nursingMatch}
                    className="h-9 px-4 text-xs"
                  >
                    {t.mortality.showRowButton}
                  </Button>
                </form>
                {!nursingMatch && nursingQuery.length > 0 ? (
                  <p className="text-sm font-medium text-destructive">
                    {t.mortality.nursingMotherNotFound}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t.mortality.nursingFormHint}</p>
                )}
              </CardContent>
            </Card>

            {shownNursing.length > 0 ? (
              <div className="rounded-xl border bg-card overflow-x-auto">
                <table className="w-full text-sm text-left rtl:text-right border-collapse">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase">
                    <tr className="[&>th]:border-x">
                      <th className="px-4 py-3 text-center">{t.mortality.colIndex}</th>
                      <th className="px-4 py-3 text-center">{t.mortality.colMotherTag}</th>
                      <th className="px-4 py-3 text-center">{t.mortality.colAlive}</th>
                      <th className="px-4 py-3 text-center">{t.mortality.colDead}</th>
                      <th className="px-4 py-3 text-center w-48">{t.mortality.colRecordDeath}</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shownNursing.map(({ doe, breedingId, litter }, i) => {
                      const countInput = nursingCounts[breedingId] || 1;
                      return (
                        <tr key={doe.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                          <td className="px-4 py-3.5 text-center text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3.5 text-center font-bold">{doe.tagId}</td>
                          <td className="px-4 py-3.5 text-center font-semibold text-emerald-600 dark:text-emerald-400">{litter.bornAlive}</td>
                          <td className="px-4 py-3.5 text-center font-semibold text-red-600 dark:text-red-400">{litter.bornDead}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                max={litter.bornAlive}
                                value={countInput}
                                className="h-8 w-16 px-2 text-center text-xs"
                                onChange={(e) => {
                                  const v = Math.min(litter.bornAlive, Math.max(1, parseInt(e.target.value, 10) || 1));
                                  setNursingCounts({ ...nursingCounts, [breedingId]: v });
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                                onClick={() => handleNursingDeath(breedingId, litter.bornAlive)}
                              >
                                {t.mortality.recordNursingDeathButton}
                              </Button>
                            </div>
                          </td>
                          <td className="px-2 py-3.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t.mortality.removeRowLabel}
                              title={t.mortality.removeRowLabel}
                              className="size-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setShownBreedingIds((prev) =>
                                  prev.filter((id) => id !== breedingId),
                                )
                              }
                            >
                              <X className="size-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 2. نافق الفطام (Weaning Kit Mortality) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.weaningStockSectionTitle}</h2>
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-xs text-muted-foreground">{t.mortality.availableWeanedStockLabel}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{availableWeanedStock}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={Math.max(availableWeanedStock, 1)}
                value={weanedCount}
                disabled={availableWeanedStock <= 0}
                className="h-8 w-16 px-2 text-center text-xs"
                onChange={(e) => setWeanedCount(Math.min(availableWeanedStock, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={availableWeanedStock <= 0}
                className="h-8 px-3 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                onClick={handleWeanedDeath}
              >
                {t.mortality.recordWeaningDeathButton}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. نافق الأمهات — رقم الأم + زرار، بدل جدول بكل أمهات المزرعة */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.mothersSectionTitle}</h2>
        {activeMothers.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.mothersEmptyTitle} />
        ) : (
          <DeathByTagForm
            idPrefix="mother"
            tagLabel={t.mortality.colMotherTag}
            breedLabel={t.mortality.colBreed}
            placeholder={t.mortality.motherTagPlaceholder}
            notFoundLabel={t.mortality.motherNotFound}
            hint={t.mortality.mothersFormHint}
            buttonLabel={t.mortality.recordDeceasedButton}
            value={motherTag}
            onChange={setMotherTag}
            match={motherMatch}
            onSubmit={() =>
              void recordTaggedDeath(
                motherMatch,
                t.mortality.motherDeathConfirm(motherMatch?.tagId ?? ""),
                () => setMotherTag(""),
              )
            }
          />
        )}
      </div>

      {/* 4. نافق الذكور — رقم الذكر + زرار، بدل جدول بكل ذكور المزرعة */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.bucksSectionTitle}</h2>
        {activeBucks.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.bucksEmptyTitle} />
        ) : (
          <DeathByTagForm
            idPrefix="buck"
            tagLabel={t.mortality.colBuckTag}
            breedLabel={t.mortality.colBreed}
            placeholder={t.mortality.buckTagPlaceholder}
            notFoundLabel={t.mortality.buckNotFound}
            hint={t.mortality.bucksFormHint}
            buttonLabel={t.mortality.recordDeceasedButton}
            value={buckTag}
            onChange={setBuckTag}
            match={buckMatch}
            onSubmit={() =>
              void recordTaggedDeath(
                buckMatch,
                t.mortality.buckDeathConfirm(buckMatch?.tagId ?? ""),
                () => setBuckTag(""),
              )
            }
          />
        )}
      </div>

      {/* 5. نافق السلالات (Strains/Stock Mortality) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.strainsSectionTitle}</h2>
        {activeStock.length === 0 ? (
          <EmptyState icon={Skull} title={t.mortality.strainsEmptyTitle} />
        ) : (
          <Card>
            <CardContent className="space-y-4 py-5">
              <div className="space-y-1.5 sm:max-w-xs">
                <label className="text-sm font-semibold" htmlFor="stock-death-cage">
                  {t.mortality.colCage}
                </label>
                <Input
                  id="stock-death-cage"
                  inputMode="numeric"
                  autoComplete="off"
                  value={stockCage}
                  placeholder={t.mortality.cagePlaceholder}
                  onChange={(e) => setStockCage(e.target.value)}
                />
              </div>

              {stockMatches.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full border-collapse text-sm text-left rtl:text-right">
                    <thead className="bg-muted text-muted-foreground text-xs uppercase">
                      <tr className="[&>th]:border-x">
                        <th className="px-4 py-3 text-center w-16">{t.mortality.colIndex}</th>
                        <th className="px-4 py-3 text-center">{t.mortality.colSex}</th>
                        <th className="px-4 py-3 text-center">{t.mortality.colStrainBreed}</th>
                        <th className="px-4 py-3 text-center w-36">
                          {t.mortality.colRecordDeceased}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {stockMatches.map((r, i) => (
                        <tr
                          key={r.id}
                          className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center"
                        >
                          <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3">
                            {r.sex === "doe"
                              ? locale === "ar"
                                ? "أنثى"
                                : "Doe"
                              : locale === "ar"
                                ? "ذكر"
                                : "Buck"}
                          </td>
                          <td className="px-4 py-3">{r.breed ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-3 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                              onClick={() =>
                                void recordTaggedDeath(
                                  r,
                                  t.mortality.strainDeathConfirm,
                                  () => undefined,
                                )
                              }
                            >
                              {t.mortality.recordDeceasedButton}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : stockCage.trim().length > 0 ? (
                <p className="text-sm font-medium text-destructive">{t.mortality.cageNotFound}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t.mortality.strainsFormHint}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <MortalityLog
        deceasedRabbits={deceasedRabbits}
        kitDeaths={kitDeaths}
        locale={locale}
        todayOnly
      />

      <CullingLog culledRabbits={culledRabbits} locale={locale} todayOnly />
    </div>
  );
}

/**
 * رقم الأم/الذكر + النوع + زرار تسجيل نافق — the same card serves both tagged
 * sections. النوع is filled in from the matched rabbit as confirmation that the
 * typed number is the right animal, so it's read-only, and the button stays
 * disabled until a number actually matches something in the herd.
 */
function DeathByTagForm({
  idPrefix,
  tagLabel,
  breedLabel,
  placeholder,
  notFoundLabel,
  hint,
  buttonLabel,
  value,
  onChange,
  match,
  onSubmit,
}: {
  idPrefix: string;
  tagLabel: string;
  breedLabel: string;
  placeholder: string;
  notFoundLabel: string;
  hint: string;
  buttonLabel: string;
  value: string;
  onChange: (next: string) => void;
  match: LocalRabbit | null;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-semibold" htmlFor={`${idPrefix}-death-tag`}>
              {tagLabel}
            </label>
            <Input
              id={`${idPrefix}-death-tag`}
              inputMode="numeric"
              autoComplete="off"
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-semibold" htmlFor={`${idPrefix}-death-breed`}>
              {breedLabel}
            </label>
            <Input
              id={`${idPrefix}-death-breed`}
              readOnly
              tabIndex={-1}
              value={match ? (match.breed ?? "—") : ""}
              className="bg-muted/50 font-medium"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={!match}
            className="h-9 px-4 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
          >
            {buttonLabel}
          </Button>
        </form>
        {!match && value.trim().length > 0 ? (
          <p className="text-sm font-medium text-destructive">{notFoundLabel}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
