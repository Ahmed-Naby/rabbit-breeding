"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NursingKitDeathButton } from "./mortality-actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export type NursingDoeOption = {
  id: string;
  tagId: string | null;
  breed: string | null;
  breedingId: string;
  bornAlive: number;
  bornDead: number;
};

/**
 * "نافق الرضاعة" entry. Every nursing doe on the farm used to be listed at
 * once, which on a real herd is hundreds of rows to scroll past to reach the
 * two the farmer actually came to record. Instead she is looked up by the
 * number he already has in hand, and «اعرض» adds her row to a short working
 * table that builds up over the session.
 *
 * The full list is passed down (six small fields per doe) so the lookup and
 * the "no such doe" feedback resolve as he types, with no round trip.
 */
export function NursingDeathForm({
  does,
  locale,
}: {
  does: NursingDoeOption[];
  locale: Locale;
}) {
  const t = getClientDictionary(locale).mortality;
  const [tag, setTag] = useState("");
  const [shownIds, setShownIds] = useState<string[]>([]);

  const query = tag.trim();
  const match = useMemo(
    () => (query ? (does.find((d) => (d.tagId ?? "").trim() === query) ?? null) : null),
    [does, query],
  );
  const notFound = query.length > 0 && !match;

  // Rows are re-read from `does` on every render rather than copied into state
  // when added: recording a death revalidates the page, and the counts in the
  // table have to be the fresh ones. A doe drops out of `does` once her last
  // live kit is gone — there is nothing left to record for her, so her row
  // disappearing here is the correct outcome, not a lost row.
  const rows = useMemo(
    () =>
      shownIds
        .map((id) => does.find((d) => d.id === id))
        .filter((d): d is NursingDoeOption => d != null),
    [shownIds, does],
  );

  const submit = () => {
    if (!match) return;
    setShownIds((prev) => (prev.includes(match.id) ? prev : [...prev, match.id]));
    setTag("");
  };

  return (
    <div className="space-y-3">
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
              <label className="text-sm font-semibold" htmlFor="nursing-death-tag">
                {t.colMotherTag}
              </label>
              <Input
                id="nursing-death-tag"
                inputMode="numeric"
                autoComplete="off"
                value={tag}
                placeholder={t.motherTagPlaceholder}
                onChange={(e) => setTag(e.target.value)}
              />
            </div>
            {/* Filled in from the matched doe — confirmation that the typed
                number is the right doe, never something to edit. */}
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-semibold" htmlFor="nursing-death-breed">
                {t.colBreed}
              </label>
              <Input
                id="nursing-death-breed"
                readOnly
                tabIndex={-1}
                value={match ? (match.breed ?? "—") : ""}
                className="bg-muted/50 font-medium"
              />
            </div>
            <Button type="submit" variant="outline" disabled={!match} className="h-9 px-4 text-xs">
              {t.showRowButton}
            </Button>
          </form>
          {notFound ? (
            <p className="text-sm font-medium text-destructive">{t.nursingMotherNotFound}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t.nursingFormHint}</p>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x [&>th]:text-center">
                <TableHead className="text-center">{t.colIndex}</TableHead>
                <TableHead className="text-center">{t.colMotherTag}</TableHead>
                <TableHead className="text-center">{t.colBreed}</TableHead>
                <TableHead className="text-center">{t.colAlive}</TableHead>
                <TableHead className="text-center">{t.colDead}</TableHead>
                <TableHead className="text-center">{t.colRecordDeath}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((doe, i) => (
                <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                      {doe.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{doe.breed ?? "—"}</TableCell>
                  <TableCell>{doe.bornAlive}</TableCell>
                  <TableCell>{doe.bornDead}</TableCell>
                  <TableCell>
                    <NursingKitDeathButton
                      breedingId={doe.breedingId}
                      bornAlive={doe.bornAlive}
                      locale={locale}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t.removeRowLabel}
                      title={t.removeRowLabel}
                      className="size-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setShownIds((prev) => prev.filter((id) => id !== doe.id))}
                    >
                      <X className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
