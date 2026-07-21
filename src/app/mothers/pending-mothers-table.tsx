"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { finalizeMother, type FinalizeMotherFormState } from "../rabbits/actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export type PendingMotherRow = {
  id: string;
  breed: string | null;
  cage: string | null;
  weightKg: number | null;
};

/**
 * Second step of a doe's two-stage intake: she already has a cage number and
 * weight, assigned via the finalize step on /stock — this table just asks
 * for her رقم الأم (a number distinct from her cage) to actually add her to
 * the mothers herd (see finalizeMother).
 */
export function PendingMothersTable({
  rows,
  locale = "ar",
}: {
  rows: PendingMotherRow[];
  locale?: Locale;
}) {
  const t = getClientDictionary(locale).mothers;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title={t.pendingEmptyTitle}
        description={t.pendingEmptyDescription}
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <SortableTable
        headerRowClassName="[&>th]:border-x"
        columns={[
          { key: "breed", label: t.colBreed, type: "string", className: "text-center" },
          { key: "weight", label: t.colWeight, type: "number", className: "text-center" },
          { key: "cage", label: t.colCage, type: "tag", className: "text-center" },
          { key: "tag", label: t.colMotherTag, className: "text-center", sortable: false },
        ]}
        rows={rows.map((r) => ({
          key: r.id,
          sortValues: { breed: r.breed, weight: r.weightKg, cage: r.cage },
          node: (
            <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
              <TableCell>{r.breed ?? "—"}</TableCell>
              <FinalizeMotherRowCells id={r.id} weightKg={r.weightKg} cage={r.cage} locale={locale} />
            </TableRow>
          ),
        }))}
      />
    </div>
  );
}

function FinalizeMotherRowCells({
  id,
  weightKg,
  cage,
  locale,
}: {
  id: string;
  weightKg: number | null;
  cage: string | null;
  locale: Locale;
}) {
  const t = getClientDictionary(locale).mothers;
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    FinalizeMotherFormState,
    FormData
  >(finalizeMother, EMPTY_FORM_STATE);
  const formId = `finalize-mother-${id}`;

  useEffect(() => {
    if (state.ok) {
      toast.success(t.finalizedToast);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router]);

  const e = state.errors ?? {};

  return (
    <>
      <TableCell>
        <form id={formId} action={formAction}>
          <input type="hidden" name="id" value={id} />
        </form>
        <input
          type="number"
          name="weightKg"
          form={formId}
          step="0.25"
          min={0}
          required
          defaultValue={weightKg ?? undefined}
          placeholder={t.weightPlaceholderShort}
          disabled={isPending}
          className="h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50"
        />
        {e.weightKg ? (
          <p className="mt-1 text-[10px] text-destructive">{e.weightKg}</p>
        ) : null}
      </TableCell>
      <TableCell>{cage ?? "—"}</TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-1.5">
          <input
            type="text"
            name="tagId"
            form={formId}
            maxLength={10}
            required
            placeholder={t.tagPlaceholderShort}
            disabled={isPending}
            className="h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50"
          />
          <button
            type="submit"
            form={formId}
            disabled={isPending}
            className="h-7 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
          >
            {t.finalizeButton}
          </button>
        </div>
        {e.tagId ? (
          <p className="mt-1 text-[10px] text-destructive">{e.tagId}</p>
        ) : null}
      </TableCell>
    </>
  );
}
