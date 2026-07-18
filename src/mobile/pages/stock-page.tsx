import { useEffect, useState, useCallback, useRef } from "react";
import { Trash2 } from "lucide-react";
import { createId } from "@paralleldrive/cuid2";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchStockPageData } from "../db/queries";
import { enqueue } from "../sync/outbox";
import { LocalDate } from "@/components/local-date";
import { label } from "@/lib/enums";
import { toast } from "sonner";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

export function StockPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale).stock;
  const tCommon = getClientDictionary(locale).common;

  const [data, setData] = useState<{
    rabbits: { id: string; sex: string; breed: string | null; cage: string | null; date: string; weightKg: number | null }[];
    breedOptions: string[];
    settings: any;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [today] = useState(() => new Date().toISOString().split("T")[0]);
  const addFormRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchStockPageData(db);
    setData(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddRabbit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const sex = formData.get("sex") as "doe" | "buck";
    const date = formData.get("date") as string;
    const breed = formData.get("breed") as string;
    const weightRaw = (formData.get("weightKg") as string) || "";
    const cageRaw = ((formData.get("cage") as string) || "").trim();

    try {
      const id = createId();
      const res = await enqueue("createQuickRabbit", {
        id,
        tagId: null,
        breed: breed === "none" ? null : breed,
        sex,
        date: new Date(date).toISOString(),
        weightKg: weightRaw ? parseFloat(weightRaw) : null,
      });

      if (res.outcome.status === "rejected") {
        toast.error(res.outcome.resultMessage);
      } else {
        if (cageRaw) {
          const cageRes = await enqueue("saveQuickRabbitCage", { id, cage: cageRaw });
          if (cageRes.outcome.status === "rejected") {
            toast.error(cageRes.outcome.resultMessage);
          }
        }
        toast.success(t.registeredToast);
        addFormRef.current?.reset();
        await load();
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePromote = async (id: string, sex: string) => {
    try {
      const res = await enqueue("promoteToHerdPen", { id });
      if (res.outcome.status === "rejected") {
        const msg = res.outcome.resultMessage;
        if (msg === "CAGE_REQUIRED") {
          toast.error(locale === "ar" ? "رقم العين/القفص مطلوب قبل النقل" : "Cage number is required before promoting");
        } else if (msg === "WEIGHT_REQUIRED") {
          toast.error(locale === "ar" ? "الوزن مطلوب قبل النقل" : "Weight is required before promoting");
        } else {
          toast.error(msg);
        }
      } else {
        toast.success(t.movedToast);
        await load();
      }
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(locale === "ar" ? "هل أنت متأكد من الحذف؟" : "Are you sure you want to delete?")) return;
    try {
      const res = await enqueue("deleteRabbit", { id });
      if (res.outcome.status === "rejected") {
        toast.error(res.outcome.resultMessage === "DELETE_BLOCKED_BY_BREEDING" ? (locale === "ar" ? "لا يمكن حذف هذا الأرنب لارتباطه بعمليات تلقيح" : "Cannot delete: rabbit has mating records") : res.outcome.resultMessage);
      } else {
        toast.success(locale === "ar" ? "تم حذف الأرنب بنجاح" : "Rabbit deleted successfully");
        await load();
      }
    } catch (err) {
      toast.error(String(err));
    }
  };

  const rabbits = data?.rabbits ?? [];
  const breedOptions = data?.breedOptions ?? [];

  const sexOptions = [
    { value: "doe", label: t.sexDoe },
    { value: "buck", label: t.sexBuck },
  ];

  const rabbitsSort = useSortableRows(rabbits, {
    date: { type: "date", value: (r) => r.date },
    sex: { type: "string", value: (r) => r.sex },
    breed: { type: "string", value: (r) => r.breed },
    cage: { type: "tag", value: (r) => r.cage },
    weight: { type: "number", value: (r) => r.weightKg },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </div>

      {/* Register Stock Form Card */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="p-6">
          <form ref={addFormRef} onSubmit={handleAddRabbit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">{t.sexLabel}</label>
                <select
                  name="sex"
                  defaultValue="doe"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {sexOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">{t.dateLabel}</label>
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={today}
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
                  step="0.001"
                  min={0}
                  placeholder={t.weightPlaceholder}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">{t.cageLabel}</label>
                <input
                  name="cage"
                  type="text"
                  maxLength={10}
                  placeholder={t.cagePlaceholder}
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

      {/* Stock Table Section */}
      {rabbits.length > 0 && (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={t.colDate}
                  sortKey="date"
                  activeSortKey={rabbitsSort.sortKey}
                  direction={rabbitsSort.direction}
                  onSort={rabbitsSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={t.colSex}
                  sortKey="sex"
                  activeSortKey={rabbitsSort.sortKey}
                  direction={rabbitsSort.direction}
                  onSort={rabbitsSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={t.colBreed}
                  sortKey="breed"
                  activeSortKey={rabbitsSort.sortKey}
                  direction={rabbitsSort.direction}
                  onSort={rabbitsSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={t.colCage}
                  sortKey="cage"
                  activeSortKey={rabbitsSort.sortKey}
                  direction={rabbitsSort.direction}
                  onSort={rabbitsSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={t.colWeight}
                  sortKey="weight"
                  activeSortKey={rabbitsSort.sortKey}
                  direction={rabbitsSort.direction}
                  onSort={rabbitsSort.toggleSort}
                />
                <th className="px-4 py-3 text-center"></th>
                <th className="px-4 py-3 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rabbitsSort.sorted.map((r) => {
                const promoteLabel = r.sex === "buck" ? t.promoteToBuckLine : t.promoteToDoeLine;
                return (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => {
                          window.location.hash = `#/rabbits/${r.id}`;
                        }}
                        className="hover:underline"
                      >
                        <LocalDate date={r.date} locale={locale} />
                      </button>
                    </td>
                    <td className="px-4 py-3.5">{label(r.sex, locale)}</td>
                    <td className="px-4 py-3.5">{r.breed ?? "—"}</td>
                    <td className="px-4 py-3.5">{r.cage ?? "—"}</td>
                    <td className="px-4 py-3.5">{r.weightKg ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => void handlePromote(r.id, r.sex)}
                        className="h-7 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                      >
                        {promoteLabel}
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => void handleDelete(r.id)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-destructive/20 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
