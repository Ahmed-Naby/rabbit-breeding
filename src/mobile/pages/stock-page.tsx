import { useEffect, useState, useCallback, useRef } from "react";
import { Trash2, Shuffle } from "lucide-react";
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

export function StockPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
  const t = getClientDictionary(locale).stock;
  const tCommon = getClientDictionary(locale).common;

  const [data, setData] = useState<{
    rabbits: { id: string; sex: string; breed: string | null; cage: string | null; date: string; weightKg: number | null }[];
    breedOptions: string[];
    availableStock: number;
    settings: any;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [assigningCages, setAssigningCages] = useState(false);
  const [farmBreed, setFarmBreed] = useState<string>("none");
  const [externalBreed, setExternalBreed] = useState<string>("none");
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

  const handleAddRabbit = async (e: React.FormEvent<HTMLFormElement>, origin: "farm" | "external") => {
    e.preventDefault();
    if (saving) return;

    // Registering farm-born breeding stock withdraws one kit from available-weaning
    if (origin === "farm" && data && data.availableStock < 1) {
      toast.error(
        locale === "ar"
          ? "المخزون المتاح صفر — سجّل فطامًا أو اعمل تسوية في صفحة الفطام والبيع قبل تسجيل سلالة جديدة"
          : "No available stock — record a weaning or an adjustment in Weaning & Sales before registering new breeding stock"
      );
      return;
    }

    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    const sex = formData.get("sex") as "doe" | "buck";
    const date = (formData.get("date") as string || "").trim();
    const breed = (formData.get("breed") as string || "").trim();
    const weightRaw = (formData.get("weightKg") as string || "").trim();
    const cageRaw = (formData.get("cage") as string || "").trim();

    // التحقق من اكتمال جميع البيانات المطلوبة
    const missing: string[] = [];
    if (!sex) missing.push(locale === "ar" ? "الجنس" : "sex");
    if (!date) missing.push(locale === "ar" ? "التاريخ" : "date");
    if (!breed || breed === "none") missing.push(locale === "ar" ? "النوع" : "breed");
    if (!weightRaw) missing.push(locale === "ar" ? "الوزن" : "weight");
    if (!cageRaw) missing.push(locale === "ar" ? "رقم القفص" : "cage");

    if (missing.length > 0) {
      toast.error(
        locale === "ar"
          ? `يجب إدخال جميع البيانات قبل الإضافة: ${missing.join(", ")}`
          : `All fields are required before adding: ${missing.join(", ")}`
      );
      return;
    }

    setSaving(true);
    try {
      const id = createId();
      const res = await enqueue("createQuickRabbit", {
        id,
        tagId: null,
        breed,
        sex,
        date: new Date(date).toISOString(),
        weightKg: parseFloat(weightRaw),
        origin,
      });

      if (res.outcome.status === "rejected") {
        toast.error(res.outcome.resultMessage);
      } else {
        const cageRes = await enqueue("saveQuickRabbitCage", { id, cage: cageRaw });
        if (cageRes.outcome.status === "rejected") {
          toast.error(cageRes.outcome.resultMessage);
        }
        toast.success(t.registeredToast);
        formEl.reset();
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

  const handleAssignRandomCages = async () => {
    const targets = (data?.rabbits ?? []).filter((r) => !r.cage);
    if (targets.length === 0) return;
    setAssigningCages(true);
    try {
      const used = new Set<string>();
      for (const r of targets) {
        let cage: string;
        do {
          cage = String(Math.floor(1000 + Math.random() * 9000));
        } while (used.has(cage));
        used.add(cage);
        const res = await enqueue("saveQuickRabbitCage", { id: r.id, cage });
        if (res.outcome.status === "rejected") {
          toast.error(res.outcome.resultMessage);
        }
      }
      toast.success(
        locale === "ar" ? "تم توليد أرقام قفص عشوائية لجميع السلالات" : "Random cage numbers assigned to all stock"
      );
      await load();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAssigningCages(false);
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
      {!hideHeader && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
            <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">
              {rabbits.length}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>
      )}

      {/* Forms grid: Card 1 (Farm Offspring) & Card 2 (External Purchased Stock) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Card 1: Farm Offspring (Deducts from weaning) */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-semibold text-base">
                  {locale === "ar" ? "تسجيل سلالة (من أبناء المزرعة)" : "Register Farm Stock (Offspring)"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {locale === "ar"
                    ? `تُخصم من رصيد الفطام المتاح (المتبقي: ${data.availableStock})`
                    : `Deducts from available weaning stock (Available: ${data.availableStock})`}
                </p>
              </div>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {locale === "ar" ? "من إنتاج المزرعة" : "Farm Offspring"}
              </span>
            </div>

            <form onSubmit={(e) => void handleAddRabbit(e, "farm")} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold">{t.breedLabel}</label>
                  <select
                    name="breed"
                    value={farmBreed}
                    onChange={(e) => setFarmBreed(e.target.value)}
                    className={`flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent ${farmBreed === "none" ? "border-destructive/50" : "border-input"}`}
                  >
                    <option value="none">{locale === "ar" ? "— اختر النوع —" : "— Select breed —"}</option>
                    {breedOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  {farmBreed === "none" && (
                    <p className="text-xs text-destructive">{locale === "ar" ? "اختيار النوع إلزامي" : "Breed is required"}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">{t.weightLabel}</label>
                  <input
                    name="weightKg"
                    type="number"
                    step="0.25"
                    min={0}
                    required
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
                    required
                    placeholder={t.cagePlaceholder}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || farmBreed === "none"}
                className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
              >
                {saving ? tCommon.saving : (locale === "ar" ? "تسجيل سلالة المزرعة" : "Register Farm Stock")}
              </button>
            </form>
          </div>
        </div>

        {/* Card 2: External Purchased Stock */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-semibold text-base">
                  {locale === "ar" ? "إضافة سلالة مشتراة (من خارج المزرعة)" : "Add Purchased Stock (External)"}
                </h3>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {locale === "ar" ? "مشتراة من الخارج" : "Purchased External"}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {locale === "ar" ? "لا تخصم من رصيد الفطام" : "Not deducted from the weaning balance"}
            </p>

            <form onSubmit={(e) => void handleAddRabbit(e, "external")} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold">{t.breedLabel}</label>
                  <select
                    name="breed"
                    value={externalBreed}
                    onChange={(e) => setExternalBreed(e.target.value)}
                    className={`flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent ${externalBreed === "none" ? "border-destructive/50" : "border-input"}`}
                  >
                    <option value="none">{locale === "ar" ? "— اختر النوع —" : "— Select breed —"}</option>
                    {breedOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  {externalBreed === "none" && (
                    <p className="text-xs text-destructive">{locale === "ar" ? "اختيار النوع إلزامي" : "Breed is required"}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">{t.weightLabel}</label>
                  <input
                    name="weightKg"
                    type="number"
                    step="0.25"
                    min={0}
                    required
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
                    required
                    placeholder={t.cagePlaceholder}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || externalBreed === "none"}
                className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-emerald-600 text-white shadow hover:bg-emerald-700 h-9 px-4 py-2"
              >
                {saving ? tCommon.saving : (locale === "ar" ? "إضافة سلالة مشتراة" : "Add Purchased Stock")}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Stock Table Section */}
      {rabbits.length > 0 && (
        <div className="space-y-3">
          {rabbits.some((r) => !r.cage) && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleAssignRandomCages()}
                disabled={assigningCages}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              >
                <Shuffle className="h-3.5 w-3.5" />
                {assigningCages
                  ? tCommon.saving
                  : locale === "ar"
                    ? "توليد أرقام قفص عشوائية"
                    : "Generate random cage numbers"}
              </button>
            </div>
          )}
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
                <th className="px-4 py-3 text-center">{locale === "ar" ? "تعديل" : "Edit"}</th>
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
                        onClick={() => { window.location.hash = `#/rabbits/${r.id}`; }}
                        className="h-7 whitespace-nowrap rounded-md border border-sky-400 bg-sky-500 px-3 text-xs font-semibold text-white hover:bg-sky-600 dark:border-sky-600 dark:bg-sky-700 dark:hover:bg-sky-600 transition-colors"
                      >
                        {locale === "ar" ? "تعديل" : "Edit"}
                      </button>
                    </td>
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
        </div>
      )}
    </div>
  );
}
