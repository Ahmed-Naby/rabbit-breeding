import { useEffect, useState, useCallback, useRef } from "react";
import {
  History,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Loader2,
  Pencil,
  Percent,
  Baby,
  Repeat2,
  Egg,
  Users,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { label, RABBIT_STATUSES } from "@/lib/enums";
import { gramsToKg, formatWeight } from "@/lib/units";
import { LocalDate } from "@/components/local-date";
import { StatusBadge } from "@/components/status-badge";
import { MetricBadge } from "@/components/metric-badge";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { toDateInputValue, fromDateInputValue } from "@/lib/dates";
import { computeDoeFertilityStats } from "@/lib/doe-stats";
import { getDb } from "../db/client";
import { enqueue } from "../sync/outbox";
import {
  fetchRabbitBasic,
  fetchDoeBreedingHistory,
  fetchBuckBreedingHistory,
  fetchBreedOptions,
  type LocalRabbitBasic,
  type DoeBreedingHistoryRow,
  type BuckBreedingHistoryRow,
} from "../db/queries";

export function RabbitDetailPage({ locale, rabbitId }: { locale: Locale; rabbitId: string }) {
  const t = getClientDictionary(locale).rabbits;
  const [rabbit, setRabbit] = useState<LocalRabbitBasic | null | undefined>(undefined);
  const [doeHistory, setDoeHistory] = useState<DoeBreedingHistoryRow[]>([]);
  const [buckHistory, setBuckHistory] = useState<BuckBreedingHistoryRow[]>([]);
  const [breedOptions, setBreedOptions] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const r = await fetchRabbitBasic(db, rabbitId);
    setRabbit(r);
    setBreedOptions(await fetchBreedOptions(db));
    if (!r) return;
    if (r.sex === "doe") {
      setDoeHistory(await fetchDoeBreedingHistory(db, rabbitId));
    } else if (r.sex === "buck") {
      setBuckHistory(await fetchBuckBreedingHistory(db, rabbitId));
    }
  }, [rabbitId]);

  useEffect(() => {
    void load();
  }, [load]);

  const doeHistorySort = useSortableRows(doeHistory, {
    matingDate: { type: "date", value: (r) => r.matingDate },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    testDate: { type: "date", value: (r) => r.testDate },
    testResult: { type: "string", value: (r) => r.testResult },
    kindlingDate: { type: "date", value: (r) => r.kindlingDate },
    bornAlive: { type: "number", value: (r) => r.bornAlive },
    bornDead: { type: "number", value: (r) => r.bornDead },
    weaningDate: { type: "date", value: (r) => r.weaningDate },
    weanedCount: { type: "number", value: (r) => r.weaned },
  });

  const buckHistorySort = useSortableRows(buckHistory, {
    matingDate: { type: "date", value: (r) => r.matingDate },
    doeTag: { type: "tag", value: (r) => r.doeTagId },
    doeBreed: { type: "string", value: (r) => r.doeBreed },
    doeState: { type: "string", value: (r) => r.testResult },
    bornCount: { type: "number", value: (r) => r.bornAlive },
  });

  if (rabbit === undefined) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  if (rabbit === null) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
        <p className="font-medium">{locale === "ar" ? "الأرنب غير موجود محليًا" : "Rabbit not found locally"}</p>
      </div>
    );
  }

  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const displayTag = rabbit.tagId ?? rabbit.retiredTagId;
  const backHref =
    displayTag == null
      ? "#/stock"
      : rabbit.sex === "buck"
      ? "#/bucks"
      : "#/mothers";
  const backLabel =
    displayTag == null
      ? t.detailBackToStock
      : rabbit.sex === "buck"
      ? t.detailBackToBucks
      : t.detailBackToMothers;
  const title = displayTag ? t.taggedTitle(displayTag) : t.untaggedTitle;

  const isHerdRabbit = displayTag != null;

  return (
    <div className="space-y-6">
      <a href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline">
        <BackIcon className="h-4 w-4" />
        {backLabel}
      </a>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={rabbit.status} locale={locale} />
              <StatusBadge value={rabbit.sex} locale={locale} />
              {rabbit.origin ? <StatusBadge value={rabbit.origin} locale={locale} /> : null}
              {rabbit.breed ? <span className="text-sm text-muted-foreground">{rabbit.breed}</span> : null}
              {rabbit.weightGrams ? (
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {formatWeight(rabbit.weightGrams, "kg", locale)}
                </span>
              ) : null}
            </div>
          </div>
          {rabbit.acquiredDate ? (
            <MetricBadge label={isHerdRabbit ? (t.joinedHerdLabelHerd ?? t.joinedHerdLabel) : t.joinedHerdLabel} value={<LocalDate date={rabbit.acquiredDate} locale={locale} />} />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusMenu id={rabbit.id} current={rabbit.status} locale={locale} onDone={load} />
          {isHerdRabbit && (
            <Button size="sm" onClick={() => setEditing((v) => !v)}>
              <Pencil className="size-4" />
              {rabbit.sex === "doe" ? t.editDoeCardButton : rabbit.sex === "buck" ? t.editBuckCardButton : t.editRabbitCardButton}
            </Button>
          )}
        </div>
        {editing && (
          <EditRabbitForm
            rabbit={rabbit}
            breedOptions={breedOptions}
            locale={locale}
            isHerdRabbit={isHerdRabbit}
            onDone={() => {
              setEditing(false);
              void load();
            }}
            onCancel={() => setEditing(false)}
          />
        )}
      </div>

      {!isHerdRabbit && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {locale === "ar" ? "كارت السلالة" : "Stock Card"}
          </h2>
          <EditRabbitForm
            rabbit={rabbit}
            breedOptions={breedOptions}
            locale={locale}
            onDone={() => void load()}
          />
        </div>
      )}

      {isHerdRabbit && rabbit.sex === "doe" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{t.fertilityStatsHeading}</h2>
          <DoeFertilityCards history={doeHistory} locale={locale} />
        </div>
      )}

      {isHerdRabbit && rabbit.sex === "buck" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{t.fertilityStatsHeading}</h2>
          <BuckFertilityCards history={buckHistory} locale={locale} />
        </div>
      )}

      {isHerdRabbit && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{t.breedingHistoryHeading}</h2>

        {rabbit.sex === "doe" && doeHistory.length === 0 && (
          <EmptyHistory icon={History} title={t.historyEmptyTitle} description={t.doeHistoryEmptyDescription} />
        )}
        {rabbit.sex === "doe" && doeHistory.length > 0 && (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center">{t.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colMatingDate}
                    sortKey="matingDate"
                    activeSortKey={doeHistorySort.sortKey}
                    direction={doeHistorySort.direction}
                    onSort={doeHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colBuckTag}
                    sortKey="buckTag"
                    activeSortKey={doeHistorySort.sortKey}
                    direction={doeHistorySort.direction}
                    onSort={doeHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="hidden md:table-cell px-4 py-3 text-center"
                    label={t.colTestDate}
                    sortKey="testDate"
                    activeSortKey={doeHistorySort.sortKey}
                    direction={doeHistorySort.direction}
                    onSort={doeHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colTestResult}
                    sortKey="testResult"
                    activeSortKey={doeHistorySort.sortKey}
                    direction={doeHistorySort.direction}
                    onSort={doeHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colKindlingDate}
                    sortKey="kindlingDate"
                    activeSortKey={doeHistorySort.sortKey}
                    direction={doeHistorySort.direction}
                    onSort={doeHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colBornAlive}
                    sortKey="bornAlive"
                    activeSortKey={doeHistorySort.sortKey}
                    direction={doeHistorySort.direction}
                    onSort={doeHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colBornDead}
                    sortKey="bornDead"
                    activeSortKey={doeHistorySort.sortKey}
                    direction={doeHistorySort.direction}
                    onSort={doeHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colWeaningDate}
                    sortKey="weaningDate"
                    activeSortKey={doeHistorySort.sortKey}
                    direction={doeHistorySort.direction}
                    onSort={doeHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colWeanedCount}
                    sortKey="weanedCount"
                    activeSortKey={doeHistorySort.sortKey}
                    direction={doeHistorySort.direction}
                    onSort={doeHistorySort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {doeHistorySort.sorted.map((c, i) => (
                  <tr key={c.matingDate} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3.5">
                      <LocalDate date={c.matingDate} locale={locale} />
                    </td>
                    <td className="px-4 py-3.5">{c.buckTagId ?? "—"}</td>
                    <td className="hidden md:table-cell px-4 py-3.5">{c.testDate ? <LocalDate date={c.testDate} locale={locale} /> : "—"}</td>
                    <td className="px-4 py-3.5">{c.testResult ? label(c.testResult, locale) : "—"}</td>
                    <td className="px-4 py-3.5">{c.kindlingDate ? <LocalDate date={c.kindlingDate} locale={locale} /> : "—"}</td>
                    <td className="px-4 py-3.5">{c.bornAlive ?? "—"}</td>
                    <td className="px-4 py-3.5">{c.bornDead ?? "—"}</td>
                    <td className="px-4 py-3.5">{c.weaningDate ? <LocalDate date={c.weaningDate} locale={locale} /> : "—"}</td>
                    <td className="px-4 py-3.5">{c.weaned ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rabbit.sex === "buck" && buckHistory.length === 0 && (
          <EmptyHistory icon={History} title={t.historyEmptyTitle} description={t.buckHistoryEmptyDescription} />
        )}
        {rabbit.sex === "buck" && buckHistory.length > 0 && (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 text-center">{t.colIndex}</th>
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colMatingDate}
                    sortKey="matingDate"
                    activeSortKey={buckHistorySort.sortKey}
                    direction={buckHistorySort.direction}
                    onSort={buckHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colDoeTag}
                    sortKey="doeTag"
                    activeSortKey={buckHistorySort.sortKey}
                    direction={buckHistorySort.direction}
                    onSort={buckHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colDoeBreed}
                    sortKey="doeBreed"
                    activeSortKey={buckHistorySort.sortKey}
                    direction={buckHistorySort.direction}
                    onSort={buckHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colDoeState}
                    sortKey="doeState"
                    activeSortKey={buckHistorySort.sortKey}
                    direction={buckHistorySort.direction}
                    onSort={buckHistorySort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colBornCount}
                    sortKey="bornCount"
                    activeSortKey={buckHistorySort.sortKey}
                    direction={buckHistorySort.direction}
                    onSort={buckHistorySort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {buckHistorySort.sorted.map((c, i) => (
                  <tr key={`${c.doeId}_${c.matingDate}`} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3.5">
                      <LocalDate date={c.matingDate} locale={locale} />
                    </td>
                    <td className="px-4 py-3.5">{c.doeTagId ?? "—"}</td>
                    <td className="px-4 py-3.5">{c.doeBreed ?? "—"}</td>
                    <td className="px-4 py-3.5">{c.testResult ? label(c.testResult, locale) : "—"}</td>
                    <td className="px-4 py-3.5">
                      {c.bornAlive != null ? (c.bornDead ? t.bornWithDead(c.bornAlive, c.bornDead) : c.bornAlive) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function EmptyHistory({ icon: Icon, title, description }: { icon: typeof History; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="text-sm">{description}</p>
    </div>
  );
}

function DoeFertilityCards({
  history,
  locale,
}: {
  history: DoeBreedingHistoryRow[];
  locale: Locale;
}) {
  const t = getClientDictionary(locale).rabbits;
  const stats = computeDoeFertilityStats(history);

  return (
    <div className="grid grid-cols-3 gap-2">
      <MetricCard compact icon={Repeat2} tone="violet" label={t.totalMatingsLabel} value={stats.totalMatings} />
      <MetricCard compact icon={Egg} tone="fuchsia" label={t.totalKindlingsLabel} value={stats.totalKindlings} />
      <MetricCard
        compact
        icon={Percent}
        tone="emerald"
        label={t.fertilityRateLabel}
        value={stats.fertilityRatePct != null ? `${Math.round(stats.fertilityRatePct)}%` : "—"}
      />
      <MetricCard
        compact
        icon={Baby}
        tone="sky"
        label={t.avgLitterSizeLabel}
        value={stats.avgLitterSize != null ? stats.avgLitterSize.toFixed(1) : "—"}
      />
      <MetricCard
        compact
        icon={Users}
        tone="amber"
        label={t.avgWeanedLabel}
        value={stats.avgWeaned != null ? stats.avgWeaned.toFixed(1) : "—"}
      />
      <MetricCard
        compact
        icon={ShieldCheck}
        tone="rose"
        label={t.weaningRetentionLabel}
        value={stats.weaningRetentionPct != null ? `${Math.round(stats.weaningRetentionPct)}%` : "—"}
      />
    </div>
  );
}

function BuckFertilityCards({
  history,
  locale,
}: {
  history: BuckBreedingHistoryRow[];
  locale: Locale;
}) {
  const t = getClientDictionary(locale).rabbits;
  const stats = computeDoeFertilityStats(
    history.map((c) => ({
      testResult: c.testResult,
      kindlingDate: c.kindlingDate,
      bornAlive: c.bornAlive,
      weaned: null,
    }))
  );

  return (
    <div className="grid grid-cols-3 gap-2">
      <MetricCard compact icon={Repeat2} tone="violet" label={t.totalMatingsLabel} value={stats.totalMatings} />
      <MetricCard
        compact
        icon={Percent}
        tone="emerald"
        label={t.fertilityRateLabel}
        value={stats.fertilityRatePct != null ? `${Math.round(stats.fertilityRatePct)}%` : "—"}
      />
      <MetricCard
        compact
        icon={Baby}
        tone="sky"
        label={t.avgLitterSizeLabel}
        value={stats.avgLitterSize != null ? stats.avgLitterSize.toFixed(1) : "—"}
      />
    </div>
  );
}

function StatusMenu({
  id,
  current,
  locale,
  onDone,
}: {
  id: string;
  current: string;
  locale: Locale;
  onDone: () => void;
}) {
  const t = getClientDictionary(locale).rabbits;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <div className="relative inline-block">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setOpen((o) => !o)}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronDown className="size-3.5" />}
        {t.changeStatusButton}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 min-w-40 rounded-md border bg-popover p-1 shadow-md">
            {RABBIT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={s === current}
                className="block w-full rounded-sm px-2 py-1.5 text-start text-sm hover:bg-muted disabled:opacity-50"
                onClick={async () => {
                  setOpen(false);
                  setPending(true);
                  await enqueue("setRabbitStatus", { id, status: s });
                  toast.success(t.statusSetToast(label(s, locale)));
                  setPending(false);
                  onDone();
                }}
              >
                {label(s, locale)}
                {s === current ? t.currentSuffix : ""}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EditRabbitForm({
  rabbit,
  breedOptions,
  locale,
  onDone,
  onCancel,
  isHerdRabbit,
}: {
  rabbit: LocalRabbitBasic;
  breedOptions: string[];
  locale: Locale;
  onDone: () => void;
  onCancel?: () => void;
  isHerdRabbit?: boolean;
}) {
  const t = getClientDictionary(locale).rabbits;
  const tCommon = getClientDictionary(locale).common;
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const breed = formData.get("breed") as string;
    const color = formData.get("color") as string;
    const tagIdVal = formData.get("tagId") as string | null;
    const cage = formData.get("cage") as string;
    const weightKgStr = formData.get("weightKg") as string;
    const weightKg = weightKgStr !== "" ? Number(weightKgStr) : null;
    const acquiredDate = formData.get("acquiredDate") as string;
    const acquiredFrom = formData.get("acquiredFrom") as string;
    const notes = formData.get("notes") as string;

    try {
      if (weightKg != null && !isNaN(weightKg)) {
        await enqueue("saveQuickRabbitWeight", { id: rabbit.id, weightKg });
      }
      const res = await enqueue("updateRabbitDetails", {
        id: rabbit.id,
        ...(isHerdRabbit ? { tagId: tagIdVal?.trim() || null } : {}),
        breed: breed === "none" ? null : breed || null,
        color: color || null,
        cage: isHerdRabbit ? null : cage || null,
        dateOfBirth: null,
        acquiredDate: acquiredDate ? fromDateInputValue(acquiredDate).toISOString() : null,
        acquiredFrom: acquiredFrom || null,
        notes: notes || null,
      });
      if (res.outcome.status === "rejected" && res.outcome.resultMessage === "TAG_IN_USE") {
        toast.error(locale === "ar" ? "هذا الرقم مستخدم بالفعل لأرنب آخر" : "This tag number is already in use");
        return;
      }
      toast.success(t.saveChangesButton);
      onDone();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const allBreedOptions = Array.from(
    new Set([
      ...(rabbit.breed ? [rabbit.breed] : []),
      ...breedOptions,
    ])
  ).sort((a, b) => a.localeCompare(b, locale === "ar" ? "ar" : "en"));

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3 border-t pt-3">
      {/* Herd rabbits only: the stock variant is already wrapped in a titled
          "كارت السلالة" card by the caller, so titling here too would double it. */}
      {isHerdRabbit && (
        <h2 className="text-lg font-semibold tracking-tight">
          {rabbit.sex === "doe" ? t.doeCardTitle : rabbit.sex === "buck" ? t.buckCardTitle : t.rabbitCardTitle}
        </h2>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">{t.weightLabel || (locale === "ar" ? "الوزن (كجم)" : "Weight (kg)")}</label>
          <input
            key={`weight_${rabbit.id}_${rabbit.weightGrams}`}
            name="weightKg"
            type="number"
            step="0.25"
            min={0}
            defaultValue={rabbit.weightGrams ? gramsToKg(rabbit.weightGrams) : ""}
            placeholder={t.weightPlaceholder || "كجم"}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">{t.breedLabel}</label>
          <select
            key={`breed_${rabbit.id}_${rabbit.breed}_${allBreedOptions.length}`}
            name="breed"
            defaultValue={rabbit.breed ?? "none"}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="none">{tCommon.none}</option>
            {allBreedOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">{t.colorLabel}</label>
          <input
            key={`color_${rabbit.id}_${rabbit.color}`}
            name="color"
            type="text"
            defaultValue={rabbit.color ?? ""}
            placeholder={t.colorPlaceholder}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {isHerdRabbit ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">
              {rabbit.sex === "doe"
                ? (locale === "ar" ? "رقم الأم" : "Doe Number")
                : (locale === "ar" ? "رقم الذكر" : "Buck Number")}
            </label>
            <input
              key={`tagId_${rabbit.id}_${rabbit.tagId}`}
              name="tagId"
              type="text"
              defaultValue={rabbit.tagId ?? ""}
              placeholder={rabbit.sex === "doe" ? "رقم الأم" : "رقم الذكر"}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">{t.cageLabel}</label>
            <input
              key={`cage_${rabbit.id}_${rabbit.cage}`}
              name="cage"
              type="text"
              defaultValue={rabbit.cage ?? ""}
              placeholder={t.cagePlaceholder}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">
            {isHerdRabbit ? (t.joinedHerdLabelHerd ?? t.acquiredDateLabel) : t.acquiredDateLabel}
          </label>
          <input
            key={`acquiredDate_${rabbit.id}_${rabbit.acquiredDate}`}
            name="acquiredDate"
            type="date"
            defaultValue={toDateInputValue(rabbit.acquiredDate ? new Date(rabbit.acquiredDate) : null)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">{t.acquiredFromLabel}</label>
          <input
            key={`acquiredFrom_${rabbit.id}_${rabbit.acquiredFrom}`}
            name="acquiredFrom"
            type="text"
            defaultValue={rabbit.acquiredFrom ?? ""}
            placeholder={t.acquiredFromPlaceholder}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold">{t.notesLabel}</label>
        <textarea
          key={`notes_${rabbit.id}_${rabbit.notes}`}
          name="notes"
          rows={3}
          defaultValue={rabbit.notes ?? ""}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? tCommon.saving : t.saveChangesButton}
        </Button>
        {/* No onCancel means an always-open form (the stock card), which has
            nothing to close — there, cancel discards edits by restoring the
            inputs to their saved defaultValues instead of unmounting. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel ?? (() => formRef.current?.reset())}
          disabled={saving}
        >
          {t.cancelButton}
        </Button>
      </div>
    </form>
  );
}
