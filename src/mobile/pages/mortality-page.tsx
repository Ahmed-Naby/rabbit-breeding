import { useEffect, useState, useCallback, useTransition } from "react";
import { Skull, Layers, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchMortalityPageData, type LocalDeceasedRabbit } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { enqueue } from "../sync/outbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import type { LocalRabbit } from "../db/types";

export function MortalityPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [data, setData] = useState<{
    activeMothers: LocalRabbit[];
    activeBucks: LocalRabbit[];
    activeStock: LocalRabbit[];
    deceasedRabbits: LocalDeceasedRabbit[];
    culledRabbits: LocalDeceasedRabbit[];
    nursingDoes: { doe: { id: string; tagId: string; breed: string }; breedingId: string; litter: { bornAlive: number; bornDead: number } }[];
    availableWeanedStock: number;
  } | null>(null);

  const [nursingCounts, setNursingCounts] = useState<Record<string, number>>({});
  const [weanedCount, setWeanedCount] = useState(1);
  const [pending, startTransition] = useState(false);

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

  const handleMarkDeceased = async (id: string, name: string) => {
    const confirmed = window.confirm(
      locale === "ar" ? `هل أنت متأكد من تسجيل الأرنب "${name}" كـ نافق؟` : `Are you sure you want to mark "${name}" as deceased?`
    );
    if (!confirmed) return;

    try {
      await enqueue("setRabbitStatus", { id, status: "deceased" });
      toast.success(t.mortality.deceasedToast);
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

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
      await enqueue("recordWeanedKitDeath", { count: weanedCount });
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
  const deceasedRabbits = data?.deceasedRabbits ?? [];
  const culledRabbits = data?.culledRabbits ?? [];
  const nursingDoes = data?.nursingDoes ?? [];
  const availableWeanedStock = data?.availableWeanedStock ?? 0;

  const nursingSort = useSortableRows(nursingDoes, {
    tag: { type: "tag", value: (r) => r.doe.tagId },
    alive: { type: "number", value: (r) => r.litter.bornAlive },
    dead: { type: "number", value: (r) => r.litter.bornDead },
  });
  const mothersSort = useSortableRows(activeMothers, {
    tag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
  });
  const bucksSort = useSortableRows(activeBucks, {
    tag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
  });
  const stockSort = useSortableRows(activeStock, {
    sex: { type: "string", value: (r) => r.sex },
    breed: { type: "string", value: (r) => r.breed },
    cage: { type: "tag", value: (r) => r.cage },
  });
  const deceasedSort = useSortableRows(deceasedRabbits, {
    date: { type: "date", value: (r) => r.updatedAt },
    tag: { type: "tag", value: (r) => r.retiredTagId ?? r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    sex: { type: "string", value: (r) => r.sex },
  });
  const culledSort = useSortableRows(culledRabbits, {
    date: { type: "date", value: (r) => r.updatedAt },
    tag: { type: "tag", value: (r) => r.retiredTagId ?? r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    sex: { type: "string", value: (r) => r.sex },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.mortality.title}</h1>
        <p className="text-sm text-muted-foreground">{t.mortality.description}</p>
      </div>

      {/* 1. رضيع الرضاعة (Nursing Kit Mortality) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.nursingSectionTitle}</h2>
        {nursingDoes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
            <Skull className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t.mortality.nursingEmptyTitle}</p>
            <p className="text-sm">{t.mortality.nursingEmptyDescription}</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center">{t.mortality.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colMotherTag}
                    sortKey="tag"
                    activeSortKey={nursingSort.sortKey}
                    direction={nursingSort.direction}
                    onSort={nursingSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colAlive}
                    sortKey="alive"
                    activeSortKey={nursingSort.sortKey}
                    direction={nursingSort.direction}
                    onSort={nursingSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colDead}
                    sortKey="dead"
                    activeSortKey={nursingSort.sortKey}
                    direction={nursingSort.direction}
                    onSort={nursingSort.toggleSort}
                  />
                  <th className="px-4 py-3 text-center w-48">{t.mortality.colRecordDeath}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {nursingSort.sorted.map(({ doe, breedingId, litter }, i) => {
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

      {/* 3. نافق الأمهات (Active Does Mortality) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.mothersSectionTitle}</h2>
        {activeMothers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
            <Skull className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t.mortality.mothersEmptyTitle}</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center w-16">{t.mortality.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colMotherTag}
                    sortKey="tag"
                    activeSortKey={mothersSort.sortKey}
                    direction={mothersSort.direction}
                    onSort={mothersSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colBreed}
                    sortKey="breed"
                    activeSortKey={mothersSort.sortKey}
                    direction={mothersSort.direction}
                    onSort={mothersSort.toggleSort}
                  />
                  <th className="px-4 py-3 text-center w-36">{t.mortality.colRecordDeceased}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mothersSort.sorted.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-center font-bold">{r.tagId}</td>
                    <td className="px-4 py-3 text-center">{r.breed ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                        onClick={() => handleMarkDeceased(r.id, r.tagId!)}
                      >
                        {t.mortality.recordDeceasedButton}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. نافق الذكور (Active Bucks Mortality) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.bucksSectionTitle}</h2>
        {activeBucks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
            <Skull className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t.mortality.bucksEmptyTitle}</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center w-16">{t.mortality.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colBuckTag}
                    sortKey="tag"
                    activeSortKey={bucksSort.sortKey}
                    direction={bucksSort.direction}
                    onSort={bucksSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colBreed}
                    sortKey="breed"
                    activeSortKey={bucksSort.sortKey}
                    direction={bucksSort.direction}
                    onSort={bucksSort.toggleSort}
                  />
                  <th className="px-4 py-3 text-center w-36">{t.mortality.colRecordDeceased}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bucksSort.sorted.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-center font-bold">{r.tagId}</td>
                    <td className="px-4 py-3 text-center">{r.breed ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                        onClick={() => handleMarkDeceased(r.id, r.tagId!)}
                      >
                        {t.mortality.recordDeceasedButton}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. نافق السلالات (Strains/Stock Mortality) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t.mortality.strainsSectionTitle}</h2>
        {activeStock.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
            <Skull className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t.mortality.strainsEmptyTitle}</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center w-16">{t.mortality.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colSex}
                    sortKey="sex"
                    activeSortKey={stockSort.sortKey}
                    direction={stockSort.direction}
                    onSort={stockSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colStrainBreed}
                    sortKey="breed"
                    activeSortKey={stockSort.sortKey}
                    direction={stockSort.direction}
                    onSort={stockSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.mortality.colCage}
                    sortKey="cage"
                    activeSortKey={stockSort.sortKey}
                    direction={stockSort.direction}
                    onSort={stockSort.toggleSort}
                  />
                  <th className="px-4 py-3 text-center w-36">{t.mortality.colRecordDeceased}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stockSort.sorted.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 text-center">
                      {r.sex === "doe" ? (locale === "ar" ? "أنثى" : "Doe") : (locale === "ar" ? "ذكر" : "Buck")}
                    </td>
                    <td className="px-4 py-3 text-center">{r.breed ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{r.cage ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                        onClick={() => handleMarkDeceased(r.id, `${r.breed ?? "—"} (قفس ${r.cage ?? "—"})`)}
                      >
                        {t.mortality.recordDeceasedButton}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. سجل الوفيات (Mortality Ledger) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{locale === "ar" ? "سجل حالات النفوق" : "Mortality History Log"}</h2>
        {deceasedRabbits.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
            <Layers className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{locale === "ar" ? "لا توجد حالات نفوق مسجلة" : "No deceased records logged"}</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={locale === "ar" ? "التاريخ" : "Date"}
                    sortKey="date"
                    activeSortKey={deceasedSort.sortKey}
                    direction={deceasedSort.direction}
                    onSort={deceasedSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={locale === "ar" ? "رقم الأرنب" : "Rabbit Tag ID"}
                    sortKey="tag"
                    activeSortKey={deceasedSort.sortKey}
                    direction={deceasedSort.direction}
                    onSort={deceasedSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={locale === "ar" ? "السلالة" : "Breed"}
                    sortKey="breed"
                    activeSortKey={deceasedSort.sortKey}
                    direction={deceasedSort.direction}
                    onSort={deceasedSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={locale === "ar" ? "الجنس" : "Sex"}
                    sortKey="sex"
                    activeSortKey={deceasedSort.sortKey}
                    direction={deceasedSort.direction}
                    onSort={deceasedSort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {deceasedSort.sorted.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3.5 text-center">
                      <LocalDate date={new Date(entry.updatedAt)} />
                    </td>
                    <td className="px-4 py-3.5 font-bold">{entry.retiredTagId ?? entry.tagId ?? "—"}</td>
                    <td className="px-4 py-3.5">{entry.breed ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      {entry.sex === "doe" ? (locale === "ar" ? "أنثى" : "Doe") : (locale === "ar" ? "ذكر" : "Buck")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. سجل الاستبعادات (Culling Ledger) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{locale === "ar" ? "سجل الاستبعادات" : "Culling Record"}</h2>
        {culledRabbits.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
            <Layers className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{locale === "ar" ? "لا يوجد حيوانات مستبعدة" : "No culled rabbits"}</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={locale === "ar" ? "التاريخ" : "Date"}
                    sortKey="date"
                    activeSortKey={culledSort.sortKey}
                    direction={culledSort.direction}
                    onSort={culledSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={locale === "ar" ? "رقم الأرنب" : "Rabbit Tag ID"}
                    sortKey="tag"
                    activeSortKey={culledSort.sortKey}
                    direction={culledSort.direction}
                    onSort={culledSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={locale === "ar" ? "السلالة" : "Breed"}
                    sortKey="breed"
                    activeSortKey={culledSort.sortKey}
                    direction={culledSort.direction}
                    onSort={culledSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={locale === "ar" ? "الجنس" : "Sex"}
                    sortKey="sex"
                    activeSortKey={culledSort.sortKey}
                    direction={culledSort.direction}
                    onSort={culledSort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {culledSort.sorted.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3.5 text-center">
                      <LocalDate date={new Date(entry.updatedAt)} />
                    </td>
                    <td className="px-4 py-3.5 font-bold">{entry.retiredTagId ?? entry.tagId ?? "—"}</td>
                    <td className="px-4 py-3.5">{entry.breed ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      {entry.sex === "doe" ? (locale === "ar" ? "أنثى" : "Doe") : (locale === "ar" ? "ذكر" : "Buck")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
