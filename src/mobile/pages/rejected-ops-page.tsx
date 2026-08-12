/**
 * «العمليات المرفوضة» — the writes the server refused, which until now nothing
 * on this device ever mentioned.
 *
 * The offline app applies every press to the local mirror immediately and
 * queues the real operation for later. When the server later refuses one, the
 * outbox row is stamped 'rejected' and that is the end of it: push() only ever
 * selects 'pending', hasUnsyncedOps() deliberately skips 'rejected', and no
 * screen read the table. So the phone went on showing a weaning the farm never
 * recorded, forever, and the only symptom was a number that disagreed with the
 * web report months later.
 *
 * This page is the missing end of that path. It does not prevent rejections —
 * some rejections are correct and a barn is better off with them — it ends the
 * silence around them, and hands the farmer the two decisions that were always
 * his: send it again, or let it go.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocalDate } from "@/components/local-date";
import { PageHeader } from "@/components/page-header";
import {
  listRejectedOps,
  retryRejectedOp,
  dismissRejectedOp,
  dismissAllRejectedOps,
  syncNow,
  type RejectedOp,
} from "../sync/sync-manager";

/** Module-level so LocalDate's effect doesn't re-run on every render. */
const STAMP_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * The server's answer, in a sentence.
 *
 * Its `resultMessage` is a code for a deliberate refusal and a raw Prisma
 * sentence for anything that merely blew up, and neither is readable in a barn.
 * A known code becomes Arabic; anything else is shown verbatim behind a label
 * that says where it came from, because a message we cannot translate is still
 * far better than pretending there wasn't one.
 */
function reasonText(op: RejectedOp, t: ReturnType<typeof getClientDictionary>): string {
  const raw = (op.resultMessage ?? "").trim();
  if (!raw) return t.syncRejected.unknownReason;
  return t.syncRejected.reasons[raw] ?? t.syncRejected.rawReason(raw);
}

export function RejectedOpsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [ops, setOps] = useState<RejectedOp[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setOps(await listRejectedOps());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = async (op: RejectedOp) => {
    setBusy(op.clientOpId);
    await retryRejectedOp(op.clientOpId);
    await load();
    setBusy(null);
    toast.success(t.syncRejected.retryQueued);
    // Fire-and-forget: offline it simply flips the bar to «غير متصل», and the
    // op stays pending for the next cycle either way.
    void syncNow();
  };

  const handleDismiss = async (op: RejectedOp) => {
    if (!window.confirm(t.syncRejected.dismissConfirm)) return;
    setBusy(op.clientOpId);
    await dismissRejectedOp(op.clientOpId);
    await load();
    setBusy(null);
  };

  const handleDismissAll = async () => {
    if (!window.confirm(t.syncRejected.dismissAllConfirm)) return;
    setBusy("*");
    await dismissAllRejectedOps();
    await load();
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-6 text-amber-600 dark:text-amber-500" />
            {t.syncRejected.title}
          </span>
        }
        description={t.syncRejected.subtitle}
      />

      {ops === null ? null : ops.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t.syncRejected.empty}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDismissAll()}
              disabled={busy !== null}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
              {t.syncRejected.dismissAll}
            </Button>
          </div>

          {/* Cards rather than a table: three of the four fields are prose of
              unpredictable length, and each row carries its own two buttons. */}
          <div className="space-y-3">
            {ops.map((op) => (
              <Card key={op.clientOpId} className="border-amber-300/70 dark:border-amber-800/70">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {t.syncRejected.opTypes[op.opType] ?? op.opType}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {/* With the hour: several of the real rejections were the
                          same press repeated minutes apart, and the date alone
                          collapses them into one indistinguishable day. */}
                      <LocalDate date={op.clientAt} options={STAMP_OPTS} locale={locale} />
                    </span>
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-400">{reasonText(op, t)}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRetry(op)}
                      disabled={busy !== null}
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t.syncRejected.retry}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleDismiss(op)}
                      disabled={busy !== null}
                      className="text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t.syncRejected.dismiss}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
