"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { setRabbitStatus } from "../rabbits/actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export type MortalityTagOption = { id: string; tagId: string | null; breed: string | null };

/**
 * "نافق الأمهات" / "نافق الذكور" entry: the herd is far too long to scan as a
 * table just to kill one row, so the rabbit is looked up by the number the
 * farmer already knows. The whole active list is passed down (it's only
 * id/tag/breed) so the match — and the "no such rabbit" feedback — resolve as
 * they type, without a round trip. Recording still goes through the same
 * setRabbitStatus the rabbit detail page uses, so the rabbit leaves every
 * active board and lands on the deceased log below.
 */
export function RabbitDeathForm({
  rabbits,
  locale,
  kind,
}: {
  rabbits: MortalityTagOption[];
  locale: Locale;
  kind: "doe" | "buck";
}) {
  const t = getClientDictionary(locale).mortality;
  const labels =
    kind === "doe"
      ? {
          tag: t.colMotherTag,
          placeholder: t.motherTagPlaceholder,
          notFound: t.motherNotFound,
          hint: t.mothersFormHint,
          confirm: t.motherDeathConfirm,
        }
      : {
          tag: t.colBuckTag,
          placeholder: t.buckTagPlaceholder,
          notFound: t.buckNotFound,
          hint: t.bucksFormHint,
          confirm: t.buckDeathConfirm,
        };

  const [tag, setTag] = useState("");
  const [pending, startTransition] = useTransition();

  const query = tag.trim();
  const match = useMemo(
    () => (query ? (rabbits.find((r) => (r.tagId ?? "").trim() === query) ?? null) : null),
    [rabbits, query],
  );
  const notFound = query.length > 0 && !match;

  const submit = () => {
    if (!match || pending) return;
    const confirmed = window.confirm(labels.confirm(match.tagId ?? ""));
    if (!confirmed) return;
    startTransition(async () => {
      await setRabbitStatus(match.id, "deceased");
      toast.success(t.deceasedToast);
      setTag("");
    });
  };

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-semibold" htmlFor={`${kind}-death-tag`}>
              {labels.tag}
            </label>
            <Input
              id={`${kind}-death-tag`}
              inputMode="numeric"
              autoComplete="off"
              value={tag}
              disabled={pending}
              placeholder={labels.placeholder}
              onChange={(e) => setTag(e.target.value)}
            />
          </div>
          {/* النوع is filled in from the matched rabbit — it's confirmation that
              the typed number is the right rabbit, never something to edit. */}
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-semibold" htmlFor={`${kind}-death-breed`}>
              {t.colBreed}
            </label>
            <Input
              id={`${kind}-death-breed`}
              readOnly
              tabIndex={-1}
              value={match ? (match.breed ?? "—") : ""}
              className="bg-muted/50 font-medium"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={!match || pending}
            className="h-9 px-4 text-xs border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
          >
            {t.recordDeceasedButton}
          </Button>
        </form>
        {notFound ? (
          <p className="text-sm font-medium text-destructive">{labels.notFound}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{labels.hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
