"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EMPTY_FORM_STATE } from "@/lib/form";
import { finalizeBuck, type FinalizeBuckFormState } from "../rabbits/actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export type PendingBuckRow = {
  id: string;
  breed: string | null;
  cage: string | null;
  weightKg: number | null;
};

/**
 * Second step of a buck's two-stage intake: he already has a cage number and
 * weight, assigned via the finalize step on /stock — this table just asks
 * for his رقم الذكر (a number distinct from his cage) to actually add him to
 * the bucks herd (see finalizeBuck).
 */
export function PendingBucksTable({
  rows,
  locale = "ar",
}: {
  rows: PendingBuckRow[];
  locale?: Locale;
}) {
  const t = getClientDictionary(locale).bucks;
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
      <Table>
        <TableHeader>
          <TableRow className="[&>th]:border-x">
            <TableHead className="text-center">{t.colBreed}</TableHead>
            <TableHead className="text-center">{t.colWeight}</TableHead>
            <TableHead className="text-center">{t.colCage}</TableHead>
            <TableHead className="text-center">{t.colBuckTag}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
              <TableCell>{r.breed ?? "—"}</TableCell>
              <FinalizeBuckRowCells id={r.id} weightKg={r.weightKg} cage={r.cage} locale={locale} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FinalizeBuckRowCells({
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
  const t = getClientDictionary(locale).bucks;
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    FinalizeBuckFormState,
    FormData
  >(finalizeBuck, EMPTY_FORM_STATE);
  const formId = `finalize-buck-${id}`;

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
          step="0.001"
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
