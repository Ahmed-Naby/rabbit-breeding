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
import { finalizeMother, type FinalizeMotherFormState } from "../rabbits/actions";

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
export function PendingMothersTable({ rows }: { rows: PendingMotherRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="لا توجد سلالات أنثى في الانتظار"
        description="سلالة أنثى تم ترقيمها بقفص من صفحة السلالات هتظهر هنا لحد ما تحدد رقم الأم."
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="[&>th]:border-x">
            <TableHead className="text-center">النوع</TableHead>
            <TableHead className="text-center">الوزن</TableHead>
            <TableHead className="text-center">رقم القفص</TableHead>
            <TableHead className="text-center">رقم الأم</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="[&>td]:border-x [&>td]:text-center">
              <TableCell>{r.breed ?? "—"}</TableCell>
              <FinalizeMotherRowCells id={r.id} weightKg={r.weightKg} cage={r.cage} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FinalizeMotherRowCells({
  id,
  weightKg,
  cage,
}: {
  id: string;
  weightKg: number | null;
  cage: string | null;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    FinalizeMotherFormState,
    FormData
  >(finalizeMother, EMPTY_FORM_STATE);
  const formId = `finalize-mother-${id}`;

  useEffect(() => {
    if (state.ok) {
      toast.success("تمت إضافتها إلى الأمهات");
      router.refresh();
    }
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
          placeholder="كجم"
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
            placeholder="رقم الأم"
            disabled={isPending}
            className="h-7 w-16 rounded-md border border-input bg-transparent px-1.5 text-center text-xs disabled:opacity-50"
          />
          <button
            type="submit"
            form={formId}
            disabled={isPending}
            className="h-7 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
          >
            إضافة إلى الأمهات
          </button>
        </div>
        {e.tagId ? (
          <p className="mt-1 text-[10px] text-destructive">{e.tagId}</p>
        ) : null}
      </TableCell>
    </>
  );
}
