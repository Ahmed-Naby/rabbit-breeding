"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import { resetOperations } from "./actions";

/**
 * Danger-zone card for the "delete all operations" reset. The action is
 * irreversible and farm-wide, so the destructive button stays disabled until
 * the owner types the confirmation phrase verbatim — the only friction on the
 * web surface (unlike the sync API route, which also enforces a body-level
 * confirm phrase).
 */
export function DangerZone({ t }: { t: Dictionary["settings"] }) {
  const [confirmText, setConfirmText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const armed = confirmText.trim() === t.resetOpsConfirmWord;

  const handleReset = () => {
    if (!armed) return;
    start(async () => {
      try {
        await resetOperations();
        setConfirmText("");
        toast.success(t.resetOpsSuccessToast);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  };

  return (
    <Card className="border-destructive/40">
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-destructive">
            <TriangleAlert className="size-5" />
            {t.dangerZoneHeading}
          </h2>
          <p className="text-sm text-muted-foreground">{t.resetOpsDescription}</p>
          <p className="text-sm font-medium text-muted-foreground">{t.resetOpsKeepNote}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-semibold" htmlFor="reset-ops-confirm">
              {t.resetOpsConfirmLabel(t.resetOpsConfirmWord)}
            </label>
            <Input
              id="reset-ops-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t.resetOpsConfirmWord}
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={!armed || pending}
            onClick={handleReset}
            className="gap-2"
          >
            <TriangleAlert className="size-4" />
            {pending ? t.resettingOpsLabel : t.resetOpsButton}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
