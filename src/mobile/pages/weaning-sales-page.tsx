import { useEffect, useRef, useState, useCallback } from "react";
import { ShoppingCart, Skull, Layers, Rabbit, PawPrint } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchWeaningSalesPageData, type LocalKitLedgerEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { enqueue } from "../sync/outbox";
import { formatMoney, formatWeight, formatWeightTotal, fromCents, toCents, toGrams } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KitMovementTypeChoice, type KitMovementChoice } from "@/components/kit-movement-type-choice";
import { isWithinDateRange, presetRange, toDateInputValue } from "@/lib/dates";
import { ledgerTotals } from "@/lib/kit-ledger";
import { ExportXlsxButton } from "@/components/export-xlsx-button";
import { saveBinaryFile } from "../lib/save-file";
import type { WeightUnit } from "@/lib/enums";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { PageSkeleton } from "@/components/skeleton";
import { EmptyState, PageHeader } from "@/components/page-header";
import { LogStatBadge } from "@/components/log-count-badge";
import { cn } from "@/lib/utils";

/**
 * One tone per movement kind, copied from the web ledger
 * (src/app/weaning-sales/page.tsx) so the same row reads the same on both —
 * a plain label made فطام and نافق indistinguishable until you read them.
 */
const KIND_TONES: Record<LocalKitLedgerEntry["kind"], string> = {
  wean: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  sale: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  death: "bg-red-500/10 text-red-600 dark:text-red-400",
  retained: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  adjustment: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  // The mirror image of "retained", so the same violet family — teal keeps the
  // two apart at a glance.
  returned: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
};

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
  const [type, setType] = useState<KitMovementChoice>("sale");
  const [count, setCount] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  // Which field the last rejected save blamed. A toast alone leaves the farmer
  // hunting for the empty box, so the field itself is outlined and focused.
  type SaleField = "count" | "weightKg" | "pricePerKg";
  const [invalidField, setInvalidField] = useState<SaleField | null>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const rejectField = (field: SaleField, message: string) => {
    setInvalidField(field);
    const el =
      field === "count"
        ? countRef.current
        : field === "weightKg"
          ? weightRef.current
          : priceRef.current;
    el?.focus();
    // The form sits at the top of the page, but the keyboard may already be up
    // and covering it.
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    toast.error(message);
  };

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
    // Pre-fill from the farm's default price, but never overwrite a price the
    // user is in the middle of typing — load() also runs right after a save.
    const fallback = fromCents(res.settings.defaultPricePerKgCents);
    if (fallback) setPricePerKg((current) => current || fallback);
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
      rejectField("count", locale === "ar" ? "يرجى إدخال عدد صحيح" : "Please enter a valid count");
      return;
    }

    // A بيع is only a sale once it carries a weight and a price: the amount is
    // derived from the two, and a movement missing either lands in the ledger
    // with no revenue and drags متوسط الوزن down with it. The `required`
    // attributes stop an empty field; this stops a zero or a stray "-". Each
    // field is reported on its own, so the outline lands on the one at fault.
    if (type === "sale") {
      if (w == null || w <= 0) {
        rejectField(
          "weightKg",
          locale === "ar" ? "أدخل الوزن الإجمالي لتسجيل البيع" : "Enter the total weight"
        );
        return;
      }
      if (p == null || p <= 0) {
        rejectField(
          "pricePerKg",
          locale === "ar" ? "أدخل سعر الكيلو لتسجيل البيع" : "Enter the price per kg"
        );
        return;
      }
    }

    setInvalidField(null);

    // The available-stock balance may never go negative. A sale or death
    // withdraws `qty`; a signed adjustment shifts by `qty`. Block anything
    // that would push the balance below zero (a positive adjustment always
    // raises it, so it's never blocked).
    const balanceChange = type === "adjustment" ? qty : -qty;
    if (data && data.availableStock + balanceChange < 0) {
      rejectField(
        "count",
        locale === "ar"
          ? `العدد يتجاوز المخزون المتاح (${data.availableStock})`
          : `Count exceeds available stock (${data.availableStock})`
      );
      return;
    }

    setSubmitting(true);
    try {
      if (type === "sale") {
        // Grams and cents, not kg and pounds: the server op (operation-registry's
        // recordKitSale) reads weightGrams/pricePerKgCents, so sending the raw kg
        // figures meant every synced بيع was stored with no weight and no price.
        const weightGrams = w != null ? toGrams({ kg: w }, "kg") : null;
        const pricePerKgCents = p != null ? toCents(p) : null;
        await enqueue("recordKitSale", {
          date,
          count: qty,
          weightGrams,
          pricePerKgCents,
          amountCents:
            weightGrams != null && pricePerKgCents != null
              ? Math.round((weightGrams * pricePerKgCents) / 1000)
              : null,
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
      setPricePerKg(""); // load() below puts the farm default back
      setNotes("");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  // No delete button on this ledger: the rows mirror events recorded
  // elsewhere (فطام, بيع, نافق, احتفاظ للتربية, مرتجع من السلالات), so removing
  // one here would silently desync the balance from those pages. The
  // deleteKitStockMovement op itself stays registered for ops already queued
  // by older builds. Use a تسوية to correct the balance instead.

  // Filtered before sorting, so the pager and the cards below both see the
  // same slice. Held in state rather than the URL: this page is a single view,
  // and the mobile shell has no query string to share anyway.
  const fullLedger = data?.ledger ?? [];
  const ledgerRows =
    rangeFrom || rangeTo
      ? fullLedger.filter((e) => isWithinDateRange(e.date, rangeFrom, rangeTo))
      : fullLedger;

  const ledgerSort = useSortableRows(ledgerRows, {
    date: { type: "date", value: (r) => r.date },
    kind: { type: "string", value: (r) => r.kind },
    count: { type: "number", value: (r) => r.count },
    weight: { type: "number", value: (r) => r.weightGrams },
    pricePerKg: { type: "number", value: (r) => r.pricePerKgCents },
    amount: { type: "number", value: (r) => r.amountCents },
    notes: { type: "string", value: (r) => r.notes },
  });

  if (!data) {
    return <PageSkeleton label={locale === "ar" ? "جارِ التحميل…" : "Loading…"} />;
  }

  const { availableStock, currency, weightUnit } = data;

  // The four period cards follow the filter; المخزون المتاح does not — it is a
  // running balance, and every entry on this page is gated on it.
  const {
    totalWeaned,
    totalSold,
    totalDied,
    totalRetained,
    totalRevenueCents,
    totalSoldWeightGrams,
    avgSoldWeightGrams,
  } = ledgerTotals(ledgerRows);

  const toneCls = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-50",
    income: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-50",
    expense: "border-red-200 bg-red-50 text-red-950 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-50",
  };

  const kindLabels = {
    wean: locale === "ar" ? "فطام" : "Wean",
    sale: locale === "ar" ? "بيع" : "Sale",
    death: locale === "ar" ? "نافق" : "Death",
    retained: locale === "ar" ? "احتفاظ للتربية" : "Kept for breeding",
    adjustment: locale === "ar" ? "تسوية" : "Adjustment",
    // A سلالة that was deleted and sent back to the weaning cages.
    returned: locale === "ar" ? "مرتجع من السلالات" : "Returned from juveniles",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            {t.weaningSales.title}
            {/* The one figure every entry on this page is gated on — a sale or
                نافق is refused when it would push it below zero — so it stays
                in view instead of only in the card row below. */}
            <LogStatBadge
              label={t.weaningSales.availableStockLabel}
              value={availableStock.toLocaleString()}
              tone="primary"
            />
          </>
        }
        description={t.weaningSales.description}
      />

      {/* The form comes first: this page is opened to record a sale or a نافق,
          and the totals are what you check afterwards. المخزون المتاح — the one
          figure needed *before* typing — rides on the header badge above. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === "ar" ? "تسجيل حركة" : "Record Movement"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">{locale === "ar" ? "التاريخ" : "Date"}</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />
              </div>
              <div className="space-y-2">
                <Label>{locale === "ar" ? "نوع الحركة" : "Movement Type"}</Label>
                <KitMovementTypeChoice value={type} onChange={setType} disabled={submitting} locale={locale} />
              </div>
            </div>

            {/* العدد والوزن وسعر الكيلو on one line: they're the three numbers a
                بيع is made of, and the farmer types them in that order without
                the eye jumping to another row. Non-sale movements need only the
                count, so the row collapses to a single column. */}
            <div className={cn("grid grid-cols-1 gap-4", type === "sale" && "sm:grid-cols-3")}>
              <div className="space-y-2">
                <Label htmlFor="count">{locale === "ar" ? "العدد" : "Count"}</Label>
                <Input
                  id="count"
                  ref={countRef}
                  type="number"
                  required
                  min={type === "adjustment" ? undefined : 1}
                  placeholder={type === "adjustment" ? "+267" : "5"}
                  aria-invalid={invalidField === "count"}
                  value={count}
                  onChange={(e) => {
                    setCount(e.target.value);
                    // The outline goes the moment the field is touched — it
                    // marks what to fix, not what was once wrong.
                    if (invalidField === "count") setInvalidField(null);
                  }}
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

              {type === "sale" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="weightKg">{locale === "ar" ? `الوزن الإجمالي (كجم)` : "Total Weight (kg)"}</Label>
                    <Input
                      id="weightKg"
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="4.5"
                      required
                      ref={weightRef}
                      aria-invalid={invalidField === "weightKg"}
                      value={weightKg}
                      onChange={(e) => {
                        setWeightKg(e.target.value);
                        if (invalidField === "weightKg") setInvalidField(null);
                      }}
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
                      required
                      ref={priceRef}
                      aria-invalid={invalidField === "pricePerKg"}
                      value={pricePerKg}
                      onChange={(e) => {
                        setPricePerKg(e.target.value);
                        if (invalidField === "pricePerKg") setInvalidField(null);
                      }}
                      disabled={submitting}
                    />
                  </div>
                </>
              )}
            </div>

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <CardContent className="p-4 flex items-start gap-3">
            <ShoppingCart className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{t.weaningSales.totalSoldLabel}</p>
              <p className="text-lg font-bold leading-tight">{totalSold}</p>
              {/* A بيع carries a weight and a price as well as a head count,
                  and the three together are what a sale is judged on. All of
                  them follow the date filter. Label at one edge and figure at
                  the other, so the three read as a column of values. */}
              <div className="space-y-1 border-t border-border/60 pt-2 mt-3!">
                <CardDetail
                  label={t.weaningSales.soldWeightLabel}
                  value={formatWeightTotal(totalSoldWeightGrams, "kg", locale)}
                />
                <CardDetail
                  label={t.weaningSales.avgSoldWeightLabel}
                  value={
                    avgSoldWeightGrams != null
                      ? formatWeightTotal(avgSoldWeightGrams, "kg", locale)
                      : "—"
                  }
                />
                <CardDetail
                  label={t.weaningSales.soldRevenueLabel}
                  value={formatMoney(totalRevenueCents, currency)}
                  emphasis
                />
              </div>
            </div>
          </CardContent>
        </Card>
        {/* النافق و احتفاظ للتربية share a card: both are heads that left the
            weaning pen without being sold. Two lines, no combined total — the
            sum of a death and a سلالة means nothing. */}
        <Card className={toneCls.expense}>
          <CardContent className="p-4 py-2 divide-y divide-border/60">
            {[
              { label: t.weaningSales.totalRetainedLabel, value: totalRetained, icon: PawPrint },
              { label: t.weaningSales.totalDiedLabel, value: totalDied, icon: Skull },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 py-2.5">
                <row.icon className="h-5 w-5 shrink-0 text-red-600/70 dark:text-red-400/70" />
                <span className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
                  {row.label}
                </span>
                <span className="text-lg font-bold tabular-nums">{row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Sits between the cards and the table because it governs both. */}
      <Card>
        <CardContent className="space-y-3 py-4">
          {/* One press fills both boxes; the table filters off state, so there
              is nothing to apply afterwards. «من بداية التشغيل» is the empty
              pair «إلغاء التصفية» produced, named for what it shows. */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["month", t.records.rangeMonthButton],
                ["quarter", t.records.rangeQuarterButton],
                ["year", t.records.rangeYearButton],
                ["all", t.records.rangeAllButton],
              ] as const
            ).map(([preset, label]) => {
              const range = presetRange(preset);
              const active = rangeFrom === range.from && rangeTo === range.to;
              return (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  disabled={active}
                  onClick={() => {
                    setRangeFrom(range.from);
                    setRangeTo(range.to);
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="ledger-from">{t.records.fromLabel}</Label>
              <Input
                id="ledger-from"
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ledger-to">{t.records.toLabel}</Label>
              <Input
                id="ledger-to"
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="w-40"
              />
            </div>
            {/* Beside the filter, and deliberately so: it exports the rows the
                filter left on screen, not the whole ledger. saveBinaryFile
                because on Android a Blob download silently does nothing. */}
            <ExportXlsxButton
              className="ms-auto"
              locale={locale}
              spec={{
                kind: "kitLedger",
                rows: ledgerRows,
                currency: data?.currency ?? "EGP",
                weightUnit: (data?.weightUnit ?? "kg") as WeightUnit,
              }}
              save={saveBinaryFile}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{locale === "ar" ? "سجل الحركات" : "Ledger Log"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ledgerRows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Layers}
                title={t.weaningSales.emptyTitle}
                description={t.weaningSales.emptyDescription}
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right border-collapse">
                <thead className="bg-muted text-muted-foreground text-xs uppercase">
                  <tr className="border-b [&>th]:border-x">
                    <SortableTh
                      className="px-4 py-3 text-center"
                      label={t.weaningSales.colDate}
                      sortKey="date"
                      activeSortKey={ledgerSort.sortKey}
                      direction={ledgerSort.direction}
                      onSort={ledgerSort.toggleSort}
                    />
                    <SortableTh
                      className="px-4 py-3 text-center"
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
                      className="px-4 py-3 text-center"
                      label={t.weaningSales.colNotes}
                      sortKey="notes"
                      activeSortKey={ledgerSort.sortKey}
                      direction={ledgerSort.direction}
                      onSort={ledgerSort.toggleSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ledgerSort.sorted.map((entry) => (
                    <tr key={entry.key} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                      <td className="px-4 py-3.5">
                        <LocalDate date={new Date(entry.date)} locale={locale} />
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            KIND_TONES[entry.kind]
                          )}
                        >
                          {kindLabels[entry.kind]}
                        </span>
                      </td>
                      {/* Signed and coloured like the web's: a ledger where every
                          number is the same weight hides which way it moved. */}
                      <td
                        className={cn(
                          "px-4 py-3.5 font-medium tabular-nums",
                          entry.count >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        )}
                      >
                        {entry.count >= 0 ? `+${entry.count}` : entry.count}
                      </td>
                      <td className="px-4 py-3.5">
                        {entry.weightGrams ? formatWeight(entry.weightGrams, weightUnit as any) : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        {entry.pricePerKgCents ? formatMoney(entry.pricePerKgCents, currency) : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        {entry.amountCents ? formatMoney(entry.amountCents, currency) : "—"}
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px] truncate text-muted-foreground">
                        {entry.notes ?? "—"}
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

/** One line of the إجمالي المباع breakdown. Mirrors DetailRow on the web page. */
function CardDetail({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          emphasis
            ? "text-sm font-semibold text-emerald-600 dark:text-emerald-400"
            : "text-xs font-medium text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}
