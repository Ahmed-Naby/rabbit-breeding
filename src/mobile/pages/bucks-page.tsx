import { useEffect, useState, useCallback, useRef } from "react";
import { Rabbit as RabbitIcon, Clock } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchBucksPageData } from "../db/queries";
import { enqueue } from "../sync/outbox";
import { LocalDate } from "@/components/local-date";
import { StatusBadge } from "@/components/status-badge";
import { RabbitTagBadge } from "@/components/rabbit-tag-badge";
import { formatWeight } from "@/lib/units";
import { toast } from "sonner";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

export function BucksPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
  const t = getClientDictionary(locale).bucks;
  const tCommon = getClientDictionary(locale).common;

  const [data, setData] = useState<{
    bucks: { id: string; tagId: string | null; breed: string | null; acquiredDate: string; weightGrams: number | null; status: string }[];
    pendingBucks: { id: string; breed: string | null; cage: string | null; weightKg: number | null }[];
    breedOptions: string[];
    settings: any;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const addFormRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchBucksPageData(db);
    setData(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddBuck = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const tagId = formData.get("tagId") as string;
    const breed = formData.get("breed") as string;
    const weightKgStr = formData.get("weightKg") as string;
    const weightKg = weightKgStr ? parseFloat(weightKgStr) : null;

    try {
      const res = await enqueue("createQuickRabbit", {
        tagId: tagId || null,
        breed: breed === "none" ? null : breed,
        sex: "buck",
        date: new Date().toISOString(),
        weightKg,
        origin: "external",
      });

      if (res.outcome.status === "rejected") {
        toast.error(res.outcome.resultMessage === "TAG_IN_USE" ? (locale === "ar" ? "رقم الأرنب مستخدم بالفعل" : "Tag ID already in use") : res.outcome.resultMessage);
      } else {
        toast.success(t.addedToast(tagId));
        addFormRef.current?.reset();
        await load();
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async (id: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const tagId = formData.get("tagId") as string;
    const weightKgStr = formData.get("weightKg") as string;
    const weightKg = weightKgStr ? parseFloat(weightKgStr) : 0;

    try {
      const res = await enqueue("finalizeBuck", {
        id,
        tagId,
        weightKg,
      });

      if (res.outcome.status === "rejected") {
        toast.error(res.outcome.resultMessage === "TAG_IN_USE" ? (locale === "ar" ? "رقم الأرنب مستخدم بالفعل" : "Tag ID already in use") : res.outcome.resultMessage);
      } else {
        toast.success(t.finalizedToast);
        await load();
      }
    } catch (err) {
      toast.error(String(err));
    }
  };

  const bucks = data?.bucks ?? [];
  const pendingBucks = data?.pendingBucks ?? [];
  const breedOptions = data?.breedOptions ?? [];
  const settings = data?.settings;

  const pendingSort = useSortableRows(pendingBucks, {
    breed: { type: "string", value: (r) => r.breed },
    weight: { type: "number", value: (r) => r.weightKg },
    cage: { type: "tag", value: (r) => r.cage },
  });
  const bucksSort = useSortableRows(bucks, {
    tag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    acquiredDate: { type: "date", value: (r) => r.acquiredDate },
    weight: { type: "number", value: (r) => r.weightGrams },
    status: { type: "string", value: (r) => r.status },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      {!hideHeader && (
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.description(bucks.length)}</p>
        </div>
      )}

      {/* Add Buck Form Card */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="p-6 pb-4">
          <h3 className="text-base font-semibold leading-none tracking-tight">{t.addFormTitle}</h3>
        </div>
        <div className="p-6 pt-0">
          <form ref={addFormRef} onSubmit={handleAddBuck} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">{t.tagLabel}</label>
                <input
                  name="tagId"
                  type="text"
                  maxLength={10}
                  required
                  placeholder={t.tagPlaceholder}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">{t.breedLabel}</label>
                <select
                  name="breed"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="none">{tCommon.none}</option>
                  {breedOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">{t.weightLabel}</label>
                <input
                  name="weightKg"
                  type="number"
                  step="0.25"
                  min={0}
                  placeholder={t.weightPlaceholder}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
            >
              {saving ? tCommon.saving : t.submitButton}
            </button>
          </form>
        </div>
      </div>

      {/* Pending Bucks Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t.pendingHeading(pendingBucks.length)}
        </h2>
        {pendingBucks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t.pendingEmptyTitle}</p>
            <p className="text-sm">{t.pendingEmptyDescription}</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colBreed}
                    sortKey="breed"
                    activeSortKey={pendingSort.sortKey}
                    direction={pendingSort.direction}
                    onSort={pendingSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colWeight}
                    sortKey="weight"
                    activeSortKey={pendingSort.sortKey}
                    direction={pendingSort.direction}
                    onSort={pendingSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 text-center"
                    label={t.colCage}
                    sortKey="cage"
                    activeSortKey={pendingSort.sortKey}
                    direction={pendingSort.direction}
                    onSort={pendingSort.toggleSort}
                  />
                  <th className="px-4 py-3 text-center">{t.colBuckTag}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingSort.sorted.map((r) => {
                  const formId = `finalize-buck-${r.id}`;
                  return (
                    <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                      <td className="px-4 py-3.5">{r.breed ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        <form id={formId} onSubmit={(e) => void handleFinalize(r.id, e)}>
                          <input type="hidden" name="id" value={r.id} />
                        </form>
                        <input
                          type="number"
                          name="weightKg"
                          form={formId}
                          step="0.25"
                          min={0}
                          required
                          defaultValue={r.weightKg ?? undefined}
                          placeholder={t.weightPlaceholderShort}
                          className="h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-center text-xs focus-visible:outline-none"
                        />
                      </td>
                      <td className="px-4 py-3.5">{r.cage ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="text"
                            name="tagId"
                            form={formId}
                            maxLength={10}
                            required
                            placeholder={t.tagPlaceholderShort}
                            className="h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-center text-xs focus-visible:outline-none"
                          />
                          <button
                            type="submit"
                            form={formId}
                            className="h-7 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                          >
                            {t.finalizeButton}
                          </button>
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

      {/* Bucks Roster Section */}
      <div className="space-y-3">
        {bucks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
            <RabbitIcon className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t.emptyTitle}</p>
            <p className="text-sm">{t.emptyDescription}</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right border-collapse">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-2 py-2 md:px-4 md:py-3 text-center">{t.colIndex}</th>
                  <SortableTh
                    className="px-2 py-2 md:px-4 md:py-3 text-center"
                    label={t.colTag}
                    sortKey="tag"
                    activeSortKey={bucksSort.sortKey}
                    direction={bucksSort.direction}
                    onSort={bucksSort.toggleSort}
                  />
                  <SortableTh
                    className="px-2 py-2 md:px-4 md:py-3 text-center"
                    label={t.colBreed}
                    sortKey="breed"
                    activeSortKey={bucksSort.sortKey}
                    direction={bucksSort.direction}
                    onSort={bucksSort.toggleSort}
                  />
                  <SortableTh
                    className="px-2 py-2 md:px-4 md:py-3 text-center"
                    label={t.colAddedDate}
                    sortKey="acquiredDate"
                    activeSortKey={bucksSort.sortKey}
                    direction={bucksSort.direction}
                    onSort={bucksSort.toggleSort}
                  />
                  <SortableTh
                    className="px-2 py-2 md:px-4 md:py-3 text-center"
                    label={t.colWeight}
                    sortKey="weight"
                    activeSortKey={bucksSort.sortKey}
                    direction={bucksSort.direction}
                    onSort={bucksSort.toggleSort}
                  />
                  <SortableTh
                    className="px-2 py-2 md:px-4 md:py-3 text-center"
                    label={t.colStatus}
                    sortKey="status"
                    activeSortKey={bucksSort.sortKey}
                    direction={bucksSort.direction}
                    onSort={bucksSort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {bucksSort.sorted.map((buck, i) => (
                  <tr key={buck.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 font-bold">
                      <RabbitTagBadge
                        tagId={buck.tagId}
                        sex="buck"
                        onClick={() => {
                          window.location.hash = `#/rabbits/${buck.id}`;
                        }}
                      />
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5">{buck.breed ?? "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5">
                      <LocalDate date={buck.acquiredDate} />
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5">
                      {buck.weightGrams
                        ? formatWeight(
                            buck.weightGrams,
                            settings.weightUnit as "kg" | "lb_oz",
                            locale
                          ).replace(/\s*(كجم|kg)$/, "")
                        : "—"}
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5">
                      <StatusBadge value={buck.status} locale={locale} />
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
