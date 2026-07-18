import { useEffect, useState, useCallback } from "react";
import { ShoppingCart, Skull, Layers, Rabbit, PawPrint, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchWeaningSalesPageData, type LocalKitLedgerEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { enqueue } from "../sync/outbox";
import { formatMoney, formatWeight } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toDateInputValue } from "@/lib/dates";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

export function WeaningSalesPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [data, setData] = useState<{
    ledger: LocalKitLedgerEntry[];
    totalWeaned: number;
    totalSold: number;
    totalDied: number;
    totalRetained: number;
    totalRevenueCents: number;
    availableStock: number;
    currency: string;
    weightUnit: string;
  } | null>(null);

  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [type, setType] = useState<"sale" | "death" | "adjustment">("sale");
  const [count, setCount] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchWeaningSalesPageData(db);
    setData({
      ledger: res.ledger,
      totalWeaned: res.totalWeaned,
      totalSold: res.totalSold,
      totalDied: res.totalDied,
      totalRetained: res.totalRetained,
      totalRevenueCents: res.totalRevenueCents,
      availableStock: res.availableStock,
      currency: res.settings.currency,
      weightUnit: res.settings.weightUnit,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(count.trim(), 10);
    const w = weightKg.trim() !== "" ? parseFloat(weightKg.trim()) : null;
    const p = pricePerKg.trim() !== "" ? parseFloat(pricePerKg.trim()) : null;

    // An adjustment is signed (positive raises the balance, negative lowers
    // it); every other movement is a positive quantity.
    const invalidQty = type === "adjustment" ? isNaN(qty) || qty === 0 : isNaN(qty) || qty <= 0;
    if (invalidQty) {
      toast.error(locale === "ar" ? "يرجى إدخال عدد صحيح" : "Please enter a valid count");
      return;
    }

    if (type === "death" && data && qty > data.availableStock) {
      toast.error(
        locale === "ar"
          ? `العدد المدخل يتجاوز الكمية المتاحة (${data.availableStock})`
          : `Count exceeds available stock (${data.availableStock})`
      );
      return;
    }

    setSubmitting(true);
    try {
      if (type === "sale") {
        await enqueue("recordKitSale", {
          date,
          count: qty,
          weightKg: w,
          pricePerKg: p,
          notes: notes.trim() || null,
        });
      } else if (type === "death") {
        await enqueue("recordWeanedKitDeath", {
          count: qty,
          date,
          notes: notes.trim() || null,
        });
      } else {
        await enqueue("recordKitStockAdjustment", {
          count: qty,
          date,
          notes: notes.trim() || null,
        });
      }

      toast.success(locale === "ar" ? "تم التسجيل بنجاح" : "Logged successfully");
      setCount("");
      setWeightKg("");
      setPricePerKg("");
      setNotes("");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(locale === "ar" ? "هل أنت متأكد من الحذف؟" : "Are you sure you want to delete this?")) {
      return;
    }
    try {
      await enqueue("deleteKitStockMovement", { id });
      toast.success(locale === "ar" ? "تم الحذف بنجاح" : "Deleted successfully");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  const ledgerSort = useSortableRows(data?.ledger ?? [], {
    date: { type: "date", value: (r) => r.date },
    kind: { type: "string", value: (r) => r.kind },
    count: { type: "number", value: (r) => r.count },
    weight: { type: "number", value: (r) => r.weightGrams },
    pricePerKg: { type: "number", value: (r) => r.pricePerKgCents },
    amount: { type: "number", value: (r) => r.amountCents },
    notes: { type: "string", value: (r) => r.notes },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  const {
    ledger,
    totalWeaned,
    totalSold,
    totalDied,
    totalRetained,
    totalRevenueCents,
    availableStock,
    currency,
    weightUnit,
  } = data;

  const toneCls = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50",
    income: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-50",
    expense: "border-red-200 bg-red-50 text-red-950 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-50",
  };

  const kindLabels = {
    wean: locale === "ar" ? "فطام" : "Wean",
    sale: locale === "ar" ? "بيع" : "Sale",
    death: locale === "ar" ? "نافق" : "Death",
    retained: locale === "ar" ? "سلالة" : "Retained",
    adjustment: locale === "ar" ? "تسوية" : "Adjustment",
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.weaningSales.title}</h1>
        <p className="text-sm text-muted-foreground">{t.weaningSales.description}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className={toneCls.neutral}>
          <CardContent className="p-4 flex items-center gap-3">
            <Rabbit className="h-5 w-5 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{t.weaningSales.totalWeanedLabel}</p>
              <p className="text-lg font-bold">{totalWeaned}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={availableStock >= 0 ? toneCls.income : toneCls.expense}>
          <CardContent className="p-4 flex items-center gap-3">
            <Layers className="h-5 w-5" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{t.weaningSales.availableStockLabel}</p>
              <p className="text-lg font-bold">{availableStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={toneCls.income}>
          <CardContent className="p-4 flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{t.weaningSales.totalSoldLabel}</p>
              <p className="text-lg font-bold leading-tight">
                {totalSold} <span className="text-xs font-normal text-muted-foreground">({formatMoney(totalRevenueCents, currency)})</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className={toneCls.expense}>
          <CardContent className="p-4 flex items-center gap-3">
            <Skull className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{t.weaningSales.totalDiedLabel}</p>
              <p className="text-lg font-bold">{totalDied}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={toneCls.expense}>
          <CardContent className="p-4 flex items-center gap-3">
            <PawPrint className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{t.weaningSales.totalRetainedLabel}</p>
              <p className="text-lg font-bold">{totalRetained}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === "ar" ? "تسجيل حركة" : "Record Movement"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">{locale === "ar" ? "التاريخ" : "Date"}</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">{locale === "ar" ? "نوع الحركة" : "Movement Type"}</Label>
                <Select
                  items={[
                    { value: "sale", label: locale === "ar" ? "بيع خلفات" : "Kit Sale" },
                    { value: "death", label: locale === "ar" ? "نافق فطام" : "Weaned Death" },
                    { value: "adjustment", label: locale === "ar" ? "تسوية المخزون" : "Stock Adjustment" },
                  ]}
                  value={type}
                  onValueChange={(v: any) => setType(v)}
                  disabled={submitting}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">{locale === "ar" ? "بيع خلفات" : "Kit Sale"}</SelectItem>
                    <SelectItem value="death">{locale === "ar" ? "نافق فطام" : "Weaned Death"}</SelectItem>
                    <SelectItem value="adjustment">{locale === "ar" ? "تسوية المخزون" : "Stock Adjustment"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="count">{locale === "ar" ? "العدد" : "Count"}</Label>
                <Input
                  id="count"
                  type="number"
                  min={type === "adjustment" ? undefined : 1}
                  placeholder={type === "adjustment" ? "+267" : "5"}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={submitting}
                />
                {type === "adjustment" && (
                  <p className="text-xs text-muted-foreground">
                    {locale === "ar"
                      ? "رقم يُضاف للرصيد: موجب يزيد المخزون المتاح، وسالب ينقصه."
                      : "A signed number added to the balance: positive raises available stock, negative lowers it."}
                  </p>
                )}
              </div>
            </div>

            {type === "sale" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weightKg">{locale === "ar" ? `الوزن الإجمالي (كجم)` : "Total Weight (kg)"}</Label>
                  <Input
                    id="weightKg"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="4.5"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pricePerKg">{locale === "ar" ? `سعر الكيلو (${currency})` : "Price per Kg"}</Label>
                  <Input
                    id="pricePerKg"
                    type="number"
                    step="0.1"
                    min={0}
                    placeholder="250"
                    value={pricePerKg}
                    onChange={(e) => setPricePerKg(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">{locale === "ar" ? "ملاحظات" : "Notes"}</Label>
              <Input id="notes" placeholder="..." value={notes} onChange={(e) => setNotes(e.target.value)} disabled={submitting} />
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {locale === "ar" ? "حفظ الحركة" : "Save Movement"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === "ar" ? "سجل الحركات" : "Ledger Log"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <div className="p-6">
              <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
                <Layers className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">{t.weaningSales.emptyTitle}</p>
                <p className="text-sm">{t.weaningSales.emptyDescription}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right border-collapse">
                <thead className="bg-muted text-muted-foreground text-xs uppercase">
                  <tr className="border-b">
                    <SortableTh
                      className="px-4 py-3"
                      label={t.weaningSales.colDate}
                      sortKey="date"
                      activeSortKey={ledgerSort.sortKey}
                      direction={ledgerSort.direction}
                      onSort={ledgerSort.toggleSort}
                    />
                    <SortableTh
                      className="px-4 py-3"
                      label={t.weaningSales.colType}
                      sortKey="kind"
                      activeSortKey={ledgerSort.sortKey}
                      direction={ledgerSort.direction}
                      onSort={ledgerSort.toggleSort}
                    />
                    <SortableTh
                      className="px-4 py-3 text-center"
                      label={t.weaningSales.colCount}
                      sortKey="count"
                      activeSortKey={ledgerSort.sortKey}
                      direction={ledgerSort.direction}
                      onSort={ledgerSort.toggleSort}
                    />
                    <SortableTh
                      className="px-4 py-3 text-center"
                      label={t.weaningSales.colWeight}
                      sortKey="weight"
                      activeSortKey={ledgerSort.sortKey}
                      direction={ledgerSort.direction}
                      onSort={ledgerSort.toggleSort}
                    />
                    <SortableTh
                      className="px-4 py-3 text-center"
                      label={t.weaningSales.colPricePerKg}
                      sortKey="pricePerKg"
                      activeSortKey={ledgerSort.sortKey}
                      direction={ledgerSort.direction}
                      onSort={ledgerSort.toggleSort}
                    />
                    <SortableTh
                      className="px-4 py-3 text-center"
                      label={t.weaningSales.colAmount}
                      sortKey="amount"
                      activeSortKey={ledgerSort.sortKey}
                      direction={ledgerSort.direction}
                      onSort={ledgerSort.toggleSort}
                    />
                    <SortableTh
                      className="px-4 py-3"
                      label={t.weaningSales.colNotes}
                      sortKey="notes"
                      activeSortKey={ledgerSort.sortKey}
                      direction={ledgerSort.direction}
                      onSort={ledgerSort.toggleSort}
                    />
                    <th className="px-4 py-3 w-12 text-center" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ledgerSort.sorted.map((entry) => (
                    <tr key={entry.key} className="hover:bg-muted/40">
                      <td className="px-4 py-3.5">
                        <LocalDate date={new Date(entry.date)} />
                      </td>
                      <td className="px-4 py-3.5 font-medium">{kindLabels[entry.kind]}</td>
                      <td className="px-4 py-3.5 text-center font-semibold tabular-nums">
                        {entry.count > 0 ? `+${entry.count}` : entry.count}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {entry.weightGrams ? formatWeight(entry.weightGrams, weightUnit as any) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {entry.pricePerKgCents ? formatMoney(entry.pricePerKgCents, currency) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {entry.amountCents ? formatMoney(entry.amountCents, currency) : "—"}
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px] truncate">{entry.notes ?? "—"}</td>
                      <td className="px-4 py-3.5 text-center">
                        {entry.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(entry.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
